import {
  MemberFeeAssignment,
  MemberFeeAssignmentStatus,
  MemberPayment,
  MemberPaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { HttpProblemError } from '../../../lib/problem-details';
import type { MemberReminderQueue } from '../../../lib/jobs/member-reminder-queue';
import {
  linkPaymentJustificationSchema,
  recordMemberPaymentSchema,
  type LinkPaymentJustificationInput,
  type RecordMemberPaymentInput,
} from './schemas';

const BEFORE_DUE_REMINDER_HOURS = 72;
const AFTER_DUE_REMINDER_HOURS = 24;
const HOUR_IN_MS = 60 * 60 * 1000;

export type MemberPaymentClient = PrismaClient | Prisma.TransactionClient;

type AssignmentForPayment = Pick<
  MemberFeeAssignment,
  'id' | 'memberId' | 'amount' | 'currency' | 'dueDate' | 'periodStart' | 'periodEnd'
>;

export async function createPendingMemberPaymentForAssignment(
  client: MemberPaymentClient,
  queue: MemberReminderQueue,
  organizationId: string,
  assignment: AssignmentForPayment
): Promise<MemberPayment> {
  const existing = await client.memberPayment.findFirst({
    where: { organizationId, assignmentId: assignment.id },
  });

  if (existing) {
    return existing;
  }

  const dueDate = resolveDueDate(assignment);

  const payment = await client.memberPayment.create({
    data: {
      organization: { connect: { id: organizationId } },
      assignment: { connect: { id: assignment.id } },
      member: { connect: { id: assignment.memberId } },
      status: MemberPaymentStatus.PENDING,
      amount: assignment.amount,
      currency: assignment.currency,
      dueDate,
    },
  });

  if (dueDate) {
    await queue.scheduleMemberPaymentReminder({
      job: {
        organizationId,
        memberPaymentId: payment.id,
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        dueDate: dueDate.toISOString(),
        trigger: 'BEFORE_DUE',
      },
      runAt: adjustRunAt(new Date(dueDate.getTime() - BEFORE_DUE_REMINDER_HOURS * HOUR_IN_MS)),
    });

    await queue.scheduleMemberPaymentReminder({
      job: {
        organizationId,
        memberPaymentId: payment.id,
        assignmentId: assignment.id,
        memberId: assignment.memberId,
        dueDate: dueDate.toISOString(),
        trigger: 'AFTER_DUE',
      },
      runAt: adjustRunAt(new Date(dueDate.getTime() + AFTER_DUE_REMINDER_HOURS * HOUR_IN_MS)),
    });
  }

  return payment;
}

export async function markMemberPaymentAsPaid(
  client: MemberPaymentClient,
  organizationId: string,
  paymentId: string,
  input: unknown
): Promise<MemberPayment> {
  const parsed = recordMemberPaymentSchema.parse(input);

  const payment = await ensurePayment(client, organizationId, paymentId);

  await ensureEntryExists(client, organizationId, parsed.entryId);

  const paidAt = parsed.paidAt ?? new Date();

  const updated = await client.memberPayment.update({
    where: { id: payment.id },
    data: {
      status: MemberPaymentStatus.PAID,
      paidAt,
      entry: { connect: { id: parsed.entryId } },
    },
  });

  await client.memberFeeAssignment.update({
    where: { id: payment.assignmentId },
    data: {
      status: MemberFeeAssignmentStatus.PAID,
      entry: { connect: { id: parsed.entryId } },
    },
  });

  return updated;
}

export async function markMemberPaymentAsOverdue(
  client: MemberPaymentClient,
  organizationId: string,
  paymentId: string
): Promise<MemberPayment> {
  const payment = await ensurePayment(client, organizationId, paymentId);

  if (payment.status === MemberPaymentStatus.PAID) {
    throw new HttpProblemError({
      status: 409,
      title: 'MEMBER_PAYMENT_ALREADY_PAID',
      detail: 'Cannot mark a paid member payment as overdue.',
    });
  }

  const updated = await client.memberPayment.update({
    where: { id: payment.id },
    data: {
      status: MemberPaymentStatus.OVERDUE,
    },
  });

  return updated;
}

export async function linkMemberPaymentJustification(
  client: MemberPaymentClient,
  organizationId: string,
  paymentId: string,
  input: unknown
): Promise<MemberPayment> {
  const parsed = linkPaymentJustificationSchema.parse(input);

  const payment = await ensurePayment(client, organizationId, paymentId);

  const attachment = await client.attachment.findFirst({
    where: { id: parsed.attachmentId, organizationId },
    select: { id: true, entryId: true },
  });

  if (!attachment) {
    throw new HttpProblemError({
      status: 404,
      title: 'ATTACHMENT_NOT_FOUND',
      detail: 'The specified attachment was not found for this organization.',
    });
  }

  if (payment.entryId && payment.entryId !== attachment.entryId) {
    throw new HttpProblemError({
      status: 409,
      title: 'ATTACHMENT_ENTRY_MISMATCH',
      detail: 'The attachment must belong to the payment entry.',
    });
  }

  const updated = await client.memberPayment.update({
    where: { id: payment.id },
    data: {
      supportingDocument: { connect: { id: attachment.id } },
    },
  });

  return updated;
}

export async function getMemberPayment(
  client: MemberPaymentClient,
  organizationId: string,
  paymentId: string
): Promise<MemberPayment> {
  const payment = await client.memberPayment.findFirst({
    where: { id: paymentId, organizationId },
  });

  if (!payment) {
    throw memberPaymentNotFound();
  }

  return payment;
}

async function ensurePayment(
  client: MemberPaymentClient,
  organizationId: string,
  paymentId: string
): Promise<MemberPayment> {
  const payment = await client.memberPayment.findFirst({
    where: { id: paymentId, organizationId },
  });

  if (!payment) {
    throw memberPaymentNotFound();
  }

  return payment;
}

async function ensureEntryExists(
  client: MemberPaymentClient,
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
      detail: 'The specified entry was not found for this organization.',
    });
  }
}

function memberPaymentNotFound(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'MEMBER_PAYMENT_NOT_FOUND',
    detail: 'The requested member payment could not be found for this organization.',
  });
}

function resolveDueDate(assignment: AssignmentForPayment): Date | null {
  if (assignment.dueDate) {
    return assignment.dueDate;
  }

  if (assignment.periodEnd) {
    return assignment.periodEnd;
  }

  return assignment.periodStart ?? null;
}

function adjustRunAt(target: Date): Date {
  const now = Date.now();
  if (target.getTime() <= now) {
    return new Date(now);
  }

  return target;
}
