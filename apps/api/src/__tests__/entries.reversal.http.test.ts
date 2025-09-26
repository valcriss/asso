import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import buildServer from '../server';
import { setupTestDatabase, teardownTestDatabase, resetDatabase, createPrismaClient, applyTenantContext } from './helpers/database';

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

describe('entry reversal', () => {
  it('creates a reversal entry for a locked original', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);
    const fixtures = await seedAccountingFixtures(organizationId);

    const created = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fiscalYearId: fixtures.fy2025.id,
        journalId: fixtures.journal.id,
        date: '2025-06-01',
        memo: 'Erreur à corriger',
        lines: [
          { accountId: fixtures.bank.id, debit: '100.00' },
          { accountId: fixtures.revenue.id, credit: '100.00' },
        ],
      });
    expect(created.statusCode).toBe(201);
    const entryId = created.body.data.id as string;

    const locked = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries/${entryId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(locked.statusCode).toBe(200);

    const reversal = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/entries/${entryId}/reverse`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fiscalYearId: fixtures.fy2026.id, date: '2026-01-10' });
    expect(reversal.statusCode).toBe(201);
    expect(reversal.body.data.lines).toHaveLength(2);
    expect(Number(reversal.body.data.lines[0].credit)).toBeCloseTo(100);
    expect(Number(reversal.body.data.lines[1].debit)).toBeCloseTo(100);

    // Totals check via DB
    const totals = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      const lines = await tx.entryLine.findMany({ where: { entryId: reversal.body.data.id } });
      return lines.reduce(
        (acc, l) => ({ debit: acc.debit.add(l.debit), credit: acc.credit.add(l.credit) }),
        { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
      );
    });
    expect(Number(totals.debit.toFixed(2))).toBeCloseTo(100);
    expect(Number(totals.credit.toFixed(2))).toBeCloseTo(100);
  });
});

async function createUserWithRole(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `rev-user+${Math.random().toString(16).slice(2)}@example.org`,
      passwordHash: 'test-hash',
    },
  });

  await prisma.userOrgRole.create({ data: { organizationId: organization.id, userId: user.id, role } });

  const accessToken = app.issueAccessToken({
    userId: user.id,
    organizationId: organization.id,
    roles: [role],
    isSuperAdmin: false,
  });

  return { organizationId: organization.id, accessToken };
}

async function seedAccountingFixtures(organizationId: string) {
  return prisma.$transaction(async (tx) => {
    await applyTenantContext(tx, organizationId);

    const fy2025 = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });
    const fy2026 = await tx.fiscalYear.create({
      data: {
        organizationId,
        label: 'FY2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const journal = await tx.journal.create({ data: { organizationId, code: 'BAN', name: 'Banque', type: 'BANK' } });
    const bank = await tx.account.create({ data: { organizationId, code: '512000', name: 'Banque', type: 'ASSET' } });
    const revenue = await tx.account.create({ data: { organizationId, code: '706000', name: 'Produits', type: 'REVENUE' } });
    return { fy2025, fy2026, journal, bank, revenue };
  });
}

