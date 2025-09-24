import {
  MemberFeeAssignmentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import {
  applyAutomaticAssignmentsSchema,
  createMemberFeeAssignmentSchema,
  listMemberFeeAssignmentsQuerySchema,
  type ListMemberFeeAssignmentsQuery,
  updateMemberFeeAssignmentSchema,
} from './schemas';
import type { MemberReminderQueue } from '../../../lib/jobs/member-reminder-queue';
import { createPendingMemberPaymentForAssignment } from '../member-payments';

export type MemberFeeAssignmentClient = PrismaClient | Prisma.TransactionClient;

export async function listMemberFeeAssignments(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  query: ListMemberFeeAssignmentsQuery | undefined
) {
  const parsed = listMemberFeeAssignmentsQuerySchema.parse(query ?? {});

  return client.memberFeeAssignment.findMany({
    where: {
      organizationId,
      memberId: parsed.memberId,
      status: parsed.status,
    },
    orderBy: [
      { dueDate: 'asc' },
      { createdAt: 'asc' },
    ],
  });
}

export async function getMemberFeeAssignment(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  assignmentId: string
) {
  const assignment = await client.memberFeeAssignment.findFirst({
    where: { id: assignmentId, organizationId },
  });

  if (!assignment) {
    throw assignmentNotFound();
  }

  return assignment;
}

export async function createMemberFeeAssignment(
  client: MemberFeeAssignmentClient,
  queue: MemberReminderQueue,
  organizationId: string,
  input: unknown
) {
  const parsed = createMemberFeeAssignmentSchema.parse(input);

  await ensureMemberExists(client, organizationId, parsed.memberId);
  const template = await ensureTemplateExists(client, organizationId, parsed.templateId);

  let entryId: string | null = null;
  if (parsed.entryId) {
    await ensureEntryExists(client, organizationId, parsed.entryId);
    entryId = parsed.entryId;
  }

  const data: Prisma.MemberFeeAssignmentCreateInput = {
    organization: { connect: { id: organizationId } },
    member: { connect: { id: parsed.memberId } },
    template: { connect: { id: parsed.templateId } },
    amount: parsed.amount ?? template.amount,
    currency: parsed.currency ?? template.currency ?? 'EUR',
    status: parsed.status ?? MemberFeeAssignmentStatus.PENDING,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd ?? template.validUntil ?? null,
    dueDate: parsed.dueDate ?? parsed.periodStart,
    autoAssigned: parsed.autoAssigned ?? false,
    entry: entryId ? { connect: { id: entryId } } : undefined,
    draftInvoiceId: parsed.draftInvoiceId,
  };

  try {
    const assignment = await client.memberFeeAssignment.create({ data });
    await createPendingMemberPaymentForAssignment(client, queue, organizationId, assignment);
    return assignment;
  } catch (error) {
    if (isUniqueAssignmentError(error)) {
      throw new HttpProblemError({
        status: 409,
        title: 'MEMBER_FEE_ASSIGNMENT_ALREADY_EXISTS',
        detail: 'A fee assignment already exists for this member, template, and period.',
      });
    }

    throw error;
  }
}

export async function updateMemberFeeAssignment(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  assignmentId: string,
  input: unknown
) {
  const parsed = updateMemberFeeAssignmentSchema.parse(input);

  const existing = await client.memberFeeAssignment.findFirst({
    where: { id: assignmentId, organizationId },
  });

  if (!existing) {
    throw assignmentNotFound();
  }

  let entryId: string | null | undefined;
  if (parsed.entryId !== undefined) {
    if (parsed.entryId === null) {
      entryId = null;
    } else {
      await ensureEntryExists(client, organizationId, parsed.entryId);
      entryId = parsed.entryId;
    }
  }

  const data: Prisma.MemberFeeAssignmentUpdateInput = {};

  if (parsed.amount !== undefined) {
    data.amount = parsed.amount;
  }
  if (parsed.currency !== undefined) {
    data.currency = parsed.currency ?? 'EUR';
  }
  if (parsed.status !== undefined) {
    data.status = parsed.status;
  }
  if (parsed.periodStart !== undefined) {
    data.periodStart = parsed.periodStart;
  }
  if (parsed.periodEnd !== undefined) {
    data.periodEnd = parsed.periodEnd;
  }
  if (parsed.dueDate !== undefined) {
    data.dueDate = parsed.dueDate;
  }
  if (parsed.autoAssigned !== undefined) {
    data.autoAssigned = parsed.autoAssigned;
  }
  if (entryId !== undefined) {
    data.entry = entryId ? { connect: { id: entryId } } : { disconnect: true };
  }
  if (parsed.draftInvoiceId !== undefined) {
    data.draftInvoiceId = parsed.draftInvoiceId ?? null;
  }

  try {
    return await client.memberFeeAssignment.update({
      where: { id: existing.id },
      data,
    });
  } catch (error) {
    if (isUniqueAssignmentError(error)) {
      throw new HttpProblemError({
        status: 409,
        title: 'MEMBER_FEE_ASSIGNMENT_ALREADY_EXISTS',
        detail: 'A fee assignment already exists for this member, template, and period.',
      });
    }

    throw error;
  }
}

export async function deleteMemberFeeAssignment(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  assignmentId: string
) {
  const existing = await client.memberFeeAssignment.findFirst({
    where: { id: assignmentId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw assignmentNotFound();
  }

  await client.memberFeeAssignment.delete({ where: { id: existing.id } });
}

export async function applyAutomaticAssignments(
  client: MemberFeeAssignmentClient,
  queue: MemberReminderQueue,
  organizationId: string,
  input: unknown
): Promise<{ created: number }> {
  const parsed = applyAutomaticAssignmentsSchema.parse(input);

  const referenceDate = parsed.referenceDate;
  const targetPeriodStart = parsed.periodStart ?? referenceDate;
  const targetPeriodEnd = parsed.periodEnd ?? null;
  const dueDate = parsed.dueDate ?? targetPeriodStart;

  const templateWhere: Prisma.MembershipFeeTemplateWhereInput = {
    organizationId,
    isActive: true,
    validFrom: { lte: referenceDate },
    AND: [
      {
        OR: [{ validUntil: null }, { validUntil: { gte: referenceDate } }],
      },
    ],
  };

  if (parsed.templateIds) {
    templateWhere.id = { in: parsed.templateIds };
  }

  const templates = await client.membershipFeeTemplate.findMany({
    where: templateWhere,
  });

  if (templates.length === 0) {
    return { created: 0 };
  }

  const memberWhere: Prisma.MemberWhereInput = {
    organizationId,
    AND: [
      {
        OR: [{ joinedAt: null }, { joinedAt: { lte: referenceDate } }],
      },
      {
        OR: [{ leftAt: null }, { leftAt: { gt: referenceDate } }],
      },
    ],
  };

  if (parsed.membershipType) {
    memberWhere.membershipType = parsed.membershipType;
  }

  const members = await client.member.findMany({
    where: memberWhere,
    select: { id: true, membershipType: true },
  });

  if (members.length === 0) {
    return { created: 0 };
  }

  const applicableTemplates = parsed.membershipType
    ? templates.filter((template) => !template.membershipType || template.membershipType === parsed.membershipType)
    : templates;

  if (applicableTemplates.length === 0) {
    return { created: 0 };
  }

  const templateIds = applicableTemplates.map((template) => template.id);
  const memberIds = members.map((member) => member.id);

  const existingAssignments = await client.memberFeeAssignment.findMany({
    where: {
      organizationId,
      memberId: { in: memberIds },
      templateId: { in: templateIds },
      periodStart: targetPeriodStart,
    },
    select: { memberId: true, templateId: true },
  });

  const existingKeys = new Set(existingAssignments.map((item) => `${item.memberId}:${item.templateId}`));
  const newKeys = new Set<string>();
  const assignmentsToCreate: Prisma.MemberFeeAssignmentCreateInput[] = [];

  for (const template of applicableTemplates) {
    for (const member of members) {
      if (template.membershipType && template.membershipType !== member.membershipType) {
        continue;
      }

      const key = `${member.id}:${template.id}`;
      if (existingKeys.has(key) || newKeys.has(key)) {
        continue;
      }

      newKeys.add(key);

      assignmentsToCreate.push({
        organization: { connect: { id: organizationId } },
        member: { connect: { id: member.id } },
        template: { connect: { id: template.id } },
        amount: template.amount,
        currency: template.currency ?? 'EUR',
        status: MemberFeeAssignmentStatus.PENDING,
        periodStart: targetPeriodStart,
        periodEnd: targetPeriodEnd ?? template.validUntil ?? null,
        dueDate,
        autoAssigned: true,
        assignedAt: new Date(),
      });
    }
  }

  if (assignmentsToCreate.length === 0) {
    return { created: 0 };
  }

  let created = 0;

  for (const assignmentInput of assignmentsToCreate) {
    const assignment = await client.memberFeeAssignment.create({ data: assignmentInput });
    created += 1;
    await createPendingMemberPaymentForAssignment(client, queue, organizationId, assignment);
  }

  return { created };
}

function assignmentNotFound(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'MEMBER_FEE_ASSIGNMENT_NOT_FOUND',
    detail: 'The requested member fee assignment was not found for this organization.',
  });
}

async function ensureMemberExists(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  memberId: string
): Promise<void> {
  const member = await client.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });

  if (!member) {
    throw new HttpProblemError({
      status: 404,
      title: 'MEMBER_NOT_FOUND',
      detail: 'The specified member was not found in this organization.',
    });
  }
}

async function ensureTemplateExists(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  templateId: string
) {
  const template = await client.membershipFeeTemplate.findFirst({
    where: { id: templateId, organizationId },
  });

  if (!template) {
    throw new HttpProblemError({
      status: 404,
      title: 'MEMBERSHIP_FEE_TEMPLATE_NOT_FOUND',
      detail: 'The specified template was not found in this organization.',
    });
  }

  return template;
}

async function ensureEntryExists(
  client: MemberFeeAssignmentClient,
  organizationId: string,
  entryId: string
): Promise<void> {
  const entry = await client.entry.findFirst({
    where: { id: entryId, organizationId },
    select: { id: true },
  });

  if (!entry) {
    throw new HttpProblemError({
      status: 404,
      title: 'ENTRY_NOT_FOUND',
      detail: 'The specified entry was not found in this organization.',
    });
  }
}

function isUniqueAssignmentError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes('member_fee_assignment_unique_period')
  );
}
