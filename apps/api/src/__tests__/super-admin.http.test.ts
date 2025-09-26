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

describe('super-admin HTTP routes', () => {
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

  it('lists organizations with search and status filters', async () => {
    const superAdmin = await createSuperAdminUser();

    const activeOrg = await prisma.organization.create({ data: { name: 'Ateliers Solidaires' } });
    const lockedOrg = await prisma.organization.create({
      data: {
        name: 'Festival Lumière',
        accessLockedAt: new Date('2025-01-01T10:00:00Z'),
        accessLockedBy: superAdmin.userId,
        accessLockedReason: 'Audit de conformité',
      },
    });

    await prisma.$transaction(async (tx) => {
      await applyTenantContext(tx, lockedOrg.id);
      await tx.project.create({
        data: {
          organizationId: lockedOrg.id,
          code: 'PROJ-2025',
          name: 'Animations 2025',
          currency: 'EUR',
        },
      });
    });

    const searchResponse = await request(app.server)
      .get('/api/v1/super-admin/organizations?q=Festival')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.body.data).toHaveLength(1);
    expect(searchResponse.body.data[0]).toMatchObject({
      id: lockedOrg.id,
      name: 'Festival Lumière',
      status: 'LOCKED',
      projectCount: 1,
      lockReason: 'Audit de conformité',
    });

    const lockedResponse = await request(app.server)
      .get('/api/v1/super-admin/organizations?status=locked')
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);

    expect(lockedResponse.statusCode).toBe(200);
    expect(lockedResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lockedOrg.id }),
      ])
    );
    expect(lockedResponse.body.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeOrg.id }),
      ])
    );
  });

  it('locks and unlocks an organization with reason tracking', async () => {
    const superAdmin = await createSuperAdminUser();
    const organization = await prisma.organization.create({ data: { name: 'Maison des Jeunes' } });

    const lockResponse = await request(app.server)
      .post(`/api/v1/super-admin/organizations/${organization.id}/lock`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`)
      .send({ reason: 'Suspicion de fraude' });

    expect(lockResponse.statusCode).toBe(200);
    expect(lockResponse.body.data.status).toBe('LOCKED');
    expect(lockResponse.body.data.lockReason).toBe('Suspicion de fraude');

    const storedAfterLock = await prisma.organization.findUnique({ where: { id: organization.id } });
    expect(storedAfterLock?.accessLockedBy).toBe(superAdmin.userId);

    const unlockResponse = await request(app.server)
      .delete(`/api/v1/super-admin/organizations/${organization.id}/lock`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);

    expect(unlockResponse.statusCode).toBe(200);
    expect(unlockResponse.body.data.status).toBe('ACTIVE');

    const storedAfterUnlock = await prisma.organization.findUnique({ where: { id: organization.id } });
    expect(storedAfterUnlock?.accessLockedAt).toBeNull();
    expect(storedAfterUnlock?.accessLockedReason).toBeNull();
  });

  it('rotates secrets and returns the newly issued token', async () => {
    const superAdmin = await createSuperAdminUser();
    const organization = await prisma.organization.create({ data: { name: 'Collectif Numérique' } });

    const rotateResponse = await request(app.server)
      .post(`/api/v1/super-admin/organizations/${organization.id}/rotate-secret`)
      .set('Authorization', `Bearer ${superAdmin.accessToken}`);

    expect(rotateResponse.statusCode).toBe(200);
    expect(rotateResponse.body.data.secret).toBeDefined();
    expect(rotateResponse.body.data.secret).toHaveLength(32);
    expect(rotateResponse.body.data.hasActiveSecret).toBe(true);

    const stored = await prisma.organization.findUnique({ where: { id: organization.id } });
    expect(stored?.apiSecret).toBe(rotateResponse.body.data.secret);
    expect(stored?.apiSecretRotatedAt).not.toBeNull();
  });

  it('rejects access for non super-admin users', async () => {
    const regular = await createStandardUser(UserRole.ADMIN);

    const response = await request(app.server)
      .get('/api/v1/super-admin/organizations')
      .set('Authorization', `Bearer ${regular.accessToken}`);

    expect(response.statusCode).toBe(403);
  });
});

async function createSuperAdminUser() {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `superadmin+${Math.random().toString(16).slice(2)}@example.org`,
      passwordHash: 'test-hash',
      isSuperAdmin: true,
    },
  });

  await prisma.userOrgRole.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: UserRole.ADMIN,
    },
  });

  const accessToken = app.issueAccessToken({
    userId: user.id,
    organizationId: organization.id,
    roles: [UserRole.ADMIN],
    isSuperAdmin: true,
  });

  return { accessToken, userId: user.id, organizationId: organization.id };
}

async function createStandardUser(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: `Org ${Date.now()}` } });
  const user = await prisma.user.create({
    data: {
      email: `user+${Math.random().toString(16).slice(2)}@example.org`,
      passwordHash: 'test-hash',
    },
  });

  await prisma.userOrgRole.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role,
    },
  });

  const accessToken = app.issueAccessToken({
    userId: user.id,
    organizationId: organization.id,
    roles: [role],
    isSuperAdmin: false,
  });

  return { accessToken, userId: user.id, organizationId: organization.id };
}
