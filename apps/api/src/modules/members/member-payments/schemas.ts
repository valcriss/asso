import { z } from 'zod';

export const recordMemberPaymentSchema = z.object({
  entryId: z.string().uuid(),
  paidAt: z.coerce.date().optional(),
});

export type RecordMemberPaymentInput = z.infer<typeof recordMemberPaymentSchema>;

export const linkPaymentJustificationSchema = z.object({
  attachmentId: z.string().uuid(),
});

export type LinkPaymentJustificationInput = z.infer<typeof linkPaymentJustificationSchema>;
