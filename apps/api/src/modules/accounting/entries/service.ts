import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createEntryInputSchema } from './schemas';
import { HttpProblemError } from '../../../lib/problem-details';

export type EntryClient = PrismaClient | Prisma.TransactionClient;

export async function createEntry(
  client: EntryClient,
  organizationId: string,
  userId: string,
  input: unknown
) {
  const parsed = createEntryInputSchema.parse(input);

  const fiscalYear = await client.fiscalYear.findFirst({
    where: { id: parsed.fiscalYearId, organizationId },
  });

  if (!fiscalYear) {
    throw new HttpProblemError({
      status: 404,
      title: 'FISCAL_YEAR_NOT_FOUND',
      detail: 'The specified fiscal year does not exist for this organization.',
    });
  }

  if (fiscalYear.lockedAt) {
    throw new HttpProblemError({
      status: 403,
      title: 'FISCAL_YEAR_LOCKED',
      detail: 'The fiscal year is locked and cannot accept new entries.',
    });
  }

  const entryDate = parsed.date;
  if (entryDate < fiscalYear.startDate || entryDate > fiscalYear.endDate) {
    throw new HttpProblemError({
      status: 422,
      title: 'ENTRY_DATE_OUT_OF_RANGE',
      detail: 'Entry date must fall within the fiscal year boundaries.',
    });
  }

  const journal = await client.journal.findFirst({
    where: { id: parsed.journalId, organizationId },
  });

  if (!journal) {
    throw new HttpProblemError({
      status: 404,
      title: 'JOURNAL_NOT_FOUND',
      detail: 'The specified journal does not exist for this organization.',
    });
  }

  const accountIds = Array.from(new Set(parsed.lines.map((line) => line.accountId)));
  const accounts = await client.account.findMany({
    where: { organizationId, id: { in: accountIds } },
    select: { id: true },
  });

  if (accounts.length !== accountIds.length) {
    throw new HttpProblemError({
      status: 404,
      title: 'ACCOUNT_NOT_FOUND',
      detail: 'One or more accounts referenced by the entry do not exist.',
    });
  }

  const projectIds = Array.from(
    new Set(
      parsed.lines
        .map((line) => line.projectId)
        .filter((projectId): projectId is string => typeof projectId === 'string')
    )
  );

  if (projectIds.length > 0) {
    const projects = await client.project.findMany({
      where: { organizationId, id: { in: projectIds } },
      select: { id: true },
    });

    if (projects.length !== projectIds.length) {
      throw new HttpProblemError({
        status: 404,
        title: 'PROJECT_NOT_FOUND',
        detail: 'One or more projects referenced by the entry do not exist in this organization.',
      });
    }
  }

  const zero = new Prisma.Decimal(0);
  const totalDebit = parsed.lines.reduce(
    (sum, line) => sum.add(line.debit),
    zero
  );
  const totalCredit = parsed.lines.reduce(
    (sum, line) => sum.add(line.credit),
    zero
  );

  if (!totalDebit.equals(totalCredit)) {
    throw new HttpProblemError({
      status: 422,
      title: 'ENTRY_NOT_BALANCED',
      detail: 'Sum of debit lines must equal sum of credit lines.',
    });
  }

  if (totalDebit.isZero()) {
    throw new HttpProblemError({
      status: 422,
      title: 'ENTRY_TOTAL_ZERO',
      detail: 'Entry must have a non-zero total amount.',
    });
  }

  const sequenceValue = await reserveSequenceNumber(client, {
    organizationId,
    fiscalYearId: parsed.fiscalYearId,
    journalId: parsed.journalId,
  });

  const reference = formatEntryReference(journal.code, fiscalYear.startDate, sequenceValue);

  return client.entry.create({
    data: {
      organizationId,
      fiscalYearId: parsed.fiscalYearId,
      journalId: parsed.journalId,
      date: entryDate,
      reference,
      memo: parsed.memo,
      createdBy: userId,
      lines: {
        create: parsed.lines.map((line) => ({
          organizationId,
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          projectId: line.projectId ?? null,
        })),
      },
    },
    include: {
      lines: {
        orderBy: { id: 'asc' },
      },
    },
  });
}

export async function lockEntry(client: EntryClient, organizationId: string, entryId: string) {
  const existing = await client.entry.findFirst({
    where: { id: entryId, organizationId },
  });

  if (!existing) {
    throw new HttpProblemError({
      status: 404,
      title: 'ENTRY_NOT_FOUND',
      detail: 'The requested entry does not exist in this organization.',
    });
  }

  if (existing.lockedAt) {
    throw new HttpProblemError({
      status: 409,
      title: 'ENTRY_ALREADY_LOCKED',
      detail: 'The entry is already locked.',
    });
  }

  return client.entry.update({
    where: { id: existing.id },
    data: { lockedAt: new Date() },
    include: {
      lines: {
        orderBy: { id: 'asc' },
      },
    },
  });
}

async function reserveSequenceNumber(
  client: EntryClient,
  params: { organizationId: string; fiscalYearId: string; journalId: string }
): Promise<number> {
  const result = await client.$queryRaw<{ current_value: bigint | number }[]>(
    Prisma.sql`
      INSERT INTO "sequence_number" ("organization_id", "fiscal_year_id", "journal_id", "next_value")
      VALUES (${params.organizationId}::uuid, ${params.fiscalYearId}::uuid, ${params.journalId}::uuid, 2)
      ON CONFLICT ("organization_id", "fiscal_year_id", "journal_id")
      DO UPDATE SET "next_value" = "sequence_number"."next_value" + 1, "updated_at" = NOW()
      RETURNING "next_value" - 1 AS current_value
    `
  );

  const row = result[0];
  if (!row) {
    throw new HttpProblemError({
      status: 500,
      title: 'SEQUENCE_RESERVATION_FAILED',
      detail: 'Failed to reserve a sequence number for the entry.',
    });
  }

  const currentValue = typeof row.current_value === 'bigint' ? Number(row.current_value) : Number(row.current_value);
  if (!Number.isFinite(currentValue)) {
    throw new HttpProblemError({
      status: 500,
      title: 'SEQUENCE_RESERVATION_FAILED',
      detail: 'Invalid sequence number generated for the entry.',
    });
  }

  return currentValue;
}

function formatEntryReference(journalCode: string, fiscalYearStart: Date, sequenceValue: number): string {
  const year = fiscalYearStart.getUTCFullYear();
  const normalizedCode = journalCode.trim().toUpperCase();
  const paddedSequence = sequenceValue.toString().padStart(6, '0');
  return `${year}-${normalizedCode}-${paddedSequence}`;
}
