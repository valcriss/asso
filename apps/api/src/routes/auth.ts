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
  organizationId: z.string().uuid(),
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
    });

    reply.status(201).send({
      user: {
        id: result.user.id,
        email: result.user.email,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
      },
      roles: result.roles,
      accessToken,
      refreshToken: result.refreshToken.token,
    });
  });

  fastify.post('/auth/login', async (request, reply) => {
    const body = parseBody(loginBodySchema, request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
      include: {
        roles: {
          where: { organizationId: body.organizationId },
          select: { role: true },
        },
      },
    });

    if (!user) {
      throw invalidCredentialsError();
    }

    const passwordValid = await verifyPassword(user.passwordHash, body.password);
    if (!passwordValid) {
      throw invalidCredentialsError();
    }

    if (user.roles.length === 0) {
      throw new HttpProblemError({
        status: 403,
        title: 'FORBIDDEN',
        detail: 'You do not have access to this organization.',
      });
    }

    const organization = await fastify.prisma.organization.findUnique({
      where: { id: body.organizationId },
      select: { id: true, name: true },
    });

    if (!organization) {
      throw new HttpProblemError({
        status: 400,
        title: 'INVALID_ORGANIZATION',
        detail: 'The specified organization does not exist.',
      });
    }

    const roles = user.roles.map((role) => role.role);

    const refreshToken = fastify.issueRefreshToken({
      userId: user.id,
      organizationId: organization.id,
      roles,
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
    });

    reply.send({
      user: {
        id: user.id,
        email: user.email,
      },
      organization,
      roles,
      accessToken,
      refreshToken: refreshToken.token,
    });
  });

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
          select: { id: true, email: true },
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
      });

      return {
        user,
        organization,
        roles,
        accessToken,
        refreshToken: refreshToken.token,
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

function parseBody<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
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
