import { Prisma, type PrismaClient, ProjectType } from '@prisma/client';
import { HttpProblemError } from '../../lib/problem-details';
import {
  createProjectInputSchema,
  listProjectsQuerySchema,
  projectExportQuerySchema,
  projectVarianceQuerySchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectExportQuery,
  type ProjectVarianceQuery,
  type ProjectPeriodInput,
  updateProjectInputSchema,
  type UpdateProjectInput,
} from './schemas';

export type ProjectClient = PrismaClient | Prisma.TransactionClient;

type ProjectWithPeriods = Prisma.ProjectGetPayload<{ include: { periods: true } }>;

type EntryLineWithEntry = Prisma.EntryLineGetPayload<{
  select: {
    projectId: true;
    debit: true;
    credit: true;
    entry: { select: { date: true } };
  };
}>;

export interface AmountSummary {
  debit: number;
  credit: number;
  net: number;
}

export interface ProjectPeriodSummary {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  plannedAmount: number;
  actual: AmountSummary;
  variance: number;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: ProjectType;
  funder: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  plannedAmount: number;
  actual: AmountSummary;
  variance: number;
  periods: ProjectPeriodSummary[];
}

export interface ProjectTotalsSummary {
  planned: number;
  actualDebit: number;
  actualCredit: number;
  actualNet: number;
  variance: number;
}

export interface ProjectVarianceReport {
  projects: ProjectSummary[];
  totals: ProjectTotalsSummary;
}

export interface ProjectJustificationExport {
  project: {
    id: string;
    code: string;
    name: string;
    type: ProjectType;
    currency: string;
    plannedAmount: number;
  };
  period?: {
    id: string;
    label: string;
    startDate: string | null;
    endDate: string | null;
    plannedAmount: number;
  };
  totals: {
    debit: number;
    credit: number;
    net: number;
    variance: number;
  };
  csv: string;
  lineCount: number;
}

const ZERO = new Prisma.Decimal(0);

export async function listProjects(
  client: ProjectClient,
  organizationId: string,
  query: ListProjectsQuery | undefined
): Promise<ProjectVarianceReport> {
  const parsed = listProjectsQuerySchema.parse(query ?? {});

  const where: Prisma.ProjectWhereInput = { organizationId };
  if (parsed.type) {
    where.type = parsed.type;
  }

  const projects = await client.project.findMany({
    where,
    orderBy: [
      { code: 'asc' },
      { name: 'asc' },
    ],
    include: {
      periods: {
        orderBy: [
          { startDate: 'asc' },
          { label: 'asc' },
        ],
      },
    },
  });

  const { summaries, totals } = await computeProjectSummaries(client, organizationId, projects);
  return { projects: summaries, totals };
}

export async function getProject(
  client: ProjectClient,
  organizationId: string,
  projectId: string
): Promise<ProjectSummary> {
  const project = await fetchProjectOrThrow(client, organizationId, projectId);
  const { summaries } = await computeProjectSummaries(client, organizationId, [project]);
  return summaries[0];
}

export async function createProject(
  client: ProjectClient,
  organizationId: string,
  input: unknown
): Promise<ProjectSummary> {
  const parsed = createProjectInputSchema.parse(input) as CreateProjectInput;
  const periods = parsed.periods ?? [];

  try {
    const project = await client.project.create({
      data: {
        organizationId,
        code: parsed.code,
        name: parsed.name,
        description: parsed.description ?? null,
        type: parsed.type ?? ProjectType.PROJECT,
        funder: parsed.funder ?? null,
        plannedAmount: parsed.plannedAmount ?? null,
        currency: parsed.currency ?? 'EUR',
        startDate: parsed.startDate ?? null,
        endDate: parsed.endDate ?? null,
        periods: periods.length
          ? {
              create: periods.map((period) => ({
                organizationId,
                label: period.label,
                plannedAmount: period.plannedAmount,
                startDate: period.startDate ?? null,
                endDate: period.endDate ?? null,
              })),
            }
          : undefined,
      },
      include: {
        periods: {
          orderBy: [
            { startDate: 'asc' },
            { label: 'asc' },
          ],
        },
      },
    });

    const { summaries } = await computeProjectSummaries(client, organizationId, [project]);
    return summaries[0];
  } catch (error) {
    if (isUniqueViolation(error, 'project_org_code_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'PROJECT_CODE_ALREADY_EXISTS',
        detail: 'A project with this code already exists for the organization.',
      });
    }

    throw error;
  }
}

export async function updateProject(
  client: ProjectClient,
  organizationId: string,
  projectId: string,
  input: unknown
): Promise<ProjectSummary> {
  const parsed = updateProjectInputSchema.parse(input) as UpdateProjectInput;

  return client.$transaction(async (tx) => {
    const existing = await fetchProjectOrThrow(tx, organizationId, projectId);

    const data: Prisma.ProjectUpdateInput = {};

    if (parsed.code !== undefined) {
      data.code = parsed.code;
    }
    if (parsed.name !== undefined) {
      data.name = parsed.name;
    }
    if (parsed.description !== undefined) {
      data.description = parsed.description ?? null;
    }
    if (parsed.type !== undefined) {
      data.type = parsed.type;
    }
    if (parsed.funder !== undefined) {
      data.funder = parsed.funder ?? null;
    }
    if (parsed.plannedAmount !== undefined) {
      data.plannedAmount = parsed.plannedAmount ?? null;
    }
    if (parsed.currency !== undefined) {
      data.currency = parsed.currency;
    }
    if (parsed.startDate !== undefined) {
      data.startDate = parsed.startDate ?? null;
    }
    if (parsed.endDate !== undefined) {
      data.endDate = parsed.endDate ?? null;
    }

    try {
      await tx.project.update({
        where: { id: existing.id },
        data,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'project_org_code_key')) {
        throw new HttpProblemError({
          status: 409,
          title: 'PROJECT_CODE_ALREADY_EXISTS',
          detail: 'A project with this code already exists for the organization.',
        });
      }

      throw error;
    }

    if (parsed.periods) {
      await syncProjectPeriods(tx, organizationId, existing.id, existing.periods, parsed.periods);
    }

    const refreshed = await fetchProjectOrThrow(tx, organizationId, existing.id);
    const { summaries } = await computeProjectSummaries(tx, organizationId, [refreshed]);
    return summaries[0];
  });
}

export async function deleteProject(
  client: ProjectClient,
  organizationId: string,
  projectId: string
): Promise<void> {
  const existing = await client.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw projectNotFoundError();
  }

  const usageCount = await client.entryLine.count({
    where: { organizationId, projectId },
  });

  if (usageCount > 0) {
    throw new HttpProblemError({
      status: 409,
      title: 'PROJECT_HAS_ENTRIES',
      detail: 'Cannot delete a project while accounting lines reference it.',
    });
  }

  await client.project.delete({
    where: { id: existing.id },
  });
}

export async function getProjectVarianceReport(
  client: ProjectClient,
  organizationId: string,
  query: ProjectVarianceQuery | undefined
): Promise<ProjectVarianceReport> {
  return listProjects(client, organizationId, query);
}

export async function exportProjectJustification(
  client: ProjectClient,
  organizationId: string,
  projectId: string,
  query: ProjectExportQuery | undefined
): Promise<ProjectJustificationExport> {
  const parsed = projectExportQuerySchema.parse(query ?? {});
  const project = await fetchProjectOrThrow(client, organizationId, projectId);

  const period = parsed.periodId
    ? project.periods.find((item) => item.id === parsed.periodId) ?? null
    : null;

  if (parsed.periodId && !period) {
    throw new HttpProblemError({
      status: 404,
      title: 'PROJECT_PERIOD_NOT_FOUND',
      detail: 'The requested project period does not exist for this project.',
    });
  }

  const entryFilter: Prisma.EntryWhereInput = {};
  if (period?.startDate) {
    entryFilter.date = { ...(entryFilter.date ?? {}), gte: period.startDate };
  }
  if (period?.endDate) {
    entryFilter.date = { ...(entryFilter.date ?? {}), lte: period.endDate };
  }

  const where: Prisma.EntryLineWhereInput = {
    organizationId,
    projectId,
  };

  if (Object.keys(entryFilter).length > 0) {
    where.entry = { is: entryFilter };
  }

  const lines = await client.entryLine.findMany({
    where,
    include: {
      account: { select: { code: true, name: true } },
      entry: {
        select: {
          id: true,
          date: true,
          memo: true,
          reference: true,
          journal: { select: { code: true, name: true } },
          attachments: { select: { id: true, filename: true, url: true } },
        },
      },
    },
    orderBy: [
      { entry: { date: 'asc' } },
      { account: { code: 'asc' } },
      { id: 'asc' },
    ],
  });

  let totalDebit = ZERO;
  let totalCredit = ZERO;

  const rows = lines.map((line) => {
    const debit = line.debit ?? ZERO;
    const credit = line.credit ?? ZERO;

    totalDebit = totalDebit.add(debit);
    totalCredit = totalCredit.add(credit);

    const net = debit.sub(credit);
    const entryDate = line.entry?.date ? toIsoDate(line.entry.date) : '';
    const journalLabel = line.entry?.journal
      ? `${line.entry.journal.code} - ${line.entry.journal.name}`
      : '';
    const attachments = line.entry?.attachments ?? [];
    const attachmentCell = attachments
      .map((attachment) => (attachment.url ? `${attachment.filename ?? attachment.url} (${attachment.url})` : attachment.filename))
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .join(' | ');

    return formatCsvRow([
      entryDate,
      journalLabel,
      line.entry?.reference ?? '',
      line.account?.code ?? '',
      line.account?.name ?? '',
      formatAmount(debit),
      formatAmount(credit),
      formatAmount(net),
      line.entry?.memo ?? '',
      attachmentCell,
    ]);
  });

  const netTotal = totalDebit.sub(totalCredit);
  const plannedDecimal = period
    ? period.plannedAmount
    : project.plannedAmount ?? project.periods.reduce((sum, item) => sum.add(item.plannedAmount), ZERO);
  const variance = netTotal.sub(plannedDecimal);

  rows.push(
    formatCsvRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      formatAmount(totalDebit),
      formatAmount(totalCredit),
      formatAmount(netTotal),
      '',
      '',
    ])
  );
  rows.push(
    formatCsvRow([
      'PLANNED',
      '',
      '',
      '',
      '',
      '',
      '',
      formatAmount(plannedDecimal),
      '',
      '',
    ])
  );
  rows.push(
    formatCsvRow([
      'VARIANCE',
      '',
      '',
      '',
      '',
      '',
      '',
      formatAmount(variance),
      '',
      '',
    ])
  );

  const header = formatCsvRow([
    'Entry Date',
    'Journal',
    'Reference',
    'Account Code',
    'Account Name',
    'Debit',
    'Credit',
    'Net',
    'Memo',
    'Attachments',
  ]);

  const csv = [header, ...rows].join('\n');

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      type: project.type,
      currency: project.currency,
      plannedAmount: decimalToNumber(plannedDecimal),
    },
    period: period
      ? {
          id: period.id,
          label: period.label,
          startDate: toIsoDate(period.startDate),
          endDate: toIsoDate(period.endDate),
          plannedAmount: decimalToNumber(period.plannedAmount),
        }
      : undefined,
    totals: {
      debit: decimalToNumber(totalDebit),
      credit: decimalToNumber(totalCredit),
      net: decimalToNumber(netTotal),
      variance: decimalToNumber(variance),
    },
    csv,
    lineCount: lines.length,
  } satisfies ProjectJustificationExport;
}

async function computeProjectSummaries(
  client: ProjectClient,
  organizationId: string,
  projects: ProjectWithPeriods[]
): Promise<{ summaries: ProjectSummary[]; totals: ProjectTotalsSummary }> {
  if (projects.length === 0) {
    return {
      summaries: [],
      totals: {
        planned: 0,
        actualDebit: 0,
        actualCredit: 0,
        actualNet: 0,
        variance: 0,
      },
    };
  }

  const projectIds = projects.map((project) => project.id);
  const periodsByProject = new Map<string, ProjectWithPeriods['periods']>();

  for (const project of projects) {
    const sortedPeriods = [...project.periods].sort(comparePeriods);
    periodsByProject.set(project.id, sortedPeriods);
  }

  const lines: EntryLineWithEntry[] = await client.entryLine.findMany({
    where: {
      organizationId,
      projectId: { in: projectIds },
    },
    select: {
      projectId: true,
      debit: true,
      credit: true,
      entry: { select: { date: true } },
    },
  });

  const projectTotals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  const periodTotals = new Map<string, Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>>();

  for (const projectId of projectIds) {
    projectTotals.set(projectId, { debit: ZERO, credit: ZERO });
    periodTotals.set(projectId, new Map());
  }

  for (const line of lines) {
    if (!line.projectId) {
      continue;
    }

    const aggregate = projectTotals.get(line.projectId);
    if (aggregate) {
      aggregate.debit = aggregate.debit.add(line.debit ?? ZERO);
      aggregate.credit = aggregate.credit.add(line.credit ?? ZERO);
    }

    const entryDate = line.entry?.date ?? null;
    const periods = periodsByProject.get(line.projectId) ?? [];

    for (const period of periods) {
      if (!entryDate || !isDateWithinPeriod(entryDate, period.startDate, period.endDate)) {
        continue;
      }

      const map = periodTotals.get(line.projectId)!;
      const current = map.get(period.id) ?? { debit: ZERO, credit: ZERO };
      const updated = {
        debit: current.debit.add(line.debit ?? ZERO),
        credit: current.credit.add(line.credit ?? ZERO),
      };
      map.set(period.id, updated);
    }
  }

  let totalPlanned = ZERO;
  let totalDebit = ZERO;
  let totalCredit = ZERO;
  let totalNet = ZERO;
  let totalVariance = ZERO;

  const summaries = projects.map((project) => {
    const periods = periodsByProject.get(project.id) ?? [];
    const aggregate = projectTotals.get(project.id) ?? { debit: ZERO, credit: ZERO };
    const plannedFromPeriods = periods.reduce((sum, period) => sum.add(period.plannedAmount), ZERO);
    const planned = project.plannedAmount ?? plannedFromPeriods;
    const net = aggregate.debit.sub(aggregate.credit);
    const variance = net.sub(planned);

    totalPlanned = totalPlanned.add(planned);
    totalDebit = totalDebit.add(aggregate.debit);
    totalCredit = totalCredit.add(aggregate.credit);
    totalNet = totalNet.add(net);
    totalVariance = totalVariance.add(variance);

    const periodSummaries = periods.map((period) => {
      const map = periodTotals.get(project.id) ?? new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
      const aggregateForPeriod = map.get(period.id) ?? { debit: ZERO, credit: ZERO };
      const periodNet = aggregateForPeriod.debit.sub(aggregateForPeriod.credit);
      const periodVariance = periodNet.sub(period.plannedAmount);

      return {
        id: period.id,
        label: period.label,
        startDate: toIsoDate(period.startDate),
        endDate: toIsoDate(period.endDate),
        plannedAmount: decimalToNumber(period.plannedAmount),
        actual: {
          debit: decimalToNumber(aggregateForPeriod.debit),
          credit: decimalToNumber(aggregateForPeriod.credit),
          net: decimalToNumber(periodNet),
        },
        variance: decimalToNumber(periodVariance),
      } satisfies ProjectPeriodSummary;
    });

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      type: project.type,
      funder: project.funder,
      currency: project.currency,
      startDate: toIsoDate(project.startDate),
      endDate: toIsoDate(project.endDate),
      plannedAmount: decimalToNumber(planned),
      actual: {
        debit: decimalToNumber(aggregate.debit),
        credit: decimalToNumber(aggregate.credit),
        net: decimalToNumber(net),
      },
      variance: decimalToNumber(variance),
      periods: periodSummaries,
    } satisfies ProjectSummary;
  });

  return {
    summaries,
    totals: {
      planned: decimalToNumber(totalPlanned),
      actualDebit: decimalToNumber(totalDebit),
      actualCredit: decimalToNumber(totalCredit),
      actualNet: decimalToNumber(totalNet),
      variance: decimalToNumber(totalVariance),
    },
  };
}

async function fetchProjectOrThrow(
  client: ProjectClient,
  organizationId: string,
  projectId: string
): Promise<ProjectWithPeriods> {
  const project = await client.project.findFirst({
    where: { id: projectId, organizationId },
    include: {
      periods: {
        orderBy: [
          { startDate: 'asc' },
          { label: 'asc' },
        ],
      },
    },
  });

  if (!project) {
    throw projectNotFoundError();
  }

  return project;
}

async function syncProjectPeriods(
  client: ProjectClient,
  organizationId: string,
  projectId: string,
  existing: ProjectWithPeriods['periods'],
  incoming: ProjectPeriodInput[]
): Promise<void> {
  const existingIds = new Set(existing.map((period) => period.id));
  const processedIds = new Set<string>();

  for (const period of incoming) {
    if (period.id && existingIds.has(period.id)) {
      processedIds.add(period.id);
      await client.projectPeriod.update({
        where: { id: period.id },
        data: {
          label: period.label,
          plannedAmount: period.plannedAmount,
          startDate: period.startDate ?? null,
          endDate: period.endDate ?? null,
        },
      });
    } else {
      const created = await client.projectPeriod.create({
        data: {
          organizationId,
          projectId,
          label: period.label,
          plannedAmount: period.plannedAmount,
          startDate: period.startDate ?? null,
          endDate: period.endDate ?? null,
        },
      });
      processedIds.add(created.id);
    }
  }

  const idsToDelete = existing
    .filter((period) => !processedIds.has(period.id))
    .map((period) => period.id);

  if (idsToDelete.length > 0) {
    await client.projectPeriod.deleteMany({
      where: { projectId, id: { in: idsToDelete } },
    });
  }
}

function comparePeriods(a: Prisma.ProjectPeriod, b: Prisma.ProjectPeriod): number {
  if (a.startDate && b.startDate) {
    const diff = a.startDate.getTime() - b.startDate.getTime();
    if (diff !== 0) {
      return diff;
    }
  } else if (a.startDate) {
    return 1;
  } else if (b.startDate) {
    return -1;
  }

  return a.label.localeCompare(b.label);
}

function isDateWithinPeriod(date: Date, start: Date | null, end: Date | null): boolean {
  if (start && date < start) {
    return false;
  }

  if (end && date > end) {
    return false;
  }

  return true;
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function toIsoDate(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function formatAmount(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatCsvRow(values: ReadonlyArray<string>): string {
  return values
    .map((value) => {
      const normalized = value ?? '';
      if (normalized === '') {
        return '';
      }

      const needsQuotes = /[";\n\r]/.test(normalized);
      const sanitized = normalized.replace(/"/g, '""');
      return needsQuotes ? `"${sanitized}"` : sanitized;
    })
    .join(';');
}

function projectNotFoundError(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'PROJECT_NOT_FOUND',
    detail: 'The requested project does not exist for this organization.',
  });
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    (error.meta?.target as string[]).includes(constraint)
  );
}
