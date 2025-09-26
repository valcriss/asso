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

describe('entries HTTP routes', () => {
  it('creates balanced entries with sequential references', async () => {
    const { organizationId, accessToken, userId } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-01-10',
        memo: 'Cotisation annuelle',
        lines: [
          { accountId: fixtures.debitAccount.id, debit: '150.00' },
          { accountId: fixtures.creditAccount.id, credit: '150.00' },
        ],
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.data.reference).toBe('2025-BAN-000001');
    expect(createResponse.body.data.lines).toHaveLength(2);
    expect(Number(createResponse.body.data.lines[0].debit)).toBeCloseTo(150);
    expect(Number(createResponse.body.data.lines[1].credit)).toBeCloseTo(150);

    const secondResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-02-15',
        lines: [
          { accountId: fixtures.debitAccount.id, debit: '90.00' },
          { accountId: fixtures.creditAccount.id, credit: '90.00' },
        ],
      });

    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.body.data.reference).toBe('2025-BAN-000002');

    const entries = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.entry.findMany({
        where: { organizationId },
        include: { lines: true },
        orderBy: { createdAt: 'asc' },
      });
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].createdBy).toBe(userId);
  });

  it('rejects entries that are not balanced', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-03-01',
        lines: [
          { accountId: fixtures.debitAccount.id, debit: '100.00' },
          { accountId: fixtures.creditAccount.id, credit: '90.00' },
        ],
      });

    expect(response.statusCode).toBe(422);
    expect(response.body.title).toBe('ENTRY_NOT_BALANCED');
  });

  it('rejects entries when the fiscal year is locked', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId, { lockFiscalYear: true });

    const response = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-04-01',
        lines: [
          { accountId: fixtures.debitAccount.id, debit: '50.00' },
          { accountId: fixtures.creditAccount.id, credit: '50.00' },
        ],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.title).toBe('FISCAL_YEAR_LOCKED');
  });

  it('locks entries and prevents double locking', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const creation = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fiscalYear.id,
        journalId: fixtures.journal.id,
        date: '2025-05-01',
        lines: [
          { accountId: fixtures.debitAccount.id, debit: '75.00' },
          { accountId: fixtures.creditAccount.id, credit: '75.00' },
        ],
      });

    const entryId = creation.body.data.id as string;

    const lockResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries/${entryId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(lockResponse.statusCode).toBe(200);
    expect(lockResponse.body.data.lockedAt).toBeTruthy();

    const secondLock = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries/${entryId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(secondLock.statusCode).toBe(409);
    expect(secondLock.body.title).toBe('ENTRY_ALREADY_LOCKED');

    // Audit log created on first lock
    const audits = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'entry', entityId: entryId } });
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].action).toBe('ENTRY_LOCKED');
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

interface AccountingFixturesOptions {
  lockFiscalYear?: boolean;
}

async function seedAccountingFixtures(organizationId: string, options: AccountingFixturesOptions = {}) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const fiscalYear = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        lockedAt: options.lockFiscalYear ? new Date('2025-12-31T23:59:59Z') : null,
      },
    });

    const journal = await tx.journal.create({
      data: {
        organizationId,
        code: 'BAN',
        name: 'Banque',
        type: 'BANK',
      },
    });

    const debitAccount = await tx.account.create({
      data: {
        organizationId,
        code: '512000',
        name: 'Banque',
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

    return {
      fiscalYear,
      journal,
      debitAccount,
      creditAccount,
    };
  });
}
