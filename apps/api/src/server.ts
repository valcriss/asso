import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import env from '@fastify/env';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import pino from 'pino';
import { z } from 'zod';
import type { IncomingHttpHeaders } from 'http';
import idempotencyPlugin from './plugins/idempotency';
import paginationPlugin from './plugins/pagination';
import prismaPlugin from './plugins/prisma';
import problemJsonPlugin from './plugins/problem-json';
import authPlugin from './plugins/auth';
import memberReminderPlugin from './plugins/member-reminders';
import objectStoragePlugin from './plugins/object-storage';
import antivirusPlugin from './plugins/antivirus';
import emailPlugin from './plugins/email';

dotenv.config();

if (process.env.NODE_ENV !== 'production') {
  if (!process.env.FASTIFY_AUTOLOAD_TYPESCRIPT) {
    process.env.FASTIFY_AUTOLOAD_TYPESCRIPT = '1';
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
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
  REDIS_URL: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().url().optional()
    )
    .optional(),
  S3_ACCESS_KEY_ID: z.string().default('local-access-key'),
  S3_SECRET_ACCESS_KEY: z.string().default('local-secret-key'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('local-bucket'),
  S3_ENDPOINT: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().url().optional()
    )
    .optional(),
  S3_PUBLIC_URL: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().url().optional()
    )
    .optional(),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().optional()
    )
    .optional(),
  SMTP_PASSWORD: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().optional()
    )
    .optional(),
  SMTP_FROM: z.string().email().default('no-reply@asso.local'),
  CLAMAV_ENABLED: z.coerce.boolean().default(false),
  CLAMAV_HOST: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().optional()
    )
    .optional(),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

type RawEnvConfig = {
  NODE_ENV?: string;
  PORT?: number;
  LOG_LEVEL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  REFRESH_TOKEN_TTL_DAYS?: number;
  REDIS_URL?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ENDPOINT?: string;
  S3_PUBLIC_URL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number | string;
  SMTP_SECURE?: boolean | string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  CLAMAV_ENABLED?: boolean | string;
  CLAMAV_HOST?: string;
  CLAMAV_PORT?: number | string;
  CLAMAV_TIMEOUT_MS?: number | string;
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
        REDIS_URL: { type: 'string', default: '' },
        S3_ACCESS_KEY_ID: { type: 'string', default: 'local-access-key' },
        S3_SECRET_ACCESS_KEY: { type: 'string', default: 'local-secret-key' },
        S3_REGION: { type: 'string', default: 'us-east-1' },
        S3_BUCKET: { type: 'string', default: 'local-bucket' },
        S3_ENDPOINT: { type: 'string', default: '' },
        S3_PUBLIC_URL: { type: 'string', default: '' },
        SMTP_HOST: { type: 'string', default: '' },
        SMTP_PORT: { type: 'number', default: 587 },
        SMTP_SECURE: { type: 'boolean', default: false },
        SMTP_USER: { type: 'string', default: '' },
        SMTP_PASSWORD: { type: 'string', default: '' },
        SMTP_FROM: { type: 'string', default: 'no-reply@asso.local' },
        CLAMAV_ENABLED: { type: 'boolean', default: false },
        CLAMAV_HOST: { type: 'string', default: '' },
        CLAMAV_PORT: { type: 'number', default: 3310 },
        CLAMAV_TIMEOUT_MS: { type: 'number', default: 5000 },
      },
    },
  });

  const config = envSchema.parse(app.envConfig);
  app.decorate('config', config);

  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: 20 * 1024 * 1024,
      fields: 20,
      files: 1,
    },
  });
  await app.register(problemJsonPlugin);
  await app.register(authPlugin);
  await app.register(prismaPlugin);
  await app.register(memberReminderPlugin);
  await app.register(antivirusPlugin);
  await app.register(emailPlugin);
  await app.register(objectStoragePlugin);

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
