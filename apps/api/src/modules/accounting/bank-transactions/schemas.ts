import { z } from 'zod';

export const importOfxInputSchema = z.object({
  bankAccountId: z.string().uuid(),
  ofx: z.string().min(1, { message: 'OFX content is required.' }),
});

export const reconcileSuggestionsInputSchema = z.object({
  transactionId: z.string().uuid(),
  maxSuggestions: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5),
});

export type ImportOfxInput = z.infer<typeof importOfxInputSchema>;
export type ReconcileSuggestionsInput = z.infer<typeof reconcileSuggestionsInputSchema>;

export const confirmReconciliationInputSchema = z.object({
  transactionId: z.string().uuid(),
  entryId: z.string().uuid(),
});

export type ConfirmReconciliationInput = z.infer<typeof confirmReconciliationInputSchema>;
