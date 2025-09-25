import { z } from 'zod';

const personalNotesSchema = z
  .string()
  .trim()
  .max(5000, { message: 'Personal notes must be 5000 characters or fewer.' });

const baseMemberInputSchema = z.object({
  firstName: z.string().trim().min(1, { message: 'First name is required.' }),
  lastName: z.string().trim().min(1, { message: 'Last name is required.' }),
  email: z.string().trim().min(1, { message: 'Email is required.' }).email({ message: 'Email must be valid.' }),
  membershipType: z.string().trim().min(1, { message: 'Membership type is required.' }),
  joinedAt: z.coerce.date().optional(),
  leftAt: z.coerce.date().optional(),
  rgpdConsentAt: z.coerce.date().optional(),
  personalNotes: personalNotesSchema.optional(),
});

function ensureValidMembershipDates(value: { joinedAt?: Date; leftAt?: Date }, ctx: z.RefinementCtx): void {
  if (value.joinedAt && value.leftAt && value.leftAt < value.joinedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['leftAt'],
      message: 'Departure date cannot precede join date.',
    });
  }
}

export const createMemberInputSchema = baseMemberInputSchema.superRefine(ensureValidMembershipDates);

export type CreateMemberInput = z.infer<typeof createMemberInputSchema>;

export const updateMemberInputSchema = baseMemberInputSchema
  .extend({ personalNotes: personalNotesSchema.nullable().optional() })
  .partial()
  .superRefine((value, ctx) => {
    if (Object.values(value).every((item) => item === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided.',
      });
      return;
    }

    ensureValidMembershipDates(value, ctx);
  });

export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;
