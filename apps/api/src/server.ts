import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import autoload from '@fastify/autoload';
import env from '@fastify/env';
import dotenv from 'dotenv';
import pino from 'pino';
import { z } from 'zod';

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
