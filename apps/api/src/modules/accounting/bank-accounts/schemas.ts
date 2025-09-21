import { z } from 'zod';

const ibanPattern = /^[0-9A-Z]+$/;
const bicPattern = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);

  if (iban.length < 15 || iban.length > 34) {
    return false;
  }

  if (!ibanPattern.test(iban)) {
    return false;
  }

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numeric = '';

  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numeric += String(code - 55);
    } else if (code >= 48 && code <= 57) {
      numeric += char;
    } else {
      return false;
    }
  }

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}

export function isValidBic(input: string): boolean {
  return bicPattern.test(input);
}

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Name is required.' })
  .max(255, { message: 'Name must be at most 255 characters long.' });

const ibanSchema = z
  .string()
  .trim()
  .min(1, { message: 'IBAN is required.' })
  .transform((value) => normalizeIban(value))
  .superRefine((value, ctx) => {
    if (!isValidIban(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'IBAN is invalid.',
      });
    }
  });

const bicSchema = z
  .string()
  .trim()
  .min(8, { message: 'BIC must be 8 or 11 characters long.' })
  .max(11, { message: 'BIC must be 8 or 11 characters long.' })
  .transform((value) => value.toUpperCase())
  .superRefine((value, ctx) => {
    if (!isValidBic(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'BIC is invalid.',
      });
    }
  });

const optionalBicSchema = z
  .union([bicSchema, z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value === null ? null : value;
  });

export const createBankAccountInputSchema = z.object({
  accountId: z.string().uuid(),
  name: nameSchema,
  iban: ibanSchema,
  bic: bicSchema.optional(),
});

export const updateBankAccountInputSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    name: nameSchema.optional(),
    iban: ibanSchema.optional(),
    bic: optionalBicSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided to update the bank account.',
  });

export type CreateBankAccountInput = z.infer<typeof createBankAccountInputSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountInputSchema>;
