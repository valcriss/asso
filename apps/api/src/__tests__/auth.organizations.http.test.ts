import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { PrismaClient, UserRole } from '@prisma/client';
import { setupTestDatabase, teardownTestDatabase, resetDatabase, createPrismaClient } from './helpers/database';
import buildServer from '../server';

let app: FastifyInstance;
let prisma: PrismaClient;
const TEST_ACCESS_SECRET = 'orgs-access-secret-change-me-12345678901234567890';
const TEST_REFRESH_SECRET = 'orgs-refresh-secret-change-me-12345678901234567890';
const PASSWORD = 'Password1234!'; // >= 12 chars

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = TEST_ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_REFRESH_SECRET;
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  await setupTestDatabase();
  prisma = createPrismaClient();
  await prisma.$connect();
  app = await buildServer();
  await app.ready();

});

beforeEach(async () => {
  await resetDatabase();
  await seed();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await teardownTestDatabase();
});


describe.sequential('auth organizations listing', () => {
  it('returns requiresOrganizationSelection when multiple orgs and no org specified', async () => {
    const response = await request(app.server)
      .post('/api/v1/auth/login')
  .send({ email: 'multi@example.org', password: PASSWORD });
    expect(response.status).toBe(200);
    const body: { requiresOrganizationSelection?: boolean; organizations?: { id: string; name: string }[] } = response.body;
    expect(body.requiresOrganizationSelection).toBe(true);
    expect(body.organizations).toHaveLength(2);
    const names = (body.organizations ?? []).map((o) => o.name).sort();
    expect(names).toEqual(['Org A', 'Org B']);
  });

  it('lists organizations via /auth/organizations after authenticating', async () => {
    const orgA = await prisma.organization.findFirstOrThrow({ where: { name: 'Org A' } });
    const loginResponse = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: 'multi@example.org', password: PASSWORD, organizationId: orgA.id });
    expect(loginResponse.status).toBe(200);
    const { accessToken } = loginResponse.body as { accessToken: string };

    const listResponse = await request(app.server)
      .get('/api/v1/auth/organizations')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listResponse.status).toBe(200);
    const body: { organizations: { id: string; name: string }[] } = listResponse.body;
    expect(body.organizations).toHaveLength(2);
    const names = body.organizations.map((o) => o.name).sort();
    expect(names).toEqual(['Org A', 'Org B']);
  });
});

async function seed() {
  // Compute hash for password
  const realHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const orgA = await prisma.organization.create({ data: { name: 'Org A' } });
  const orgB = await prisma.organization.create({ data: { name: 'Org B' } });
  const user = await prisma.user.create({ data: { email: 'multi@example.org', passwordHash: realHash } });
  await prisma.userOrgRole.createMany({
    data: [
      { userId: user.id, organizationId: orgA.id, role: UserRole.ADMIN },
      { userId: user.id, organizationId: orgB.id, role: UserRole.VIEWER },
    ],
  });
}
