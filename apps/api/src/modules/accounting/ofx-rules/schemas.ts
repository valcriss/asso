import { z } from 'zod';

export const createOfxRuleSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  pattern: z.string().trim().min(1).max(500),
  normalizedLabel: z.string().trim().min(1).max(200),
  priority: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const updateOfxRuleSchema = z.object({
  bankAccountId: z.string().uuid().nullable().optional(),
  pattern: z.string().trim().min(1).max(500).optional(),
  normalizedLabel: z.string().trim().min(1).max(200).optional(),
  priority: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const listOfxRulesQuerySchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
});

export type CreateOfxRuleInput = z.infer<typeof createOfxRuleSchema>;
export type UpdateOfxRuleInput = z.infer<typeof updateOfxRuleSchema>;
export type ListOfxRulesQuery = z.infer<typeof listOfxRulesQuerySchema>;

