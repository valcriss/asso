import { Prisma } from '@prisma/client';
import { z } from 'zod';

const decimalPattern = /^-?\d+(\.\d{1,2})?$/;

const decimalSchema = z
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
  .superRefine((value, ctx) => {
    if (value.decimalPlaces() > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amount must have at most two decimal places.',
      });
    }
  });

export const recordBankStatementInputSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.coerce.date(),
  openingBalance: decimalSchema,
  closingBalance: decimalSchema,
  entryIds: z.array(z.string().uuid()).default([]),
});

export type RecordBankStatementInput = z.infer<typeof recordBankStatementInputSchema>;
