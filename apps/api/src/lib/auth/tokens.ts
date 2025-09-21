import { randomUUID } from 'node:crypto';
import jwt, { type Algorithm, type JwtPayload } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  refreshTokenTtlDays: number;
}

export interface AccessTokenPayload {
  userId: string;
  organizationId: string;
  roles: UserRole[];
}

export interface RefreshTokenDetails {
  token: string;
  tokenId: string;
  expiresAt: Date;
}

export interface VerifiedRefreshToken {
  tokenId: string;
  userId: string;
  organizationId: string;
  roles: UserRole[];
}

const userRoleEnum = z.nativeEnum(UserRole);

const accessTokenSchema = z
  .object({
    type: z.literal('access'),
    orgId: z.string().uuid(),
    roles: z.array(userRoleEnum).nonempty(),
    sub: z.string().uuid(),
  })
  .passthrough();

const refreshTokenSchema = z
  .object({
    type: z.literal('refresh'),
    orgId: z.string().uuid(),
    roles: z.array(userRoleEnum).nonempty(),
    sub: z.string().uuid(),
    jti: z.string().uuid(),
  })
  .passthrough();

export function createAccessToken(payload: AccessTokenPayload, config: TokenConfig): string {
  return jwt.sign(
    { type: 'access', orgId: payload.organizationId, roles: payload.roles },
    config.accessSecret,
    {
      algorithm: 'HS256',
      expiresIn: '15m',
      subject: payload.userId,
    }
  );
}

export function createRefreshToken(payload: AccessTokenPayload, config: TokenConfig): RefreshTokenDetails {
  const tokenId = randomUUID();
  const expiresAt = calculateRefreshExpiry(config.refreshTokenTtlDays);

  const token = jwt.sign(
    { type: 'refresh', orgId: payload.organizationId, roles: payload.roles },
    config.refreshSecret,
    {
      algorithm: 'HS256',
      subject: payload.userId,
      jwtid: tokenId,
      expiresIn: `${config.refreshTokenTtlDays}d`,
    }
  );

  return { token, tokenId, expiresAt } satisfies RefreshTokenDetails;
}

export function verifyAccessToken(token: string, config: TokenConfig): AccessTokenPayload {
  const decoded = verifyJwt(token, config.accessSecret, ['HS256']);
  const parsed = accessTokenSchema.parse(decoded);

  return {
    userId: parsed.sub,
    organizationId: parsed.orgId,
    roles: parsed.roles,
  } satisfies AccessTokenPayload;
}

export function verifyRefreshToken(token: string, config: TokenConfig): VerifiedRefreshToken {
  const decoded = verifyJwt(token, config.refreshSecret, ['HS256']);
  const parsed = refreshTokenSchema.parse(decoded);

  return {
    tokenId: parsed.jti,
    userId: parsed.sub,
    organizationId: parsed.orgId,
    roles: parsed.roles,
  } satisfies VerifiedRefreshToken;
}

function verifyJwt(token: string, secret: string, algorithms: Algorithm[]): JwtPayload {
  const result = jwt.verify(token, secret, { algorithms });

  if (typeof result === 'string') {
    throw new jwt.JsonWebTokenError('Unexpected token payload format');
  }

  return result;
}

function calculateRefreshExpiry(ttlDays: number): Date {
  const now = Date.now();
  const durationMs = ttlDays * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs);
}
