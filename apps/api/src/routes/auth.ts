import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../lib/auth/password';

const emailSchema = z.string().trim().toLowerCase().email();

const registerBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH),
  organization: z.object({
    name: z.string().trim().min(1).max(255),
  }),
});

const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  organizationId: z.string().uuid().optional(),
});

const tokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/register', async (request, reply) => {
    const body = parseBody(registerBodySchema, request.body);

    const existingUser = await fastify.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new HttpProblemError({
        status: 409,
        title: 'ACCOUNT_ALREADY_EXISTS',
        detail: 'An account already exists for this email address.',
      });
    }

    const passwordHash = await hashPassword(body.password);

    const result = await fastify.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: body.organization.name,
        },
      });

      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash,
        },
      });

      await tx.userOrgRole.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: UserRole.ADMIN,
        },
      });

      const roles = [UserRole.ADMIN];
      const refreshToken = fastify.issueRefreshToken({
        userId: user.id,
        organizationId: organization.id,
        roles,
        isSuperAdmin: user.isSuperAdmin,
      });

      await tx.refreshToken.create({
        data: {
          id: refreshToken.tokenId,
          userId: user.id,
          organizationId: organization.id,
          expiresAt: refreshToken.expiresAt,
        },
      });

      return {
        user,
        organization,
        roles,
        refreshToken,
      };
    });

    const accessToken = fastify.issueAccessToken({
      userId: result.user.id,
      organizationId: result.organization.id,
      roles: result.roles,
      isSuperAdmin: result.user.isSuperAdmin,
    });
    const expiresIn = 15 * 60;

    const userPayload = {
      id: result.user.id,
      email: result.user.email,
      roles: result.roles,
      isSuperAdmin: result.user.isSuperAdmin,
    };

    reply.status(201).send({
      user: userPayload,
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
      roles: result.roles,
      accessToken,
      refreshToken: result.refreshToken.token,
      expiresIn,
    });
  });

  fastify.post('/auth/login', async (request, reply) => {
    const body = parseBody(loginBodySchema, request.body, fastify.log);

    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isSuperAdmin: true,
        roles: { select: { role: true, organizationId: true } },
      },
    });

    if (!user) throw invalidCredentialsError();
    const passwordValid = await verifyPassword(user.passwordHash, body.password);
    if (!passwordValid) throw invalidCredentialsError();

    const uniqueOrgIds = [...new Set(user.roles.map((r) => r.organizationId))];
    if (!body.organizationId) {
      if (uniqueOrgIds.length === 0) {
        throw new HttpProblemError({ status: 403, title: 'FORBIDDEN', detail: 'You do not belong to any organization.' });
      }
      if (uniqueOrgIds.length > 1) {
        const organizations = await fastify.prisma.organization.findMany({
          where: { id: { in: uniqueOrgIds } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return reply.send({
          user: { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin },
          organizations,
          requiresOrganizationSelection: true,
        });
      }
    }

    const organizationId = body.organizationId ?? uniqueOrgIds[0];
    const roles = user.roles.filter((r) => r.organizationId === organizationId).map((r) => r.role);
    if (roles.length === 0) {
      throw new HttpProblemError({ status: 403, title: 'FORBIDDEN', detail: 'You do not have access to this organization.' });
    }

    const organization = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      throw new HttpProblemError({ status: 400, title: 'INVALID_ORGANIZATION', detail: 'The specified organization does not exist.' });
    }

    const refreshToken = fastify.issueRefreshToken({
      userId: user.id,
      organizationId: organization.id,
      roles,
      isSuperAdmin: user.isSuperAdmin,
    });
    await fastify.prisma.refreshToken.create({
      data: {
        id: refreshToken.tokenId,
        userId: user.id,
        organizationId: organization.id,
        expiresAt: refreshToken.expiresAt,
      },
    });
    const accessToken = fastify.issueAccessToken({
      userId: user.id,
      organizationId: organization.id,
      roles,
      isSuperAdmin: user.isSuperAdmin,
    });
    const expiresIn = 15 * 60;
    reply.send({
      user: { id: user.id, email: user.email, roles, isSuperAdmin: user.isSuperAdmin },
      organization,
      roles,
      accessToken,
      refreshToken: refreshToken.token,
      expiresIn,
    });
  });

  // Returns the list of organizations the authenticated user can access.
  fastify.get(
    '/auth/organizations',
    { preHandler: fastify.authenticate.bind(fastify) },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        throw new HttpProblemError({ status: 401, title: 'UNAUTHENTICATED', detail: 'Authentication required.' });
      }
      // Fetch organizations from roles table to ensure up-to-date access list.
      const roleRows = await request.prisma.userOrgRole.findMany({
        where: { userId: user.id },
        select: { organizationId: true },
      });
      const orgIds = [...new Set(roleRows.map((r) => r.organizationId))];
      if (orgIds.length === 0) {
        return reply.send({ organizations: [] });
      }
      const organizations = await request.prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      reply.send({ organizations });
    }
  );

  fastify.post('/auth/refresh', async (request, reply) => {
    const body = parseBody(tokenBodySchema, request.body);

    let decoded;
    try {
      decoded = fastify.parseRefreshToken(body.refreshToken);
    } catch (error) {
      throw invalidRefreshTokenError(error);
    }

    const now = new Date();

    const result = await fastify.prisma.$transaction(async (tx) => {
      const tokenRecord = await tx.refreshToken.findUnique({
        where: { id: decoded.tokenId },
      });

      if (!tokenRecord) {
        throw invalidRefreshTokenError();
      }

      if (tokenRecord.revokedAt) {
        throw invalidRefreshTokenError();
      }

      if (tokenRecord.expiresAt.getTime() <= now.getTime()) {
        throw invalidRefreshTokenError();
      }

      if (
        tokenRecord.userId !== decoded.userId ||
        tokenRecord.organizationId !== decoded.organizationId
      ) {
        throw invalidRefreshTokenError();
      }

      const [roleRows, user, organization] = await Promise.all([
        tx.userOrgRole.findMany({
          where: {
            userId: decoded.userId,
            organizationId: decoded.organizationId,
          },
          select: { role: true },
        }),
        tx.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, isSuperAdmin: true },
        }),
        tx.organization.findUnique({
          where: { id: decoded.organizationId },
          select: { id: true, name: true },
        }),
      ]);

      if (!user || !organization) {
        throw invalidRefreshTokenError();
      }

      if (roleRows.length === 0) {
        throw new HttpProblemError({
          status: 403,
          title: 'FORBIDDEN',
          detail: 'You do not have access to this organization.',
        });
      }

      const roles = roleRows.map((row) => row.role);

      const refreshToken = fastify.issueRefreshToken({
        userId: user.id,
        organizationId: organization.id,
        roles,
        isSuperAdmin: user.isSuperAdmin,
      });

      const updateResult = await tx.refreshToken.updateMany({
        where: {
          id: tokenRecord.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      if (updateResult.count === 0) {
        throw invalidRefreshTokenError();
      }

      await tx.refreshToken.create({
        data: {
          id: refreshToken.tokenId,
          userId: user.id,
          organizationId: organization.id,
          expiresAt: refreshToken.expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: {
          replacedByTokenId: refreshToken.tokenId,
        },
      });

      const accessToken = fastify.issueAccessToken({
        userId: user.id,
        organizationId: organization.id,
        roles,
        isSuperAdmin: user.isSuperAdmin,
      });
      const expiresIn = 15 * 60;

      const userPayload = {
        id: user.id,
        email: user.email,
        roles,
        isSuperAdmin: user.isSuperAdmin,
      };

      return {
        user: userPayload,
        organization,
        roles,
        accessToken,
        refreshToken: refreshToken.token,
        expiresIn,
      };
    });

    reply.send(result);
  });

  fastify.post(
    '/auth/logout',
    { preHandler: fastify.authenticate.bind(fastify) },
    async (request, reply) => {
      const body = parseBody(tokenBodySchema, request.body);

      try {
        const decoded = fastify.parseRefreshToken(body.refreshToken);
        const currentUser = request.user;
        if (
          currentUser &&
          decoded.userId === currentUser.id &&
          decoded.organizationId === currentUser.organizationId
        ) {
          await request.prisma.refreshToken.updateMany({
            where: {
              id: decoded.tokenId,
              userId: currentUser.id,
              organizationId: currentUser.organizationId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        }
      } catch (error) {
        request.log.debug({ err: error }, 'Failed to parse refresh token during logout');
      }

      reply.status(204).send();
    }
  );
};

// log est laissé en unknown pour tolérer les différences de types entre fastify/pino.
function parseBody<T>(schema: z.ZodType<T>, payload: unknown, log?: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    if (log && typeof (log as { debug?: (...args: unknown[]) => void }).debug === 'function') {
      (log as { debug: (obj: unknown, msg: string) => void }).debug(
        { validationIssues: result.error.flatten() },
        'Validation failed'
      );
    }
    throw new HttpProblemError({
      status: 400,
      title: 'VALIDATION_ERROR',
      detail: 'Invalid request body.',
      cause: result.error,
    });
  }
  return result.data;
}

function invalidCredentialsError(): HttpProblemError {
  return new HttpProblemError({
    status: 401,
    title: 'INVALID_CREDENTIALS',
    detail: 'Invalid email or password.',
  });
}

function invalidRefreshTokenError(cause?: unknown): HttpProblemError {
  return new HttpProblemError({
    status: 401,
    title: 'INVALID_REFRESH_TOKEN',
    detail: 'Refresh token is invalid or expired.',
    cause,
  });
}

export default authRoutes;
