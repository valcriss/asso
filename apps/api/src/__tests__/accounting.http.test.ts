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

describe('accounting HTTP routes', () => {
  it('manages accounts lifecycle', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/accounts`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toEqual([]);

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '512', name: 'Banque', type: 'ASSET' });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.data.code).toBe('512');

    const importResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/accounts/import-default`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.body.imported).toBeGreaterThanOrEqual(0);

    const createdAccountId = createResponse.body.data.id;
    const patchResponse = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Banque principale', isActive: false });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.body.data.name).toBe('Banque principale');
    expect(patchResponse.body.data.isActive).toBe(false);

    const duplicateResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/accounts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '512', name: 'Doublon', type: 'ASSET' });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.body.title).toBe('ACCOUNT_CODE_ALREADY_EXISTS');
  });

  it('manages journals lifecycle', async () => {
    const { organizationId, accessToken } = await createUserWithRole(UserRole.TREASURER);

    const listResponse = await request(app.server)
      .get(`/api/v1/orgs/${organizationId}/journals`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data).toEqual([]);

    const createResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/journals`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: 'BAN', name: 'Banque', type: 'BANK' });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.data.code).toBe('BAN');

    const importResponse = await request(app.server)
      .post(`/api/v1/orgs/${organizationId}/journals/import-default`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(importResponse.statusCode).toBe(201);
    expect(importResponse.body.imported).toBeGreaterThanOrEqual(0);

    const journalId = createResponse.body.data.id;
    const patchResponse = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/journals/${journalId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Journal Banque', type: 'BANK' });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.body.data.name).toBe('Journal Banque');

    const incompatibleResponse = await request(app.server)
      .patch(`/api/v1/orgs/${organizationId}/journals/${journalId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'CASH' });

    expect(incompatibleResponse.statusCode).toBe(400);
    expect(incompatibleResponse.body.title).toBe('JOURNAL_TYPE_INCOMPATIBLE');
  });

  it('prevents accessing another organization data', async () => {
    const alice = await createUserWithRole(UserRole.TREASURER);
    const bob = await createUserWithRole(UserRole.TREASURER);

    const response = await request(app.server)
      .get(`/api/v1/orgs/${bob.organizationId}/accounts`)
      .set('Authorization', `Bearer ${alice.accessToken}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.title).toBe('FORBIDDEN_ORGANIZATION_ACCESS');
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
  });

  return { organizationId: organization.id, accessToken };
}
