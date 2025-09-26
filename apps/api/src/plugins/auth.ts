import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from './prisma';
import { HttpProblemError } from '../lib/problem-details';
import {
  createAccessToken,
  createRefreshToken,
  type TokenConfig,
  type RefreshTokenDetails,
  verifyAccessToken,
  verifyRefreshToken,
  type VerifiedRefreshToken,
  type AccessTokenPayload,
} from '../lib/auth/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    accessTokenError?: Error;
  }

  interface FastifyInstance {
    authenticate(request: import('fastify').FastifyRequest): Promise<void>;
    authorizeRoles: (...roles: UserRole[]) => (request: import('fastify').FastifyRequest) => Promise<void>;
    authorizeSuperAdmin: () => (request: import('fastify').FastifyRequest) => Promise<void>;
    tokenConfig: TokenConfig;
    issueAccessToken(payload: AccessTokenPayload): string;
    issueRefreshToken(payload: AccessTokenPayload): RefreshTokenDetails;
    parseRefreshToken(token: string): VerifiedRefreshToken;
  }
}

const authPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorateRequest('accessTokenError', undefined as Error | undefined);
  fastify.decorateRequest('user', undefined as AuthenticatedUser | undefined);

  const tokenConfig: TokenConfig = {
    accessSecret: fastify.config.JWT_ACCESS_SECRET,
    refreshSecret: fastify.config.JWT_REFRESH_SECRET,
    refreshTokenTtlDays: fastify.config.REFRESH_TOKEN_TTL_DAYS,
  };

  fastify.decorate('tokenConfig', tokenConfig);
  fastify.decorate('issueAccessToken', (payload: AccessTokenPayload) => createAccessToken(payload, tokenConfig));
  fastify.decorate('issueRefreshToken', (payload: AccessTokenPayload) => createRefreshToken(payload, tokenConfig));
  fastify.decorate('parseRefreshToken', (token: string) => verifyRefreshToken(token, tokenConfig));

  fastify.addHook('onRequest', async (request) => {
    request.user = undefined;
    request.accessTokenError = undefined;

    const header = request.headers.authorization;
    if (!header || typeof header !== 'string') {
      return;
    }

    const [scheme, rawToken] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !rawToken) {
      return;
    }

    try {
      const payload = verifyAccessToken(rawToken, tokenConfig);
      request.user = {
        id: payload.userId,
        organizationId: payload.organizationId,
        roles: payload.roles,
        isSuperAdmin: payload.isSuperAdmin,
      };
    } catch (error) {
      request.accessTokenError = error instanceof Error ? error : new Error('Invalid access token');
    }
  });

  fastify.decorate('authenticate', async function authenticate(request) {
    if (request.user) {
      return;
    }

    if (request.accessTokenError) {
      throw new HttpProblemError({
        status: 401,
        title: 'UNAUTHORIZED',
        detail: 'Invalid access token.',
      });
    }

    throw new HttpProblemError({
      status: 401,
      title: 'UNAUTHORIZED',
      detail: 'Access token is required.',
    });
  });

  fastify.decorate('authorizeRoles', function authorizeRoles(...requiredRoles: UserRole[]) {
    const normalizedRoles = [...new Set(requiredRoles)];

    if (normalizedRoles.length === 0) {
      throw new Error('authorizeRoles requires at least one role');
    }

    return async function roleGuard(request) {
      await fastify.authenticate(request);

      if (request.user?.isSuperAdmin) {
        return;
      }

      const userRoles = request.user?.roles ?? [];
      const isAllowed = userRoles.some((role) => normalizedRoles.includes(role));

      if (!isAllowed) {
        throw new HttpProblemError({
          status: 403,
          title: 'FORBIDDEN',
          detail: 'You do not have the required role.',
        });
      }
    };
  });

  fastify.decorate('authorizeSuperAdmin', function authorizeSuperAdmin() {
    return async function superAdminGuard(request) {
      await fastify.authenticate(request);

      if (!request.user?.isSuperAdmin) {
        throw new HttpProblemError({
          status: 403,
          title: 'FORBIDDEN',
          detail: 'Super-admin privileges are required.',
        });
      }
    };
  });
}, { name: 'auth' });

export default authPlugin;
