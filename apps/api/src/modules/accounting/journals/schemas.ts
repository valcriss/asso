import { z } from 'zod';

export const JOURNAL_TYPES = [
  'GENERAL',
  'PURCHASE',
  'SALES',
  'BANK',
  'CASH',
  'MISC',
] as const;

export type JournalType = (typeof JOURNAL_TYPES)[number];

export const journalCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .regex(/^[A-Z0-9]+$/, {
    message: 'Journal code must use uppercase alphanumeric characters.',
  });

export const journalNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255);

export const journalTypeSchema = z.enum(JOURNAL_TYPES);

const JOURNAL_COMPATIBILITY_RULES: Record<JournalType, RegExp> = {
  GENERAL: /^(G|J)/,
  PURCHASE: /^(A|P)/,
  SALES: /^(S|V)/,
  BANK: /^B/,
  CASH: /^C/,
  MISC: /^[A-Z]/,
};

export function isJournalTypeCompatible(code: string, type: JournalType): boolean {
  const normalizedCode = code.trim().toUpperCase();
  const rule = JOURNAL_COMPATIBILITY_RULES[type];
  return rule.test(normalizedCode);
}

function ensureJournalCompatibility(
  value: { code: string; type: JournalType },
  ctx: z.RefinementCtx
): void {
  if (!isJournalTypeCompatible(value.code, value.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Journal code ${value.code} is not compatible with type ${value.type}.`,
      path: ['type'],
    });
  }
}

const baseJournalSchema = z
  .object({
    code: journalCodeSchema,
    name: journalNameSchema,
    type: journalTypeSchema,
  })
  .superRefine((value, ctx) => ensureJournalCompatibility(value, ctx));

export const createJournalInputSchema = baseJournalSchema;

export type CreateJournalInput = z.infer<typeof createJournalInputSchema>;

export const updateJournalInputSchema = z
  .object({
    code: journalCodeSchema.optional(),
    name: journalNameSchema.optional(),
    type: journalTypeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.code === undefined && value.name === undefined && value.type === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one property must be provided.',
      });
    }

    if (value.code !== undefined && value.type !== undefined) {
      ensureJournalCompatibility({ code: value.code, type: value.type }, ctx);
    }
  });

export type UpdateJournalInput = z.infer<typeof updateJournalInputSchema>;
