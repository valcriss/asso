import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, MemberFeeAssignmentStatus, Prisma } from '@prisma/client';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from '../../../../__tests__/helpers/database';
import {
  applyAutomaticAssignments,
  createMemberFeeAssignment,
  listMemberFeeAssignments,
} from '..';
import { createInMemoryMemberReminderQueue } from '../../../../lib/jobs/member-reminder-queue';

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

describe('member fee assignments service', () => {
  it('auto assigns templates to matching members based on type and date', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Auto Assign Org' } });
    const queue = createInMemoryMemberReminderQueue();

    await withTenant(organization.id, async (tx) => {
      await createMemberFixtures(tx, organization.id);
    });

    const result = await withTenant(organization.id, (tx) =>
      applyAutomaticAssignments(tx, queue, organization.id, { referenceDate: new Date('2025-03-01') })
    );

    expect(result.created).toBe(2);

    const assignments = await withTenant(organization.id, (tx) =>
      tx.memberFeeAssignment.findMany({
        where: { organizationId: organization.id },
        orderBy: { memberId: 'asc' },
        include: { template: true, member: true },
      })
    );

    expect(assignments).toHaveLength(2);
    expect(assignments.every((item) => item.status === MemberFeeAssignmentStatus.PENDING)).toBe(true);
    expect(assignments.map((item) => item.template.label).sort()).toEqual(['Annual Regular', 'Student Discount']);
    expect(assignments.every((item) => item.autoAssigned)).toBe(true);

    const payments = await withTenant(organization.id, (tx) =>
      tx.memberPayment.findMany({ where: { organizationId: organization.id }, orderBy: { memberId: 'asc' } })
    );
    expect(payments).toHaveLength(2);
    expect(queue.reminders).toHaveLength(payments.length * 2);
    expect(queue.reminders.every((reminder) => reminder.job.organizationId === organization.id)).toBe(true);
  });

  it('does not create duplicate assignments when applying rules twice', async () => {
    const organization = await prisma.organization.create({ data: { name: 'No Dup Org' } });
    const queue = createInMemoryMemberReminderQueue();

    await withTenant(organization.id, async (tx) => {
      await createMemberFixtures(tx, organization.id);
    });

    await withTenant(organization.id, (tx) =>
      applyAutomaticAssignments(tx, queue, organization.id, { referenceDate: new Date('2025-04-10') })
    );

    const second = await withTenant(organization.id, (tx) =>
      applyAutomaticAssignments(tx, queue, organization.id, { referenceDate: new Date('2025-04-10') })
    );

    expect(second.created).toBe(0);

    const assignments = await withTenant(organization.id, (tx) =>
      tx.memberFeeAssignment.findMany({ where: { organizationId: organization.id } })
    );

    expect(assignments).toHaveLength(2);
    const payments = await withTenant(organization.id, (tx) =>
      tx.memberPayment.findMany({ where: { organizationId: organization.id } })
    );
    expect(payments).toHaveLength(2);
  });

  it('skips members outside of template validity window', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Validity Org' } });
    const queue = createInMemoryMemberReminderQueue();

    await withTenant(organization.id, async (tx) => {
      const { templateStudent } = await createMemberFixtures(tx, organization.id);

      await tx.member.update({
        where: { organizationId_email: { organizationId: organization.id, email: 'lea@student.org' } },
        data: { leftAt: new Date('2025-02-01') },
      });

      await tx.membershipFeeTemplate.update({
        where: { id: templateStudent.id },
        data: { validUntil: new Date('2025-01-31') },
      });
    });

    const result = await withTenant(organization.id, (tx) =>
      applyAutomaticAssignments(tx, queue, organization.id, { referenceDate: new Date('2025-03-01') })
    );

    expect(result.created).toBe(1);

    const assignments = await withTenant(organization.id, (tx) =>
      tx.memberFeeAssignment.findMany({ where: { organizationId: organization.id } })
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.templateId).toBeTruthy();
  });

  it('creates manual assignments linked to entries', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Manual Org' } });

    const { member, template, entry } = await withTenant(organization.id, async (tx) => {
      const fixtures = await createMemberFixtures(tx, organization.id);
      const entryRecord = await createEntryFixture(tx, organization.id);

      return { member: fixtures.memberRegular, template: fixtures.templateRegular, entry: entryRecord };
    });

    const queue = createInMemoryMemberReminderQueue();

    const created = await withTenant(organization.id, (tx) =>
      createMemberFeeAssignment(tx, queue, organization.id, {
        memberId: member.id,
        templateId: template.id,
        periodStart: new Date('2025-05-01'),
        dueDate: new Date('2025-05-31'),
        entryId: entry.id,
      })
    );

    expect(created.entryId).toBe(entry.id);

    const payment = await withTenant(organization.id, (tx) =>
      tx.memberPayment.findUniqueOrThrow({ where: { assignmentId: created.id } })
    );
    expect(payment.status).toBe('PENDING');

    const list = await withTenant(organization.id, (tx) =>
      listMemberFeeAssignments(tx, organization.id, { memberId: member.id })
    );

    expect(list).toHaveLength(1);
    expect(list[0]?.dueDate).toBeTruthy();
  });
});

async function withTenant<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);
    return fn(tx);
  });
}

async function createMemberFixtures(tx: Prisma.TransactionClient, organizationId: string) {
  const templateRegular = await tx.membershipFeeTemplate.create({
    data: {
      organizationId,
      label: 'Annual Regular',
      amount: new Prisma.Decimal('120.00'),
      currency: 'EUR',
      membershipType: 'REGULAR',
      validFrom: new Date('2025-01-01'),
      validUntil: new Date('2025-12-31'),
    },
  });

  const templateStudent = await tx.membershipFeeTemplate.create({
    data: {
      organizationId,
      label: 'Student Discount',
      amount: new Prisma.Decimal('60.00'),
      currency: 'EUR',
      membershipType: 'STUDENT',
      validFrom: new Date('2025-01-01'),
      validUntil: new Date('2025-12-31'),
    },
  });

  const memberRegular = await tx.member.create({
    data: {
      organizationId,
      firstName: 'Alex',
      lastName: 'Durand',
      email: 'alex@asso.org',
      membershipType: 'REGULAR',
      joinedAt: new Date('2025-01-05'),
    },
  });

  const memberStudent = await tx.member.create({
    data: {
      organizationId,
      firstName: 'Lea',
      lastName: 'Martin',
      email: 'lea@student.org',
      membershipType: 'STUDENT',
      joinedAt: new Date('2025-01-10'),
    },
  });

  return { templateRegular, templateStudent, memberRegular, memberStudent };
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
      code: 'SALES',
      name: 'Sales Journal',
      type: 'SALES',
    },
  });

  const debitAccount = await tx.account.create({
    data: {
      organizationId,
      code: '411000',
      name: 'Clients',
      type: 'ASSET',
    },
  });

  const creditAccount = await tx.account.create({
    data: {
      organizationId,
      code: '706100',
      name: 'Cotisations',
      type: 'REVENUE',
    },
  });

  const entry = await tx.entry.create({
    data: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      journalId: journal.id,
      date: new Date('2025-05-01'),
      reference: '2025-SAL-000001',
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

  return entry;
}
