import { z } from 'zod';

export const createFiscalYearSchema = z.object({
  label: z.string().trim().min(1).max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const updateFiscalYearSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const lockFiscalYearSchema = z.object({
  locked: z.boolean(),
});

export type CreateFiscalYearInput = z.infer<typeof createFiscalYearSchema>;
export type UpdateFiscalYearInput = z.infer<typeof updateFiscalYearSchema>;
export type LockFiscalYearInput = z.infer<typeof lockFiscalYearSchema>;

