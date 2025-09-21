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
import problemJsonPlugin from './plugins/problem-json';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

type RawEnvConfig = {
  NODE_ENV?: string;
  PORT?: number;
  LOG_LEVEL?: string;
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
      },
    },
  });

  const config = envSchema.parse(app.envConfig);
  app.decorate('config', config);

  await app.register(problemJsonPlugin);

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
