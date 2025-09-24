import { z } from 'zod';

export const uploadTargetSchema = z.object({
  targetType: z.enum(['entry', 'project']),
  targetId: z.string().uuid(),
});

export type UploadTarget = z.infer<typeof uploadTargetSchema>;
