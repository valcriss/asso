import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, UserRole } from '@prisma/client';
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

describe('projects HTTP routes', () => {
  it('creates projects with periods and exposes zero actuals initially', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: 'PROJ-001',
        name: 'Festival annuel',
        plannedAmount: '2500.00',
        currency: 'EUR',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        periods: [
          { label: 'Préparation', plannedAmount: '500.00', startDate: '2025-01-01', endDate: '2025-03-31' },
          { label: 'Réalisation', plannedAmount: '2000.00', startDate: '2025-04-01', endDate: '2025-12-31' },
        ],
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.code).toBe('PROJ-001');
    expect(response.body.data.periods).toHaveLength(2);
    expect(response.body.data.actual.debit).toBe(0);
    expect(response.body.data.plannedAmount).toBeCloseTo(2500);

    const list = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(list.statusCode).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.totals.planned).toBeCloseTo(2500);
    expect(list.body.totals.actualNet).toBe(0);
  });

  it('computes actuals, variance and prevents deletion when linked lines exist', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const projectResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: 'ANIM-2025',
        name: 'Animations jeunesse',
        plannedAmount: '400.00',
        periods: [
          {
            label: 'T1',
            plannedAmount: '400.00',
            startDate: '2025-01-01',
            endDate: '2025-03-31',
          },
        ],
      });

    expect(projectResponse.statusCode).toBe(201);
    const projectId = projectResponse.body.data.id as string;

    const entryResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-02-15',
        memo: 'Atelier découverte',
        lines: [
          { accountId: fixtures.expenseAccount.id, debit: '500.00', projectId },
          { accountId: fixtures.bankAccount.id, credit: '500.00' },
        ],
      });

    expect(entryResponse.statusCode).toBe(201);

    const detail = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(detail.statusCode).toBe(200);
    expect(detail.body.data.actual.debit).toBeCloseTo(500);
    expect(detail.body.data.actual.net).toBeCloseTo(500);
    expect(detail.body.data.variance).toBeCloseTo(100);
    expect(detail.body.data.periods[0]?.actual.net).toBeCloseTo(500);

    const variance = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/projects/variance`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(variance.statusCode).toBe(200);
    expect(variance.body.data.totals.actualDebit).toBeCloseTo(500);
    expect(variance.body.data.totals.variance).toBeCloseTo(100);

    const deleteAttempt = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteAttempt.statusCode).toBe(409);
    expect(deleteAttempt.body.title).toBe('PROJECT_HAS_ENTRIES');

    const removable = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: 'ANIM-EMPTY', name: 'Projet vide', plannedAmount: '0' });

    const deleteSuccess = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/projects/${removable.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteSuccess.statusCode).toBe(204);
  });

  it('exports justification CSV with totals and variance rows', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const project = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: 'DOSSIER-2025',
        name: 'Dossier subvention',
        plannedAmount: '300.00',
        periods: [
          {
            label: 'Unique',
            plannedAmount: '300.00',
            startDate: '2025-01-01',
            endDate: '2025-12-31',
          },
        ],
      });

    const projectId = project.body.data.id as string;

    const entry = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-05-20',
        lines: [
          { accountId: fixtures.expenseAccount.id, debit: '280.00', projectId },
          { accountId: fixtures.bankAccount.id, credit: '280.00' },
        ],
      });

    expect(entry.statusCode).toBe(201);

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      await tx.attachment.create({
        data: {
          organizationId,
          entryId: entry.body.data.id,
          storageKey: 'attachments/test/invoice.pdf',
          url: 'https://files.example.org/invoice.pdf',
          filename: 'invoice.pdf',
          mime: 'application/pdf',
          sha256: 'abc123',
          byteSize: 1234,
          versionId: 'v1',
        },
      });
    });

    const exportResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/projects/${projectId}/export`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.headers['content-disposition']).toContain('project-dossier-2025');

    const csv = exportResponse.text.split('\n');
    expect(csv[0]).toContain('Entry Date;Journal;Reference;Account Code;Account Name;Debit;Credit;Net;Memo;Attachments');
    expect(csv[csv.length - 2]).toContain('PLANNED');
    expect(csv[csv.length - 1]).toContain('VARIANCE');
  });

  it('rejects access to locked organizations with a 423 response', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        accessLockedAt: new Date('2025-04-01T12:00:00Z'),
        accessLockedReason: 'Audit de conformité',
      },
    });

    const response = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.statusCode).toBe(423);
    expect(response.body.title).toBe('ORGANIZATION_LOCKED');
    expect(response.body.detail).toContain('super-admin');
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

interface AccountingFixtures {
  fiscalYear: { id: string };
  journal: { id: string };
  bankAccount: { id: string };
  expenseAccount: { id: string };
}

async function seedAccountingFixtures(organizationId: string): Promise<AccountingFixtures> {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

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
        code: 'OD',
        name: 'Opérations diverses',
        type: 'GENERAL',
      },
    });

    const bankAccount = await tx.account.create({
      data: {
        organizationId,
        code: '512000',
        name: 'Banque',
        type: 'ASSET',
      },
    });

    const expenseAccount = await tx.account.create({
      data: {
        organizationId,
        code: '606000',
        name: 'Achats non stockés',
        type: 'EXPENSE',
      },
    });

    return {
      fiscalYear: { id: fiscalYear.id },
      journal: { id: journal.id },
      bankAccount: { id: bankAccount.id },
      expenseAccount: { id: expenseAccount.id },
    } satisfies AccountingFixtures;
  });
}
