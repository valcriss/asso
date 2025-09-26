import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../lib/problem-details';
import type { ObjectStorage } from '../../plugins/object-storage';
import {
  createDonationInputSchema,
  donationExportQuerySchema,
  listDonationsQuerySchema,
  type DonationExportQuery,
  type ListDonationsQuery,
} from './schemas';
import { generateDonationReceiptPdf } from './pdf';

export type DonationClient = PrismaClient | Prisma.TransactionClient;

interface ListDonationsOptions {
  pagination?: {
    limit: number;
    offset: number;
  };
}

export async function createDonation(
  client: DonationClient,
  storage: ObjectStorage,
  organizationId: string,
  input: unknown
) {
  const parsed = createDonationInputSchema.parse(input);
  const currency = parsed.currency ?? 'EUR';

  const entry = await client.entry.findFirst({
    where: { id: parsed.entryId, organizationId },
    include: {
      fiscalYear: true,
      organization: true,
    },
  });

  if (!entry || !entry.fiscalYear || !entry.organization) {
    throw new HttpProblemError({
      status: 404,
      title: 'ENTRY_NOT_FOUND_FOR_DONATION',
      detail: 'The specified accounting entry does not exist for this organization.',
    });
  }

  const fiscalYear = entry.fiscalYear;
  const organization = entry.organization;

  if (parsed.receivedAt < fiscalYear.startDate || parsed.receivedAt > fiscalYear.endDate) {
    throw new HttpProblemError({
      status: 422,
      title: 'DONATION_DATE_OUT_OF_RANGE',
      detail: 'The donation date must fall within the selected fiscal year.',
    });
  }

  const totals = await client.entryLine.aggregate({
    where: { entryId: entry.id },
    _sum: { debit: true },
  });

  const entryTotal = totals._sum.debit ?? new Prisma.Decimal(0);
  if (!entryTotal.equals(parsed.amount)) {
    throw new HttpProblemError({
      status: 422,
      title: 'DONATION_AMOUNT_MISMATCH',
      detail: 'The donation amount must match the total amount of the linked entry.',
    });
  }

  const receiptSequence = await reserveDonationReceiptNumber(client, {
    organizationId,
    fiscalYearId: fiscalYear.id,
  });
  const receiptNumber = formatReceiptNumber(fiscalYear.startDate, receiptSequence);
  const issuedAt = new Date();

  const pdfBytes = await generateDonationReceiptPdf({
    organizationName: organization.name,
    organizationId: organization.id,
    fiscalYearLabel: fiscalYear.label,
    receiptNumber,
    donorName: parsed.donor.name,
    donorEmail: parsed.donor.email,
    donorAddress: parsed.donor.address,
    amount: parsed.amount,
    currency,
    receivedAt: parsed.receivedAt,
    issuedAt,
    entryReference: entry.reference,
  });

  const pdfBuffer = Buffer.from(pdfBytes);
  const receiptHash = createHash('sha256').update(pdfBuffer).digest('hex');

  const storageKey = buildReceiptStorageKey(organizationId, fiscalYear.id, receiptNumber);
  const { url: receiptUrl } = await storage.putObject({
    key: storageKey,
    body: pdfBuffer,
    contentType: 'application/pdf',
  });

  try {
    return await client.donation.create({
      data: {
        organizationId,
        fiscalYearId: fiscalYear.id,
        entryId: entry.id,
        donorName: parsed.donor.name,
        donorEmail: parsed.donor.email ?? null,
        donorAddress: parsed.donor.address ?? null,
        amount: parsed.amount,
        currency,
        receiptNumber,
        receiptHash,
        receiptUrl,
        receivedAt: parsed.receivedAt,
        issuedAt,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error, 'donation_entry_id_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'DONATION_ALREADY_EXISTS',
        detail: 'A donation receipt has already been issued for this accounting entry.',
      });
    }

    throw error;
  }
}

export async function listDonations(
  client: DonationClient,
  organizationId: string,
  query: ListDonationsQuery | undefined,
  options: ListDonationsOptions = {}
) {
  const parsedQuery = listDonationsQuerySchema.parse(query ?? {});

  const where: Prisma.DonationWhereInput = {
    organizationId,
  };

  if (parsedQuery.fiscalYearId) {
    where.fiscalYearId = parsedQuery.fiscalYearId;
  }

  const [items, total] = await Promise.all([
    client.donation.findMany({
      where,
      orderBy: [
        { receivedAt: 'desc' },
        { receiptNumber: 'desc' },
      ],
      skip: options.pagination?.offset,
      take: options.pagination?.limit,
    }),
    client.donation.count({ where }),
  ]);

  return { items, total };
}

export async function exportDonations(
  client: DonationClient,
  organizationId: string,
  query: DonationExportQuery | undefined
) {
  const parsed = donationExportQuerySchema.parse(query ?? {});

  const fiscalYear = await client.fiscalYear.findFirst({
    where: { id: parsed.fiscalYearId, organizationId },
  });

  if (!fiscalYear) {
    throw new HttpProblemError({
      status: 404,
      title: 'FISCAL_YEAR_NOT_FOUND',
      detail: 'The requested fiscal year does not exist for this organization.',
    });
  }

  const donations = await client.donation.findMany({
    where: { organizationId, fiscalYearId: parsed.fiscalYearId },
    orderBy: [
      { receivedAt: 'asc' },
      { receiptNumber: 'asc' },
    ],
  });

  const header = [
    'Receipt Number',
    'Received At',
    'Issued At',
    'Donor Name',
    'Donor Email',
    'Donor Address',
    'Amount',
    'Currency',
    'Receipt URL',
    'Receipt Hash',
  ].join(';');

  const rows = donations.map((donation) =>
    [
      donation.receiptNumber,
      formatDate(donation.receivedAt),
      formatDate(donation.issuedAt),
      donation.donorName,
      donation.donorEmail ?? '',
      donation.donorAddress?.replace(/\r?\n/g, ' ') ?? '',
      donation.amount.toFixed(2),
      donation.currency,
      donation.receiptUrl,
      donation.receiptHash,
    ].join(';')
  );

  const csv = [header, ...rows].join('\n');

  return { csv, fiscalYear };
}

function formatReceiptNumber(fiscalYearStart: Date, sequenceValue: number): string {
  const year = fiscalYearStart.getUTCFullYear();
  const padded = sequenceValue.toString().padStart(6, '0');
  return `${year}-DON-${padded}`;
}

async function reserveDonationReceiptNumber(
  client: DonationClient,
  params: { organizationId: string; fiscalYearId: string }
): Promise<number> {
  const result = await client.$queryRaw<{ current_value: bigint | number }[]>(
    Prisma.sql`
      INSERT INTO "donation_receipt_sequence" ("organization_id", "fiscal_year_id", "next_value", "updated_at")
      VALUES (${params.organizationId}::uuid, ${params.fiscalYearId}::uuid, 2, NOW())
      ON CONFLICT ("organization_id", "fiscal_year_id")
      DO UPDATE SET "next_value" = "donation_receipt_sequence"."next_value" + 1, "updated_at" = NOW()
      RETURNING "next_value" - 1 AS current_value
    `
  );

  const row = result[0];
  if (!row) {
    throw new HttpProblemError({
      status: 500,
      title: 'DONATION_SEQUENCE_RESERVATION_FAILED',
      detail: 'Failed to reserve a receipt number for the donation.',
    });
  }

  const currentValue = typeof row.current_value === 'bigint' ? Number(row.current_value) : Number(row.current_value);
  if (!Number.isFinite(currentValue)) {
    throw new HttpProblemError({
      status: 500,
      title: 'DONATION_SEQUENCE_RESERVATION_FAILED',
      detail: 'Invalid receipt sequence generated for the donation.',
    });
  }

  return currentValue;
}

function buildReceiptStorageKey(organizationId: string, fiscalYearId: string, receiptNumber: string): string {
  const sanitizedNumber = receiptNumber.replace(/[^A-Za-z0-9_-]/g, '-');
  return `donations/${organizationId}/${fiscalYearId}/${sanitizedNumber}.pdf`;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    (error.meta?.target as string[]).includes(constraint)
  );
}
