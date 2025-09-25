import type { Prisma, PrismaClient } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import { createMemberInputSchema, updateMemberInputSchema } from './schemas';

export type MemberClient = PrismaClient | Prisma.TransactionClient;

export async function listMembers(client: MemberClient, organizationId: string) {
  return client.member.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ],
  });
}

export async function getMember(client: MemberClient, organizationId: string, memberId: string) {
  const member = await client.member.findFirst({
    where: { id: memberId, organizationId, deletedAt: null },
  });

  if (!member) {
    throw memberNotFoundError();
  }

  return member;
}

export async function createMember(client: MemberClient, organizationId: string, input: unknown) {
  const parsed = createMemberInputSchema.parse(input);

  try {
    return await client.member.create({
      data: {
        organizationId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        membershipType: parsed.membershipType,
        joinedAt: parsed.joinedAt,
        leftAt: parsed.leftAt,
        rgpdConsentAt: parsed.rgpdConsentAt,
        personalNotes: parsed.personalNotes ?? null,
      },
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new HttpProblemError({
        status: 409,
        title: 'MEMBER_EMAIL_ALREADY_EXISTS',
        detail: 'A member with this email already exists in the organization.',
      });
    }

    throw error;
  }
}

export async function updateMember(
  client: MemberClient,
  organizationId: string,
  memberId: string,
  input: unknown
) {
  const parsed = updateMemberInputSchema.parse(input);

  const existing = await client.member.findFirst({
    where: { id: memberId, organizationId, deletedAt: null },
  });

  if (!existing) {
    throw memberNotFoundError();
  }

  const data: Prisma.MemberUpdateInput = {};

  if (parsed.firstName !== undefined) {
    data.firstName = parsed.firstName;
  }
  if (parsed.lastName !== undefined) {
    data.lastName = parsed.lastName;
  }
  if (parsed.email !== undefined) {
    data.email = parsed.email;
  }
  if (parsed.membershipType !== undefined) {
    data.membershipType = parsed.membershipType;
  }
  if (parsed.joinedAt !== undefined) {
    data.joinedAt = parsed.joinedAt;
  }
  if (parsed.leftAt !== undefined) {
    data.leftAt = parsed.leftAt;
  }
  if (parsed.rgpdConsentAt !== undefined) {
    data.rgpdConsentAt = parsed.rgpdConsentAt;
  }
  if (parsed.personalNotes !== undefined) {
    data.personalNotes = parsed.personalNotes;
    data.personalNotesRedactedAt = parsed.personalNotes === null ? new Date() : null;
  }

  try {
    return await client.member.update({
      where: { id: existing.id },
      data,
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new HttpProblemError({
        status: 409,
        title: 'MEMBER_EMAIL_ALREADY_EXISTS',
        detail: 'A member with this email already exists in the organization.',
      });
    }

    throw error;
  }
}

export async function deleteMember(client: MemberClient, organizationId: string, memberId: string) {
  const existing = await client.member.findFirst({
    where: { id: memberId, organizationId, deletedAt: null },
    select: { id: true, email: true, personalNotes: true, personalNotesRedactedAt: true },
  });

  if (!existing) {
    throw memberNotFoundError();
  }

  const assignments = await client.memberFeeAssignment.count({
    where: { organizationId, memberId },
  });

  if (assignments > 0) {
    throw new HttpProblemError({
      status: 409,
      title: 'MEMBER_HAS_ASSIGNMENTS',
      detail: 'Cannot delete a member with existing fee assignments.',
    });
  }

  const hadNotes =
    typeof existing.personalNotes === 'string' && existing.personalNotes.trim().length > 0;

  await client.member.update({
    where: { id: existing.id },
    data: {
      deletedAt: new Date(),
      personalNotes: null,
      personalNotesRedactedAt: hadNotes ? new Date() : existing.personalNotesRedactedAt,
    },
  });
}

export async function redactMemberPersonalNotes(
  client: MemberClient,
  organizationId: string,
  memberId: string
) {
  const existing = await client.member.findFirst({
    where: { id: memberId, organizationId, deletedAt: null },
    select: { id: true, personalNotes: true, personalNotesRedactedAt: true },
  });

  if (!existing) {
    throw memberNotFoundError();
  }

  if (!existing.personalNotes || existing.personalNotes.trim() === '') {
    return await client.member.update({
      where: { id: existing.id },
      data: { personalNotes: null, personalNotesRedactedAt: existing.personalNotesRedactedAt ?? new Date() },
    });
  }

  return client.member.update({
    where: { id: existing.id },
    data: {
      personalNotes: null,
      personalNotesRedactedAt: new Date(),
    },
  });
}

function memberNotFoundError(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'MEMBER_NOT_FOUND',
    detail: 'The requested member was not found for this organization.',
  });
}

function isUniqueEmailError(error: unknown): boolean {
  return (
    error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta?.target.includes('member_org_email_key')
  );
}
