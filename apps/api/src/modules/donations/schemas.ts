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

export const createDonationInputSchema = z.object({
  entryId: z.string().uuid(),
  amount: amountSchema,
  currency: z
    .string()
    .trim()
    .min(3, { message: 'Currency must have at least 3 characters.' })
    .max(10, { message: 'Currency is too long.' })
    .transform((value) => value.toUpperCase())
    .optional(),
  receivedAt: z.coerce.date(),
  donor: z.object({
    name: z.string().trim().min(1).max(255),
    email: z
      .string()
      .trim()
      .email({ message: 'Donor email must be valid.' })
      .max(320)
      .optional(),
    address: z.string().trim().max(1024).optional(),
  }),
});

export type CreateDonationInput = z.infer<typeof createDonationInputSchema>;

export const listDonationsQuerySchema = z.object({
  fiscalYearId: z.string().uuid().optional(),
});

export type ListDonationsQuery = z.infer<typeof listDonationsQuerySchema>;

export const donationExportQuerySchema = z.object({
  fiscalYearId: z.string().uuid(),
});

export type DonationExportQuery = z.infer<typeof donationExportQuerySchema>;
