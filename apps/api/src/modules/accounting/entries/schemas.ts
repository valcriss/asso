import { Prisma } from '@prisma/client';
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

const amountWithDefaultSchema = amountSchema
  .optional()
  .transform((value) => value ?? new Prisma.Decimal(0));

export const entryLineInputSchema = z
  .object({
    accountId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    debit: amountWithDefaultSchema,
    credit: amountWithDefaultSchema,
  })
  .superRefine((value, ctx) => {
    const hasDebit = value.debit.gt(0);
    const hasCredit = value.credit.gt(0);

    if (hasDebit && hasCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['debit'],
        message: 'A line cannot have both debit and credit amounts.',
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credit'],
        message: 'A line cannot have both debit and credit amounts.',
      });
      return;
    }

    if (!hasDebit && !hasCredit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each line must have either a debit or a credit amount.',
      });
    }
  });

export type EntryLineInput = z.infer<typeof entryLineInputSchema>;

export const createEntryInputSchema = z.object({
  fiscalYearId: z.string().uuid(),
  journalId: z.string().uuid(),
  date: z.coerce.date(),
  memo: z.string().trim().max(1024).optional(),
  lines: z.array(entryLineInputSchema).min(2, {
    message: 'An entry requires at least two lines.',
  }),
});

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;

export const reverseEntryInputSchema = z.object({
  fiscalYearId: z.string().uuid(),
  date: z.coerce.date(),
  journalId: z.string().uuid().optional(),
  memo: z.string().trim().max(1024).optional(),
});

export type ReverseEntryInput = z.infer<typeof reverseEntryInputSchema>;
