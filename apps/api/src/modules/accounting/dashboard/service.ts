import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';

export type DashboardClient = PrismaClient | Prisma.TransactionClient;

export interface FiscalDashboardResponse {
  fiscalYears: FiscalDashboardYear[];
  currentFiscalYear: FiscalDashboardYear | null;
  journals: FiscalDashboardJournal[];
}

export interface FiscalDashboardYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  lockedAt: string | null;
  status: 'OPEN' | 'LOCKED';
  isCurrent: boolean;
}

export interface FiscalDashboardJournal {
  id: string;
  code: string;
  name: string;
  nextReference: string | null;
  lastReference: string | null;
  lastEntryDate: string | null;
}

export async function getFiscalDashboard(
  client: DashboardClient,
  organizationId: string
): Promise<FiscalDashboardResponse> {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) {
    throw new HttpProblemError({
      status: 404,
      title: 'ORGANIZATION_NOT_FOUND',
      detail: 'The requested organization does not exist.',
    });
  }

  const fiscalYears = await client.fiscalYear.findMany({
    where: { organizationId },
    orderBy: { startDate: 'desc' },
  });

  const currentFiscalYear =
    fiscalYears.find((fiscalYear) => fiscalYear.lockedAt === null) ?? fiscalYears.at(0) ?? null;

  const dashboardYears: FiscalDashboardYear[] = fiscalYears.map((fiscalYear) => ({
    id: fiscalYear.id,
    label: fiscalYear.label,
    startDate: toIsoDate(fiscalYear.startDate),
    endDate: toIsoDate(fiscalYear.endDate),
    lockedAt: fiscalYear.lockedAt ? toIsoDate(fiscalYear.lockedAt) : null,
    status: fiscalYear.lockedAt ? 'LOCKED' : 'OPEN',
    isCurrent: currentFiscalYear ? fiscalYear.id === currentFiscalYear.id : false,
  }));

  const journals = await client.journal.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });

  if (!currentFiscalYear || journals.length === 0) {
    return {
      fiscalYears: dashboardYears,
      currentFiscalYear: currentFiscalYear
        ? dashboardYears.find((year) => year.id === currentFiscalYear.id) ?? null
        : null,
      journals: journals.map((journal) => ({
        id: journal.id,
        code: journal.code,
        name: journal.name,
        nextReference: null,
        lastReference: null,
        lastEntryDate: null,
      })),
    } satisfies FiscalDashboardResponse;
  }

  const sequences = await client.sequenceNumber.findMany({
    where: { organizationId, fiscalYearId: currentFiscalYear.id },
    select: { journalId: true, nextValue: true },
  });
  const sequenceByJournal = new Map(sequences.map((sequence) => [sequence.journalId, sequence]));

  const latestEntries = await client.entry.findMany({
    where: { organizationId, fiscalYearId: currentFiscalYear.id },
    orderBy: [
      { journalId: 'asc' },
      { date: 'desc' },
      { reference: 'desc' },
      { id: 'desc' },
    ],
    distinct: ['journalId'],
    select: { journalId: true, reference: true, date: true },
  });
  const lastEntryByJournal = new Map(latestEntries.map((entry) => [entry.journalId, entry]));

  const formattedCurrentYear = dashboardYears.find((year) => year.id === currentFiscalYear.id) ?? null;

  const journalSummaries = journals.map((journal) => {
    const sequence = sequenceByJournal.get(journal.id);
    const lastEntry = lastEntryByJournal.get(journal.id);

    const nextValueFromSequence = sequence?.nextValue ?? null;
    const lastValueFromSequence =
      nextValueFromSequence && nextValueFromSequence > 1 ? nextValueFromSequence - 1 : null;

    const lastReference = lastEntry?.reference ??
      (lastValueFromSequence
        ? formatEntryReference(journal.code, currentFiscalYear.startDate, lastValueFromSequence)
        : null);

    const nextReference = (() => {
      if (nextValueFromSequence) {
        return formatEntryReference(journal.code, currentFiscalYear.startDate, nextValueFromSequence);
      }

      if (lastEntry?.reference) {
        const incremented = incrementReference(lastEntry.reference);
        if (incremented) {
          return incremented;
        }
      }

      return formatEntryReference(journal.code, currentFiscalYear.startDate, 1);
    })();

    return {
      id: journal.id,
      code: journal.code,
      name: journal.name,
      nextReference,
      lastReference,
      lastEntryDate: lastEntry ? toIsoDate(lastEntry.date) : null,
    } satisfies FiscalDashboardJournal;
  });

  return {
    fiscalYears: dashboardYears,
    currentFiscalYear: formattedCurrentYear,
    journals: journalSummaries,
  } satisfies FiscalDashboardResponse;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatEntryReference(journalCode: string, fiscalYearStart: Date, sequenceValue: number): string {
  const year = fiscalYearStart.getUTCFullYear();
  const normalizedCode = journalCode.trim().toUpperCase();
  const paddedSequence = Math.max(sequenceValue, 1).toString().padStart(6, '0');
  return `${year}-${normalizedCode}-${paddedSequence}`;
}

function incrementReference(reference: string): string | null {
  const match = reference.match(/^(.*?)(\d+)([^\d]*)$/);
  if (!match) {
    return null;
  }

  const [, prefix, numeric, suffix] = match;
  const nextNumber = (Number.parseInt(numeric, 10) || 0) + 1;
  const padded = nextNumber.toString().padStart(numeric.length, '0');
  return `${prefix}${padded}${suffix ?? ''}`;
}
