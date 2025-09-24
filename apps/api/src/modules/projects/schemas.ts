import { Prisma, ProjectType } from '@prisma/client';
import { z } from 'zod';

const decimalPattern = /^\d+(\.\d{1,2})?$/;

const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const raw = typeof value === 'number' ? value.toString() : value;
    const normalized = raw.trim();

    if (normalized === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount is required.',
      });
      return z.NEVER;
    }

    if (!decimalPattern.test(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must have at most two decimal places.',
      });
      return z.NEVER;
    }

    try {
      return new Prisma.Decimal(normalized);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount is invalid.',
      });
      return z.NEVER;
    }
  })
  .superRefine((decimal, ctx) => {
    if (decimal.isNegative()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount cannot be negative.',
      });
    }

    if (decimal.decimalPlaces() > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must have at most two decimal places.',
      });
    }
  });

const optionalAmountSchema = amountSchema.optional();

const nullableDateSchema = z
  .union([z.coerce.date(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value === null ? null : value;
  });

export const projectPeriodInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(128),
    plannedAmount: amountSchema,
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Period end date cannot be before start date.',
      });
    }
  });

export type ProjectPeriodInput = z.infer<typeof projectPeriodInputSchema>;

export const createProjectInputSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(1024).optional(),
    type: z.nativeEnum(ProjectType).default(ProjectType.PROJECT),
    funder: z.string().trim().max(255).optional(),
    plannedAmount: optionalAmountSchema,
    currency: z.string().trim().min(3).max(3).default('EUR'),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    periods: z.array(projectPeriodInputSchema).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project end date cannot be before start date.',
      });
    }
  });

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    code: z.string().trim().min(1).max(32).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1024).optional(),
    type: z.nativeEnum(ProjectType).optional(),
    funder: z.string().trim().max(255).optional(),
    plannedAmount: optionalAmountSchema,
    currency: z.string().trim().min(3).max(3).optional(),
    startDate: nullableDateSchema,
    endDate: nullableDateSchema,
    periods: z.array(projectPeriodInputSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project end date cannot be before start date.',
      });
    }
  });

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const listProjectsQuerySchema = z.object({
  type: z.nativeEnum(ProjectType).optional(),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectExportQuerySchema = z.object({
  periodId: z.string().uuid().optional(),
});

export type ProjectExportQuery = z.infer<typeof projectExportQuerySchema>;

export const projectVarianceQuerySchema = listProjectsQuerySchema;
export type ProjectVarianceQuery = z.infer<typeof projectVarianceQuerySchema>;
