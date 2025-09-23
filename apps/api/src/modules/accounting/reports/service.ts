import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';

export type ReportClient = PrismaClient | Prisma.TransactionClient;

export interface FiscalYearSummary {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  lockedAt: string | null;
}

export interface JournalReportLine {
  lineId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalReportEntry {
  entryId: string;
  date: string;
  reference: string | null;
  memo: string | null;
  journal: {
    id: string;
    code: string;
    name: string;
  };
  lines: JournalReportLine[];
  totals: {
    debit: number;
    credit: number;
  };
}

export interface JournalReport {
  fiscalYear: FiscalYearSummary;
  entries: JournalReportEntry[];
  totals: {
    debit: number;
    credit: number;
  };
}

export interface LedgerReportMovement {
  lineId: string;
  entryId: string;
  date: string;
  reference: string | null;
  journalCode: string;
  journalName: string;
  memo: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerReportAccount {
  accountId: string;
  code: string;
  name: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  movements: LedgerReportMovement[];
}

export interface LedgerReport {
  fiscalYear: FiscalYearSummary;
  accounts: LedgerReportAccount[];
  totals: {
    debit: number;
    credit: number;
  };
}

export interface TrialBalanceLine {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalanceReport {
  fiscalYear: FiscalYearSummary;
  lines: TrialBalanceLine[];
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
}

export interface IncomeStatementRow {
  accountId: string;
  code: string;
  name: string;
  type: 'REVENUE' | 'EXPENSE';
  debit: number;
  credit: number;
  balance: number;
  result: number;
}

export interface IncomeStatementReport {
  fiscalYear: FiscalYearSummary;
  rows: IncomeStatementRow[];
  totals: {
    revenue: number;
    expense: number;
    net: number;
  };
}

export interface FecGenerationResult {
  fiscalYear: FiscalYearSummary;
  csv: string;
  checksum: string;
  rowCount: number;
}

const FEC_COLUMNS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
] as const;

const ZERO = new Prisma.Decimal(0);

export async function getJournalReport(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
): Promise<JournalReport> {
  const fiscalYear = await getFiscalYearOrThrow(client, organizationId, fiscalYearId);

  const entries = await client.entry.findMany({
    where: { organizationId, fiscalYearId },
    orderBy: [
      { date: 'asc' },
      { reference: 'asc' },
      { id: 'asc' },
    ],
    include: {
      journal: {
        select: { id: true, code: true, name: true },
      },
      lines: {
        orderBy: { id: 'asc' },
        include: {
          account: {
            select: { id: true, code: true, name: true },
          },
        },
      },
    },
  });

  let reportDebit = ZERO;
  let reportCredit = ZERO;

  const entrySummaries = entries.map((entry) => {
    let entryDebit = ZERO;
    let entryCredit = ZERO;

    const lines = entry.lines.map((line) => {
      entryDebit = entryDebit.add(line.debit);
      entryCredit = entryCredit.add(line.credit);

      return {
        lineId: line.id,
        accountId: line.accountId,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: decimalToNumber(line.debit),
        credit: decimalToNumber(line.credit),
      } satisfies JournalReportLine;
    });

    reportDebit = reportDebit.add(entryDebit);
    reportCredit = reportCredit.add(entryCredit);

    return {
      entryId: entry.id,
      date: toIsoDate(entry.date),
      reference: entry.reference,
      memo: entry.memo,
      journal: {
        id: entry.journal.id,
        code: entry.journal.code,
        name: entry.journal.name,
      },
      lines,
      totals: {
        debit: decimalToNumber(entryDebit),
        credit: decimalToNumber(entryCredit),
      },
    } satisfies JournalReportEntry;
  });

  return {
    fiscalYear: toFiscalYearSummary(fiscalYear),
    entries: entrySummaries,
    totals: {
      debit: decimalToNumber(reportDebit),
      credit: decimalToNumber(reportCredit),
    },
  } satisfies JournalReport;
}

export async function getLedgerReport(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
): Promise<LedgerReport> {
  const fiscalYear = await getFiscalYearOrThrow(client, organizationId, fiscalYearId);

  const lines = await client.entryLine.findMany({
    where: {
      organizationId,
      entry: { fiscalYearId },
    },
    orderBy: [
      { account: { code: 'asc' } },
      { entry: { date: 'asc' } },
      { entry: { reference: 'asc' } },
      { entry: { id: 'asc' } },
      { id: 'asc' },
    ],
    include: {
      account: { select: { id: true, code: true, name: true } },
      entry: {
        select: {
          id: true,
          date: true,
          reference: true,
          memo: true,
          journal: { select: { code: true, name: true } },
        },
      },
    },
  });

  const accountMap = new Map<string, {
    id: string;
    code: string;
    name: string;
    totalDebit: Prisma.Decimal;
    totalCredit: Prisma.Decimal;
    runningBalance: Prisma.Decimal;
    movements: LedgerReportMovement[];
  }>();

  let overallDebit = ZERO;
  let overallCredit = ZERO;

  for (const line of lines) {
    const existing = accountMap.get(line.accountId);

    let accountState = existing;
    if (!accountState) {
      accountState = {
        id: line.account.id,
        code: line.account.code,
        name: line.account.name,
        totalDebit: ZERO,
        totalCredit: ZERO,
        runningBalance: ZERO,
        movements: [],
      };
      accountMap.set(line.accountId, accountState);
    }

    accountState.totalDebit = accountState.totalDebit.add(line.debit);
    accountState.totalCredit = accountState.totalCredit.add(line.credit);
    accountState.runningBalance = accountState.runningBalance.add(line.debit).sub(line.credit);

    const movement: LedgerReportMovement = {
      lineId: line.id,
      entryId: line.entry.id,
      date: toIsoDate(line.entry.date),
      reference: line.entry.reference,
      journalCode: line.entry.journal.code,
      journalName: line.entry.journal.name,
      memo: line.entry.memo,
      debit: decimalToNumber(line.debit),
      credit: decimalToNumber(line.credit),
      balance: decimalToNumber(accountState.runningBalance),
    };

    accountState.movements.push(movement);
    overallDebit = overallDebit.add(line.debit);
    overallCredit = overallCredit.add(line.credit);
  }

  const accounts = Array.from(accountMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((account) => ({
      accountId: account.id,
      code: account.code,
      name: account.name,
      totalDebit: decimalToNumber(account.totalDebit),
      totalCredit: decimalToNumber(account.totalCredit),
      balance: decimalToNumber(account.runningBalance),
      movements: account.movements,
    })) satisfies LedgerReportAccount[];

  return {
    fiscalYear: toFiscalYearSummary(fiscalYear),
    accounts,
    totals: {
      debit: decimalToNumber(overallDebit),
      credit: decimalToNumber(overallCredit),
    },
  } satisfies LedgerReport;
}

export async function getTrialBalanceReport(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
): Promise<TrialBalanceReport> {
  const fiscalYear = await getFiscalYearOrThrow(client, organizationId, fiscalYearId);

  const grouped = await client.entryLine.groupBy({
    by: ['accountId'],
    where: {
      organizationId,
      entry: { fiscalYearId },
    },
    _sum: {
      debit: true,
      credit: true,
    },
  });

  if (grouped.length === 0) {
    return {
      fiscalYear: toFiscalYearSummary(fiscalYear),
      lines: [],
      totals: { debit: 0, credit: 0, balance: 0 },
    } satisfies TrialBalanceReport;
  }

  const accountIds = grouped.map((item) => item.accountId);
  const accounts = await client.account.findMany({
    where: { organizationId, id: { in: accountIds } },
    select: { id: true, code: true, name: true, type: true },
  });
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let totalDebit = ZERO;
  let totalCredit = ZERO;

  const lines = grouped
    .map((item) => {
      const account = accountById.get(item.accountId);
      if (!account) {
        return null;
      }

      const debit = (item._sum.debit ?? ZERO) as Prisma.Decimal;
      const credit = (item._sum.credit ?? ZERO) as Prisma.Decimal;
      const balance = debit.sub(credit);

      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);

      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: decimalToNumber(debit),
        credit: decimalToNumber(credit),
        balance: decimalToNumber(balance),
      } satisfies TrialBalanceLine;
    })
    .filter((line): line is TrialBalanceLine => line !== null)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalBalance = totalDebit.sub(totalCredit);

  return {
    fiscalYear: toFiscalYearSummary(fiscalYear),
    lines,
    totals: {
      debit: decimalToNumber(totalDebit),
      credit: decimalToNumber(totalCredit),
      balance: decimalToNumber(totalBalance),
    },
  } satisfies TrialBalanceReport;
}

export async function getIncomeStatementReport(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
): Promise<IncomeStatementReport> {
  const fiscalYear = await getFiscalYearOrThrow(client, organizationId, fiscalYearId);

  const accounts = await client.account.findMany({
    where: {
      organizationId,
      type: { in: ['REVENUE', 'EXPENSE'] },
      entryLines: { some: { entry: { fiscalYearId } } },
    },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: 'asc' },
  });

  if (accounts.length === 0) {
    return {
      fiscalYear: toFiscalYearSummary(fiscalYear),
      rows: [],
      totals: { revenue: 0, expense: 0, net: 0 },
    } satisfies IncomeStatementReport;
  }

  const grouped = await client.entryLine.groupBy({
    by: ['accountId'],
    where: {
      organizationId,
      entry: { fiscalYearId },
      account: { type: { in: ['REVENUE', 'EXPENSE'] } },
    },
    _sum: { debit: true, credit: true },
  });
  const groupByAccount = new Map(grouped.map((item) => [item.accountId, item]));

  let revenueTotal = ZERO;
  let expenseTotal = ZERO;

  const rows = accounts.map((account) => {
    const sums = groupByAccount.get(account.id);
    const debit = (sums?._sum.debit ?? ZERO) as Prisma.Decimal;
    const credit = (sums?._sum.credit ?? ZERO) as Prisma.Decimal;
    const balance = debit.sub(credit);

    if (account.type === 'REVENUE') {
      revenueTotal = revenueTotal.add(credit.sub(debit));
    } else {
      expenseTotal = expenseTotal.add(debit.sub(credit));
    }

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type as 'REVENUE' | 'EXPENSE',
      debit: decimalToNumber(debit),
      credit: decimalToNumber(credit),
      balance: decimalToNumber(balance),
      result:
        account.type === 'REVENUE'
          ? decimalToNumber(credit.sub(debit))
          : decimalToNumber(debit.sub(credit)),
    } satisfies IncomeStatementRow;
  });

  const netResult = revenueTotal.sub(expenseTotal);

  return {
    fiscalYear: toFiscalYearSummary(fiscalYear),
    rows,
    totals: {
      revenue: decimalToNumber(revenueTotal),
      expense: decimalToNumber(expenseTotal),
      net: decimalToNumber(netResult),
    },
  } satisfies IncomeStatementReport;
}

export async function generateFecReport(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
): Promise<FecGenerationResult> {
  const fiscalYear = await getFiscalYearOrThrow(client, organizationId, fiscalYearId);

  if (!fiscalYear.lockedAt) {
    throw new HttpProblemError({
      status: 403,
      title: 'FISCAL_YEAR_NOT_LOCKED',
      detail: 'FEC export requires a locked fiscal year.',
    });
  }

  const lines = await client.entryLine.findMany({
    where: { organizationId, entry: { fiscalYearId } },
    orderBy: [
      { entry: { date: 'asc' } },
      { entry: { reference: 'asc' } },
      { entry: { id: 'asc' } },
      { account: { code: 'asc' } },
      { id: 'asc' },
    ],
    include: {
      entry: {
        select: {
          id: true,
          date: true,
          reference: true,
          memo: true,
          journal: { select: { code: true, name: true } },
        },
      },
      account: { select: { code: true, name: true } },
    },
  });

  const rows = lines.map((line) => {
    const entry = line.entry;
    const account = line.account;
    const entryRef = entry.reference ?? entry.id;
    const entryDate = formatFecDate(entry.date);
    const memo = entry.memo ?? account.name;

    return [
      entry.journal.code,
      entry.journal.name,
      entryRef,
      entryDate,
      account.code,
      account.name,
      '',
      '',
      entry.reference ?? '',
      entryDate,
      memo,
      toFixed(line.debit),
      toFixed(line.credit),
      '',
      '',
      entryDate,
      '',
      '',
    ];
  });

  const csvLines = [formatCsvRow(FEC_COLUMNS), ...rows.map((row) => formatCsvRow(row))];
  const csv = csvLines.join('\n');
  const checksum = createHash('sha256').update(csv, 'utf8').digest('hex');

  await client.fecExport.create({
    data: {
      organizationId,
      fiscalYearId,
      checksum,
    },
  });

  return {
    fiscalYear: toFiscalYearSummary(fiscalYear),
    csv,
    checksum,
    rowCount: rows.length,
  } satisfies FecGenerationResult;
}

async function getFiscalYearOrThrow(
  client: ReportClient,
  organizationId: string,
  fiscalYearId: string
) {
  const fiscalYear = await client.fiscalYear.findFirst({
    where: { id: fiscalYearId, organizationId },
  });

  if (!fiscalYear) {
    throw new HttpProblemError({
      status: 404,
      title: 'FISCAL_YEAR_NOT_FOUND',
      detail: 'The specified fiscal year does not exist for this organization.',
    });
  }

  return fiscalYear;
}

function toFiscalYearSummary(fiscalYear: {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
  lockedAt: Date | null;
}): FiscalYearSummary {
  return {
    id: fiscalYear.id,
    label: fiscalYear.label,
    startDate: toIsoDate(fiscalYear.startDate),
    endDate: toIsoDate(fiscalYear.endDate),
    lockedAt: fiscalYear.lockedAt ? toIsoDate(fiscalYear.lockedAt) : null,
  } satisfies FiscalYearSummary;
}

function decimalToNumber(decimal: Prisma.Decimal): number {
  return Number(decimal.toFixed(2));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toFixed(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatCsvRow(values: ReadonlyArray<string>): string {
  return values
    .map((value) => {
      if (!value) {
        return '';
      }

      const needsQuotes = /[";\n\r]/.test(value);
      const sanitized = value.replace(/"/g, '""');
      return needsQuotes ? `"${sanitized}"` : sanitized;
    })
    .join(';');
}

function formatFecDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
