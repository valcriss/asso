import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemberPaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from '../../../../__tests__/helpers/database';
import {
  createPendingMemberPaymentForAssignment,
  getMemberPayment,
  linkMemberPaymentJustification,
  markMemberPaymentAsOverdue,
  markMemberPaymentAsPaid,
} from '..';
import { createInMemoryMemberReminderQueue } from '../../../../lib/jobs/member-reminder-queue';
import type { MemberReminderQueue } from '../../../../lib/jobs/member-reminder-queue';

let prisma: PrismaClient;

beforeAll(async () => {
  await setupTestDatabase();
  prisma = createPrismaClient();
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  await teardownTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('member payments service', () => {
  it('marks payments as paid and links accounting entry', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Paid Org' } });
    const queue = createInMemoryMemberReminderQueue();

    const { assignment, entry } = await withTenant(organization.id, async (tx) => {
      const fixtures = await createAssignmentFixture(tx, organization.id);
      const entryRecord = await createEntryFixture(tx, organization.id);
      const createdAssignment = await tx.memberFeeAssignment.create({
        data: {
          organizationId: organization.id,
          memberId: fixtures.member.id,
          templateId: fixtures.template.id,
          amount: fixtures.template.amount,
          currency: fixtures.template.currency ?? 'EUR',
          status: 'PENDING',
          periodStart: new Date('2025-01-01'),
          dueDate: new Date('2025-02-01'),
        },
      });

      await createPendingMemberPaymentForAssignment(tx, queue, organization.id, createdAssignment);

      return { assignment: createdAssignment, entry: entryRecord };
    });

    const paymentBefore = await withTenant(organization.id, (tx) =>
      tx.memberPayment.findUniqueOrThrow({ where: { assignmentId: assignment.id } })
    );
    expect(paymentBefore.status).toBe(MemberPaymentStatus.PENDING);

    const updated = await withTenant(organization.id, (tx) =>
      markMemberPaymentAsPaid(tx, organization.id, paymentBefore.id, {
        entryId: entry.id,
        paidAt: new Date('2025-02-03'),
      })
    );

    expect(updated.status).toBe(MemberPaymentStatus.PAID);
    expect(updated.entryId).toBe(entry.id);
    expect(updated.paidAt).not.toBeNull();

    const assignmentAfter = await withTenant(organization.id, (tx) =>
      tx.memberFeeAssignment.findUniqueOrThrow({ where: { id: assignment.id } })
    );
    expect(assignmentAfter.status).toBe('PAID');
    expect(assignmentAfter.entryId).toBe(entry.id);
  });

  it('marks payments as overdue', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Overdue Org' } });
    const queue = createInMemoryMemberReminderQueue();

    const payment = await withTenant(organization.id, async (tx) => {
      const { assignment } = await createAssignmentAndPayment(tx, queue, organization.id);
      return tx.memberPayment.findUniqueOrThrow({ where: { assignmentId: assignment.id } });
    });

    const updated = await withTenant(organization.id, (tx) =>
      markMemberPaymentAsOverdue(tx, organization.id, payment.id)
    );

    expect(updated.status).toBe(MemberPaymentStatus.OVERDUE);
  });

  it('links supporting document to payment', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Justification Org' } });
    const queue = createInMemoryMemberReminderQueue();

    const { payment, attachment } = await withTenant(organization.id, async (tx) => {
      const { assignment } = await createAssignmentAndPayment(tx, queue, organization.id);
      const entryRecord = await createEntryFixture(tx, organization.id);

      await tx.memberPayment.update({
        where: { assignmentId: assignment.id },
        data: { entryId: entryRecord.id },
      });

      const attachment = await tx.attachment.create({
        data: {
          organizationId: organization.id,
          entryId: entryRecord.id,
          storageKey: 'attachments/test/doc.pdf',
          url: 'https://cdn.example.org/doc.pdf',
          filename: 'doc.pdf',
          mime: 'application/pdf',
          sha256: 'abc123',
          byteSize: 2048,
          versionId: 'v1',
        },
      });

      const paymentRecord = await tx.memberPayment.findUniqueOrThrow({ where: { assignmentId: assignment.id } });
      return { payment: paymentRecord, attachment };
    });

    const updated = await withTenant(organization.id, (tx) =>
      linkMemberPaymentJustification(tx, organization.id, payment.id, { attachmentId: attachment.id })
    );

    expect(updated.supportingDocumentId).toBeTruthy();
    const fetched = await withTenant(organization.id, (tx) => getMemberPayment(tx, organization.id, payment.id));
    expect(fetched.supportingDocumentId).toBe(updated.supportingDocumentId);
  });
});

async function createAssignmentAndPayment(
  tx: Prisma.TransactionClient,
  queue: MemberReminderQueue,
  organizationId: string
) {
  const fixtures = await createAssignmentFixture(tx, organizationId);
  const assignment = await tx.memberFeeAssignment.create({
    data: {
      organizationId,
      memberId: fixtures.member.id,
      templateId: fixtures.template.id,
      amount: fixtures.template.amount,
      currency: fixtures.template.currency ?? 'EUR',
      status: 'PENDING',
      periodStart: new Date('2025-01-01'),
      dueDate: new Date('2025-02-01'),
    },
  });

  await createPendingMemberPaymentForAssignment(tx, queue, organizationId, assignment);
  const payment = await tx.memberPayment.findUniqueOrThrow({ where: { assignmentId: assignment.id } });

  return { assignment, payment };
}

async function createAssignmentFixture(tx: Prisma.TransactionClient, organizationId: string) {
  const member = await tx.member.create({
    data: {
      organizationId,
      firstName: 'Nora',
      lastName: 'Guillaume',
      email: 'nora@example.org',
      membershipType: 'REGULAR',
    },
  });

  const template = await tx.membershipFeeTemplate.create({
    data: {
      organizationId,
      label: 'Annual Fee',
      amount: new Prisma.Decimal('120.00'),
      currency: 'EUR',
      validFrom: new Date('2025-01-01'),
    },
  });

  return { member, template };
}

async function createEntryFixture(tx: Prisma.TransactionClient, organizationId: string) {
  const fiscalYear = await tx.fiscalYear.create({
    data: {
      organizationId,
      label: 'FY2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
    },
  });

  const journal = await tx.journal.create({
    data: {
      organizationId,
      code: 'BANK',
      name: 'Bank',
      type: 'BANK',
    },
  });

  const debitAccount = await tx.account.create({
    data: {
      organizationId,
      code: '512000',
      name: 'Bank',
      type: 'ASSET',
    },
  });

  const creditAccount = await tx.account.create({
    data: {
      organizationId,
      code: '706000',
      name: 'Cotisations',
      type: 'REVENUE',
    },
  });

  return tx.entry.create({
    data: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      journalId: journal.id,
      date: new Date('2025-02-01'),
      reference: 'FY2025-BANK-0001',
      lines: {
        create: [
          {
            organizationId,
            accountId: debitAccount.id,
            debit: new Prisma.Decimal('120.00'),
          },
          {
            organizationId,
            accountId: creditAccount.id,
            credit: new Prisma.Decimal('120.00'),
          },
        ],
      },
    },
  });
}

async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);
    return fn(tx);
  });
}
