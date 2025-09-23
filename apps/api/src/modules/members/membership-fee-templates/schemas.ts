import { Prisma } from '@prisma/client';
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

const baseTemplateSchema = z.object({
  label: z.string().trim().min(1, { message: 'Label is required.' }),
  amount: amountSchema,
  currency: currencySchema.optional(),
  membershipType: z.string().trim().min(1).optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});

function ensureValidPeriod(value: { validFrom?: Date; validUntil?: Date }, ctx: z.RefinementCtx): void {
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validUntil'],
      message: 'validUntil must be greater than or equal to validFrom.',
    });
  }
}

export const createMembershipFeeTemplateSchema = baseTemplateSchema.superRefine(ensureValidPeriod);
export type CreateMembershipFeeTemplateInput = z.infer<typeof createMembershipFeeTemplateSchema>;

export const updateMembershipFeeTemplateSchema = baseTemplateSchema
  .partial()
  .superRefine((value, ctx) => {
    if (Object.values(value).every((item) => item === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided.',
      });
      return;
    }

    ensureValidPeriod(value, ctx);
  });

export type UpdateMembershipFeeTemplateInput = z.infer<typeof updateMembershipFeeTemplateSchema>;
