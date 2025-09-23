import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import {
  createMembershipFeeTemplateSchema,
  updateMembershipFeeTemplateSchema,
} from './schemas';

export type MembershipTemplateClient = PrismaClient | Prisma.TransactionClient;

export async function listMembershipFeeTemplates(client: MembershipTemplateClient, organizationId: string) {
  return client.membershipFeeTemplate.findMany({
    where: { organizationId },
    orderBy: [
      { validFrom: 'desc' },
      { label: 'asc' },
    ],
  });
}

export async function getMembershipFeeTemplate(
  client: MembershipTemplateClient,
  organizationId: string,
  templateId: string
) {
  const template = await client.membershipFeeTemplate.findFirst({
    where: { id: templateId, organizationId },
  });

  if (!template) {
    throw templateNotFound();
  }

  return template;
}

export async function createMembershipFeeTemplate(
  client: MembershipTemplateClient,
  organizationId: string,
  input: unknown
) {
  const parsed = createMembershipFeeTemplateSchema.parse(input);

  return client.membershipFeeTemplate.create({
    data: {
      organizationId,
      label: parsed.label,
      amount: parsed.amount,
      currency: parsed.currency ?? 'EUR',
      membershipType: parsed.membershipType,
      validFrom: parsed.validFrom,
      validUntil: parsed.validUntil,
      isActive: parsed.isActive ?? true,
    },
  });
}

export async function updateMembershipFeeTemplate(
  client: MembershipTemplateClient,
  organizationId: string,
  templateId: string,
  input: unknown
) {
  const parsed = updateMembershipFeeTemplateSchema.parse(input);

  const existing = await client.membershipFeeTemplate.findFirst({
    where: { id: templateId, organizationId },
  });

  if (!existing) {
    throw templateNotFound();
  }

  const data: Prisma.MembershipFeeTemplateUpdateInput = {};

  if (parsed.label !== undefined) {
    data.label = parsed.label;
  }
  if (parsed.amount !== undefined) {
    data.amount = parsed.amount;
  }
  if (parsed.currency !== undefined) {
    data.currency = parsed.currency ?? 'EUR';
  }
  if (parsed.membershipType !== undefined) {
    data.membershipType = parsed.membershipType;
  }
  if (parsed.validFrom !== undefined) {
    data.validFrom = parsed.validFrom;
  }
  if (parsed.validUntil !== undefined) {
    data.validUntil = parsed.validUntil;
  }
  if (parsed.isActive !== undefined) {
    data.isActive = parsed.isActive;
  }

  return client.membershipFeeTemplate.update({
    where: { id: existing.id },
    data,
  });
}

export async function deleteMembershipFeeTemplate(
  client: MembershipTemplateClient,
  organizationId: string,
  templateId: string
) {
  const existing = await client.membershipFeeTemplate.findFirst({
    where: { id: templateId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw templateNotFound();
  }

  const assignmentCount = await client.memberFeeAssignment.count({
    where: { organizationId, templateId },
  });

  if (assignmentCount > 0) {
    throw new HttpProblemError({
      status: 409,
      title: 'TEMPLATE_HAS_ASSIGNMENTS',
      detail: 'Cannot delete a template that is referenced by fee assignments.',
    });
  }

  await client.membershipFeeTemplate.delete({
    where: { id: existing.id },
  });
}

function templateNotFound(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'MEMBERSHIP_FEE_TEMPLATE_NOT_FOUND',
    detail: 'The requested membership fee template was not found for this organization.',
  });
}
