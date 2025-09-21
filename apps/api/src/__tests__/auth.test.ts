import type { FastifyInstance } from 'fastify';
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
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin@example.org',
        password: 'SuperSecurePass123!',
        organization: { name: 'Demo Org' },
      },
    });

    expect(response.statusCode).toBe(201);

    const body = response.json();

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

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email,
        password,
        organizationId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.roles).toContain(UserRole.ADMIN);
    expect(body.accessToken).toBeTypeOf('string');
    expect(body.refreshToken).toBeTypeOf('string');
  });

  it('rejects invalid login attempts', async () => {
    const { organizationId, email } = await seedUserWithRole(UserRole.ADMIN);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email,
        password: 'WrongPassword123!',
        organizationId,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.title).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens on refresh', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'rotate@example.org',
        password: 'AnotherSecurePass123!',
        organization: { name: 'Rotate Org' },
      },
    });

    const registerBody = registerResponse.json();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'rotate@example.org' },
      include: { refreshTokens: true, roles: true },
    });

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {
        refreshToken: registerBody.refreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshBody = refreshResponse.json();

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
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'reuse@example.org',
        password: 'ReuseSecurePass123!',
        organization: { name: 'Reuse Org' },
      },
    });

    const { refreshToken } = registerResponse.json();

    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(firstRefresh.statusCode).toBe(200);

    const secondRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(secondRefresh.statusCode).toBe(401);
    const body = secondRefresh.json();
    expect(body.title).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes tokens on logout', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'logout@example.org',
        password: 'LogoutSecurePass123!',
        organization: { name: 'Logout Org' },
      },
    });

    const { accessToken, refreshToken } = registerResponse.json();

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: { refreshToken },
    });

    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(refreshResponse.statusCode).toBe(401);
  });

  it('enforces role-based access control', async () => {
    const adminRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'admin-role@example.org',
        password: 'AdminRolePass123!',
        organization: { name: 'Role Org' },
      },
    });

    const adminBody = adminRegister.json();
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

    const viewerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'viewer@example.org',
        password: viewerPassword,
        organizationId,
      },
    });

    expect(viewerLogin.statusCode).toBe(200);
    const viewerBody = viewerLogin.json();

    const authorizedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/test/finance',
      headers: {
        authorization: `Bearer ${adminBody.accessToken}`,
      },
    });

    expect(authorizedResponse.statusCode).toBe(200);
    expect(authorizedResponse.json()).toEqual({ ok: true });

    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/test/finance',
      headers: {
        authorization: `Bearer ${viewerBody.accessToken}`,
      },
    });

    expect(forbiddenResponse.statusCode).toBe(403);

    const unauthenticatedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/test/finance',
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
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
