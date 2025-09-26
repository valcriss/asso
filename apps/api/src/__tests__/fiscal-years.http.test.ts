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

describe('fiscal years HTTP routes', () => {
  it('creates, lists and locks fiscal years', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/fiscal-years`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(createResponse.statusCode).toBe(201);
    const fiscalYearId = createResponse.body.data.id as string;

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/fiscal-years`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data.some((fy: { id: string }) => fy.id === fiscalYearId)).toBe(true);

    const lockResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/fiscal-years/${fiscalYearId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(lockResponse.statusCode).toBe(200);
    expect(lockResponse.body.data.status).toBe('LOCKED');

    const lockAudits = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'fiscal_year', entityId: fiscalYearId } });
    });
    expect(lockAudits.some((a) => a.action === 'FISCAL_YEAR_LOCKED')).toBe(true);

    const unlockResponse = await request(app.server)
      .delete(`/api/v1/orgs/${organizationId}/fiscal-years/${fiscalYearId}/lock`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(unlockResponse.statusCode).toBe(200);
    expect(unlockResponse.body.data.status).toBe('OPEN');

    const unlockAudits = await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, organizationId);
      return tx.auditLog.findMany({ where: { entity: 'fiscal_year', entityId: fiscalYearId } });
    });
    expect(unlockAudits.some((a) => a.action === 'FISCAL_YEAR_UNLOCKED')).toBe(true);
  });
});

async function createUserWithRole(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `fy-user+${Math.random().toString(16).slice(2)}@example.org`,
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
