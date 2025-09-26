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
import { hashPassword } from '../lib/auth/password';

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

  await app.register(async (instance) => {
    instance.get(
      '/api/v1/test/finance',
      {
        preHandler: instance.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN),
      },
      async () => ({ ok: true })
    );
  });

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

describe('auth routes', () => {
  it('registers a new organization administrator', async () => {
    const response = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'admin@example.org',
        password: 'SuperSecurePass123!',
        organization: { name: 'Demo Org' },
      });

    expect(response.status).toBe(201);

    const body = response.body;

    expect(body.accessToken).toBeTypeOf('string');
    expect(body.refreshToken).toBeTypeOf('string');
    expect(body.roles).toEqual([UserRole.ADMIN]);

    const createdUser = await prisma.user.findUnique({
      where: { email: 'admin@example.org' },
      include: { roles: true, refreshTokens: true },
    });

    expect(createdUser).not.toBeNull();
    expect(createdUser?.roles).toHaveLength(1);
    expect(createdUser?.roles[0]?.role).toBe(UserRole.ADMIN);
    expect(createdUser?.refreshTokens).toHaveLength(1);
  });

  it('logs in an existing user with valid credentials', async () => {
    const { organizationId, email, password } = await seedUserWithRole(UserRole.ADMIN);

    const response = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
        organizationId,
      });

    expect(response.status).toBe(200);
    const body = response.body;

    expect(body.roles).toContain(UserRole.ADMIN);
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.refreshToken).toBeTypeOf('string');
  });

  it('rejects invalid login attempts', async () => {
    const { organizationId, email } = await seedUserWithRole(UserRole.ADMIN);

    const response = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'WrongPassword123!',
        organizationId,
      });

    expect(response.status).toBe(401);
    const body = response.body;
    expect(body.title).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens on refresh', async () => {
    const registerResponse = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'rotate@example.org',
        password: 'AnotherSecurePass123!',
        organization: { name: 'Rotate Org' },
      });

    const registerBody = registerResponse.body;
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'rotate@example.org' },
      include: { refreshTokens: true, roles: true },
    });

    const refreshResponse = await request(app.server)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: registerBody.refreshToken,
      });

    expect(refreshResponse.status).toBe(200);
    const refreshBody = refreshResponse.body;

    expect(refreshBody.refreshToken).toBeTypeOf('string');
    expect(refreshBody.accessToken).toBeTypeOf('string');

    const updatedTokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(updatedTokens).toHaveLength(2);
    const [oldToken, newToken] = updatedTokens;
    expect(oldToken.revokedAt).not.toBeNull();
    expect(oldToken.replacedByTokenId).toBe(newToken.id);
  });

  it('prevents reuse of revoked refresh tokens', async () => {
    const registerResponse = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'reuse@example.org',
        password: 'ReuseSecurePass123!',
        organization: { name: 'Reuse Org' },
      });

    const { refreshToken } = registerResponse.body;

    const firstRefresh = await request(app.server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(firstRefresh.status).toBe(200);

    const secondRefresh = await request(app.server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(secondRefresh.status).toBe(401);
    const body = secondRefresh.body;
    expect(body.title).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes tokens on logout', async () => {
    const registerResponse = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'logout@example.org',
        password: 'LogoutSecurePass123!',
        organization: { name: 'Logout Org' },
      });

    const { accessToken, refreshToken } = registerResponse.body;

    const logoutResponse = await request(app.server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutResponse.status).toBe(204);

    const refreshResponse = await request(app.server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(refreshResponse.status).toBe(401);
  });

  it('enforces role-based access control', async () => {
    const adminRegister = await request(app.server)
      .post('/api/v1/auth/register')
      .send({
        email: 'admin-role@example.org',
        password: 'AdminRolePass123!',
        organization: { name: 'Role Org' },
      });

    const adminBody = adminRegister.body;
    const organizationId = adminBody.organization.id as string;

    const viewerPassword = 'ViewerPass123!';
    const viewerHash = await hashPassword(viewerPassword);

    await prisma.user.create({
      data: {
        email: 'viewer@example.org',
        passwordHash: viewerHash,
        roles: {
          create: {
            organizationId,
            role: UserRole.VIEWER,
          },
        },
      },
    });

    const viewerLogin = await request(app.server)
      .post('/api/v1/auth/login')
      .send({
        email: 'viewer@example.org',
        password: viewerPassword,
        organizationId,
      });

    expect(viewerLogin.status).toBe(200);
    const viewerBody = viewerLogin.body;

    const authorizedResponse = await request(app.server)
      .get('/api/v1/test/finance')
      .set('Authorization', `Bearer ${adminBody.accessToken}`);

    expect(authorizedResponse.status).toBe(200);
    expect(authorizedResponse.body).toEqual({ ok: true });

    const forbiddenResponse = await request(app.server)
      .get('/api/v1/test/finance')
      .set('Authorization', `Bearer ${viewerBody.accessToken}`);

    expect(forbiddenResponse.status).toBe(403);

    const unauthenticatedResponse = await request(app.server).get('/api/v1/test/finance');

    expect(unauthenticatedResponse.status).toBe(401);
  });
});

async function seedUserWithRole(role: UserRole) {
  const organization = await prisma.organization.create({ data: { name: 'Seed Org' } });
  const password = 'SeedPassword123!';
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}@example.org`,
      passwordHash,
      roles: {
        create: {
          organizationId: organization.id,
          role,
        },
      },
    },
    include: {
      roles: true,
    },
  });

  return {
    organizationId: organization.id,
    email: user.email,
    password,
  };
}
