import { Prisma, MemberFeeAssignmentStatus } from '@prisma/client';
import { z } from 'zod';

const decimalPattern = /^\d+(\.\d{1,2})?$/;

const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const normalized = typeof value === 'number' ? value.toString() : value.trim();

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
    if (decimal.lte(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must be greater than zero.',
      });
    }

    if (decimal.decimalPlaces() > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must have at most two decimal places.',
      });
    }
  });

const currencySchema = z
  .string()
  .trim()
  .min(1, { message: 'Currency is required.' })
  .max(8, { message: 'Currency must be at most 8 characters.' });

function ensureValidPeriod(value: { periodStart?: Date; periodEnd?: Date }, ctx: z.RefinementCtx): void {
  if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['periodEnd'],
      message: 'periodEnd must be greater than or equal to periodStart.',
    });
  }
}

function ensureExclusiveLinks(
  value: { entryId?: string | null; draftInvoiceId?: string | null },
  ctx: z.RefinementCtx
): void {
  if (value.entryId && value.draftInvoiceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An assignment can reference either an entry or a draft invoice, not both.',
    });
  }
}

export const createMemberFeeAssignmentSchema = z
  .object({
    memberId: z.string().uuid(),
    templateId: z.string().uuid(),
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    status: z.nativeEnum(MemberFeeAssignmentStatus).optional(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    autoAssigned: z.boolean().optional(),
    entryId: z.string().uuid().optional(),
    draftInvoiceId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    ensureValidPeriod(value, ctx);
    ensureExclusiveLinks(value, ctx);
  });

export type CreateMemberFeeAssignmentInput = z.infer<typeof createMemberFeeAssignmentSchema>;

export const updateMemberFeeAssignmentSchema = z
  .object({
    amount: amountSchema.optional(),
    currency: currencySchema.optional(),
    status: z.nativeEnum(MemberFeeAssignmentStatus).optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    autoAssigned: z.boolean().optional(),
    entryId: z.union([z.string().uuid(), z.null()]).optional(),
    draftInvoiceId: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .superRefine((value, ctx) => {
    ensureValidPeriod(value, ctx);
    ensureExclusiveLinks(value, ctx);

    if (Object.values(value).every((item) => item === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided.',
      });
    }
  });

export type UpdateMemberFeeAssignmentInput = z.infer<typeof updateMemberFeeAssignmentSchema>;

export const listMemberFeeAssignmentsQuerySchema = z.object({
  memberId: z.string().uuid().optional(),
  status: z.nativeEnum(MemberFeeAssignmentStatus).optional(),
});

export type ListMemberFeeAssignmentsQuery = z.infer<typeof listMemberFeeAssignmentsQuerySchema>;

export const applyAutomaticAssignmentsSchema = z
  .object({
    referenceDate: z.coerce.date(),
    membershipType: z.string().trim().min(1).optional(),
    templateIds: z.array(z.string().uuid()).nonempty().optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'periodEnd must be greater than or equal to periodStart.',
      });
    }
  });

export type ApplyAutomaticAssignmentsInput = z.infer<typeof applyAutomaticAssignmentsSchema>;
