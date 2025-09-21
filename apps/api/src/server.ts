import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import env from '@fastify/env';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import pino from 'pino';
import { z } from 'zod';
import type { IncomingHttpHeaders } from 'http';
import idempotencyPlugin from './plugins/idempotency';
import paginationPlugin from './plugins/pagination';
import prismaPlugin from './plugins/prisma';
import problemJsonPlugin from './plugins/problem-json';
import authPlugin from './plugins/auth';

dotenv.config();

if (process.env.NODE_ENV !== 'production') {
  if (!process.env.FASTIFY_AUTOLOAD_TYPESCRIPT) {
    process.env.FASTIFY_AUTOLOAD_TYPESCRIPT = '1';
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('esbuild-register');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-me-please-0123456789'),
  JWT_REFRESH_SECRET: z.string().min(32).default('dev-refresh-secret-change-me-please-0123456789'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

type RawEnvConfig = {
  NODE_ENV?: string;
  PORT?: number;
  LOG_LEVEL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  REFRESH_TOKEN_TTL_DAYS?: number;
};

export type AppConfig = z.infer<typeof envSchema>;

declare module 'fastify' {
  interface FastifyInstance {
    envConfig: RawEnvConfig;
    config: AppConfig;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const loggerOptions: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const app = Fastify({
    logger: loggerOptions,
  });

  await app.register(env, {
    confKey: 'envConfig',
    dotenv: true,
    schema: {
      type: 'object',
      required: [],
      properties: {
        NODE_ENV: { type: 'string', default: 'development' },
        PORT: { type: 'number', default: 3000 },
        LOG_LEVEL: { type: 'string', default: 'info' },
        JWT_ACCESS_SECRET: {
          type: 'string',
          default: 'dev-access-secret-change-me-please-0123456789',
        },
        JWT_REFRESH_SECRET: {
          type: 'string',
          default: 'dev-refresh-secret-change-me-please-0123456789',
        },
        REFRESH_TOKEN_TTL_DAYS: { type: 'number', default: 30 },
      },
    },
  });

  const config = envSchema.parse(app.envConfig);
  app.decorate('config', config);

  await app.register(problemJsonPlugin);
  await app.register(authPlugin);
  await app.register(prismaPlugin);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const tenantId = getTenantIdentifier(request.headers);
      const clientIp = request.ip;
      return tenantId ? `tenant:${tenantId}:ip:${clientIp}` : `ip:${clientIp}`;
    },
  });

  await app.register(paginationPlugin, {
    defaultPage: 1,
    defaultLimit: 50,
    maxLimit: 200,
  });

  await app.register(idempotencyPlugin);

  await app.register(autoload, {
    dir: join(__dirname, 'routes'),
    dirNameRoutePrefix: false,
    options: {
      prefix: '/api/v1',
    },
  });

  return app;
}

export default buildServer;

function getTenantIdentifier(headers: IncomingHttpHeaders): string | null {
  const tenantHeaderCandidates = [
    'x-organization-id',
    'x-tenant-id',
    'x-org-id',
  ] as const;

  for (const headerName of tenantHeaderCandidates) {
    const value = headers[headerName];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }

    if (Array.isArray(value) && value.length > 0) {
      const candidate = value.find((item) => typeof item === 'string' && item.trim() !== '');
      if (candidate) {
        return candidate.trim();
      }
    }
  }

  return null;
}
