import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import env from '@fastify/env';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import pino from 'pino';
import idempotencyPlugin from './plugins/idempotency';
import paginationPlugin from './plugins/pagination';
import prismaPlugin from './plugins/prisma';
import problemJsonPlugin from './plugins/problem-json';
import authPlugin from './plugins/auth';
import memberReminderPlugin from './plugins/member-reminders';
import objectStoragePlugin from './plugins/object-storage';
import antivirusPlugin from './plugins/antivirus';
import emailPlugin from './plugins/email';
import notificationsPlugin from './plugins/notifications';
import requestLoggerPlugin from './plugins/request-logger';
import sentryPlugin from './plugins/sentry';
import metricsPlugin from './plugins/metrics';
import lateOnRequestPlugin from './plugins/late-on-request';
import { parseConfig, type AppConfig, type RawEnvConfig } from './config';
import { getTenantIdentifier } from './lib/http/tenant';

// Charge d'abord le .env à la racine du monorepo (utile quand on lance depuis la racine)
// puis applique un .env spécifique au dossier API (override local si présent).
// Cette stratégie permet d'éviter la duplication des variables communes tout en
// laissant la possibilité de surcharger localement pour l'API uniquement.
(() => {
  try {
    const rootEnvPath = join(__dirname, '..', '..', '..', '.env'); // apps/api/src -> ../../../
    if (existsSync(rootEnvPath)) {
      dotenv.config({ path: rootEnvPath });
    }
  } catch {
    // silencieux: si erreur de résolution on continue
  }
})();

// Ensuite .env local (apps/api/.env) si présent
dotenv.config();

if (process.env.NODE_ENV !== 'production') {
  if (!process.env.FASTIFY_AUTOLOAD_TYPESCRIPT) {
    process.env.FASTIFY_AUTOLOAD_TYPESCRIPT = '1';
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('esbuild-register');
}

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
    base: { service: 'asso-api' },
  };

  const app = Fastify({
    logger: loggerOptions,
    genReqId(request) {
      const headerRequestId = request.headers['x-request-id'];

      if (typeof headerRequestId === 'string' && headerRequestId.trim() !== '') {
        return headerRequestId.trim();
      }

      if (Array.isArray(headerRequestId)) {
        const candidate = headerRequestId.find((value) => value && value.trim() !== '');
        if (candidate) {
          return candidate.trim();
        }
      }

      return randomUUID();
    },
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
        METRICS_ENABLED: { type: 'boolean', default: true },
        OTEL_ENABLED: { type: 'boolean', default: false },
        OTEL_SERVICE_NAME: { type: 'string', default: 'asso-api' },
        OTEL_EXPORTER_OTLP_ENDPOINT: { type: 'string', default: '' },
        OTEL_EXPORTER_OTLP_HEADERS: { type: 'string', default: '' },
        SENTRY_DSN: { type: 'string', default: '' },
        SENTRY_ENVIRONMENT: { type: 'string', default: '' },
        SENTRY_TRACES_SAMPLE_RATE: { type: 'number', default: 0 },
      },
    },
  });

  const config = parseConfig(app.envConfig);
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
  await app.register(sentryPlugin);
  await app.register(requestLoggerPlugin);
  await app.register(prismaPlugin);
  await app.register(memberReminderPlugin);
  await app.register(antivirusPlugin);
  await app.register(emailPlugin);
  await app.register(notificationsPlugin);
  await app.register(objectStoragePlugin);
  await app.register(lateOnRequestPlugin);

  if (config.METRICS_ENABLED) {
    await app.register(metricsPlugin, {
      endpoint: '/metrics',
    });
  }

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
