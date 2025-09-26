import { Prisma, type PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import {
  createFiscalYearSchema,
  updateFiscalYearSchema,
  lockFiscalYearSchema,
  type CreateFiscalYearInput,
  type UpdateFiscalYearInput,
  type LockFiscalYearInput,
} from './schemas';

export type FiscalYearClient = PrismaClient | Prisma.TransactionClient;

export async function listFiscalYears(client: FiscalYearClient, organizationId: string) {
  const years = await client.fiscalYear.findMany({
    where: { organizationId },
    orderBy: { startDate: 'desc' },
  });

  return years.map((fy) => serializeFiscalYear(fy));
}

export async function createFiscalYear(
  client: FiscalYearClient,
  organizationId: string,
  input: unknown,
) {
  const parsed = createFiscalYearSchema.parse(input) as CreateFiscalYearInput;

  if (parsed.endDate.getTime() < parsed.startDate.getTime()) {
    throw new HttpProblemError({
      status: 422,
      title: 'FISCAL_YEAR_INVALID_RANGE',
      detail: 'End date must be on or after start date.',
    });
  }

  try {
    const fy = await client.fiscalYear.create({
      data: {
        organizationId,
        label: parsed.label,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
      },
    });
    return serializeFiscalYear(fy);
  } catch (error) {
    if (isUniqueViolation(error, 'fiscal_year_org_label_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'FISCAL_YEAR_LABEL_EXISTS',
        detail: 'A fiscal year with this label already exists in the organization.',
      });
    }
    throw error;
  }
}

export async function updateFiscalYear(
  client: FiscalYearClient,
  organizationId: string,
  fiscalYearId: string,
  input: unknown,
) {
  const parsed = updateFiscalYearSchema.parse(input) as UpdateFiscalYearInput;

  const existing = await client.fiscalYear.findFirst({ where: { id: fiscalYearId, organizationId } });
  if (!existing) {
    throw notFound();
  }

  const data: Prisma.FiscalYearUpdateInput = {};
  if (parsed.label !== undefined) data.label = parsed.label;
  if (parsed.startDate !== undefined) data.startDate = parsed.startDate;
  if (parsed.endDate !== undefined) data.endDate = parsed.endDate;

  if (
    (parsed.startDate ?? existing.startDate).getTime() > (parsed.endDate ?? existing.endDate).getTime()
  ) {
    throw new HttpProblemError({
      status: 422,
      title: 'FISCAL_YEAR_INVALID_RANGE',
      detail: 'End date must be on or after start date.',
    });
  }

  try {
    const updated = await client.fiscalYear.update({ where: { id: existing.id }, data });
    return serializeFiscalYear(updated);
  } catch (error) {
    if (isUniqueViolation(error, 'fiscal_year_org_label_key')) {
      throw new HttpProblemError({
        status: 409,
        title: 'FISCAL_YEAR_LABEL_EXISTS',
        detail: 'A fiscal year with this label already exists in the organization.',
      });
    }
    throw error;
  }
}

export async function setFiscalYearLock(
  client: FiscalYearClient,
  organizationId: string,
  fiscalYearId: string,
  input: unknown,
) {
  const parsed = lockFiscalYearSchema.parse(input) as LockFiscalYearInput;

  const existing = await client.fiscalYear.findFirst({ where: { id: fiscalYearId, organizationId } });
  if (!existing) {
    throw notFound();
  }

  const updated = await client.fiscalYear.update({
    where: { id: existing.id },
    data: {
      lockedAt: parsed.locked ? new Date() : null,
    },
  });

  return serializeFiscalYear(updated);
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== 'P2002') {
    return false;
  }

  const target = error.meta?.target;
  if (typeof target === 'string') {
    return target.includes(constraint);
  }

  if (Array.isArray(target)) {
    return target.includes(constraint);
  }

  return false;
}

function serializeFiscalYear(fy: {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
  lockedAt: Date | null;
}) {
  return {
    id: fy.id,
    label: fy.label,
    startDate: fy.startDate.toISOString().slice(0, 10),
    endDate: fy.endDate.toISOString().slice(0, 10),
    lockedAt: fy.lockedAt ? fy.lockedAt.toISOString() : null,
    status: fy.lockedAt ? 'LOCKED' : 'OPEN',
  };
}

function notFound(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'FISCAL_YEAR_NOT_FOUND',
    detail: 'The specified fiscal year does not exist for this organization.',
  });
}
