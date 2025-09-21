import { z } from 'zod';

export const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
  'OFF_BALANCE',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

const accountCodeRegex = /^\d{3,10}$/;

export const accountCodeSchema = z
  .string()
  .trim()
  .regex(accountCodeRegex, {
    message: 'Account code must contain 3 to 10 digits.',
  });

export const accountNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255);

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);

interface CompatibilityRule {
  pattern: RegExp;
  allowed: AccountType[];
}

const COMPATIBILITY_RULES: CompatibilityRule[] = [
  { pattern: /^1/, allowed: ['EQUITY', 'LIABILITY'] },
  { pattern: /^2/, allowed: ['ASSET'] },
  { pattern: /^3/, allowed: ['ASSET'] },
  { pattern: /^4/, allowed: ['ASSET', 'LIABILITY'] },
  { pattern: /^5/, allowed: ['ASSET'] },
  { pattern: /^6/, allowed: ['EXPENSE'] },
  { pattern: /^7/, allowed: ['REVENUE'] },
  { pattern: /^8/, allowed: ['OFF_BALANCE'] },
  { pattern: /^9/, allowed: ['OFF_BALANCE'] },
];

export function isAccountTypeCompatible(code: string, type: AccountType): boolean {
  const sanitizedCode = code.trim();
  const rule = COMPATIBILITY_RULES.find((candidate) => candidate.pattern.test(sanitizedCode));
  if (!rule) {
    return true;
  }

  return rule.allowed.includes(type);
}

function ensureCompatibility(
  value: { code: string; type: AccountType },
  ctx: z.RefinementCtx
): void {
  if (!isAccountTypeCompatible(value.code, value.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Account code ${value.code} is not compatible with type ${value.type}.`,
      path: ['type'],
    });
  }
}

const baseAccountSchema = z
  .object({
    code: accountCodeSchema,
    name: accountNameSchema,
    type: accountTypeSchema,
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => ensureCompatibility(value, ctx));

export const createAccountInputSchema = baseAccountSchema;

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z
  .object({
    code: accountCodeSchema.optional(),
    name: accountNameSchema.optional(),
    type: accountTypeSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.code === undefined &&
      value.name === undefined &&
      value.type === undefined &&
      value.isActive === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one property must be provided.',
      });
    }

    if (value.code !== undefined && value.type !== undefined) {
      ensureCompatibility({ code: value.code, type: value.type }, ctx);
    }
  });

export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
