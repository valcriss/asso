import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole, Prisma } from '@prisma/client';
import buildServer from '../server';
import {
  setupTestDatabase,
  teardownTestDatabase,
  resetDatabase,
  createPrismaClient,
  applyTenantContext,
} from './helpers/database';

const TEST_ACCESS_SECRET = 'test-access-secret-change-me-12345678901234567890';
const TEST_REFRESH_SECRET = 'test-refresh-secret-change-me-12345678901234567890';

let app: FastifyInstance;
let prisma: PrismaClient;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  process.env.NODE_ENV = 'test';

  await setupTestDatabase();

  prisma = createPrismaClient();
  await prisma.$connect();

  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await teardownTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('members and membership fees HTTP routes', () => {
  it('manages members through CRUD endpoints', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.SECRETARY);

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Marie',
        lastName: 'Curie',
        email: 'marie@example.org',
        membershipType: 'REGULAR',
        joinedAt: '2025-01-10',
      });

    expect(createResponse.statusCode).toBe(201);
    const memberId = createResponse.body.data.id as string;

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const getResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/members/${memberId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body.data.email).toBe('marie@example.org');

    const updateResponse = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/members/${memberId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ membershipType: 'HONORARY' });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.data.membershipType).toBe('HONORARY');

    const deleteResponse = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/members/${memberId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteResponse.statusCode).toBe(204);

    const afterDelete = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(afterDelete.body.data).toHaveLength(0);
  });

  it('manages membership fee templates and assignments including auto rules', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const members = await withTenant(organizationId, async (tx) => {
      const memberRegular = await tx.member.create({
        data: {
          organizationId,
          firstName: 'Alice',
          lastName: 'Martin',
          email: 'alice@asso.org',
          membershipType: 'REGULAR',
          joinedAt: new Date('2025-01-05'),
        },
      });

      const memberStudent = await tx.member.create({
        data: {
          organizationId,
          firstName: 'Bob',
          lastName: 'Student',
          email: 'bob@student.org',
          membershipType: 'STUDENT',
          joinedAt: new Date('2025-01-10'),
        },
      });

      return { memberRegular, memberStudent };
    });

    const templateRegular = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/membership-fee-templates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Cotisation annuelle',
        amount: '120.00',
        membershipType: 'REGULAR',
        validFrom: '2025-01-01',
        validUntil: '2025-12-31',
      });

    expect(templateRegular.statusCode).toBe(201);
    const templateRegularId = templateRegular.body.data.id as string;

    const templateStudent = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/membership-fee-templates`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Cotisation réduite',
        amount: '60.00',
        membershipType: 'STUDENT',
        validFrom: '2025-01-01',
        validUntil: '2025-12-31',
      });

    expect(templateStudent.statusCode).toBe(201);

    const applyResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/membership-fee-assignments/apply`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ referenceDate: '2025-03-15' });

    expect(applyResponse.statusCode).toBe(200);
    expect(applyResponse.body.data.created).toBe(2);

    const listAssignments = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/membership-fee-assignments`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listAssignments.statusCode).toBe(200);
    expect(listAssignments.body.data).toHaveLength(2);

    const entry = await withTenant(organizationId, (tx) => createEntryFixture(tx, organizationId));

    const manualAssignment = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/membership-fee-assignments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        memberId: members.memberRegular.id,
        templateId: templateRegularId,
        periodStart: '2025-06-01',
        dueDate: '2025-06-30',
        entryId: entry.id,
      });

    expect(manualAssignment.statusCode).toBe(201);
    const assignmentId = manualAssignment.body.data.id as string;

    const getAssignment = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/membership-fee-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getAssignment.statusCode).toBe(200);
    expect(getAssignment.body.data.entryId).toBe(entry.id);

    const deleteAssignment = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/membership-fee-assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteAssignment.statusCode).toBe(204);

    const assignmentsAfterDelete = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/membership-fee-assignments?memberId=${members.memberRegular.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(assignmentsAfterDelete.statusCode).toBe(200);
    expect(assignmentsAfterDelete.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

async function createUserWithRole(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `user+${Math.random().toString(16).slice(2)}@example.org`,
      passwordHash: 'test-hash',
    },
  });

  await prisma.userOrgRole.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role,
    },
  });

  const accessToken = app.issueAccessToken({
    userId: user.id,
    organizationId: organization.id,
    roles: [role],
    isSuperAdmin: false,
  });

  return { organizationId: organization.id, accessToken, userId: user.id };
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
      code: 'VTE',
      name: 'Ventes',
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
      code: '706000',
      name: 'Cotisations',
      type: 'REVENUE',
    },
  });

  const entry = await tx.entry.create({
    data: {
      organizationId,
      fiscalYearId: fiscalYear.id,
      journalId: journal.id,
      date: new Date('2025-06-01'),
      reference: '2025-VTE-000001',
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
