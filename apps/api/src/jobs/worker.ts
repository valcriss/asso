import 'dotenv/config';

import pino from 'pino';
import { JobRunner } from './runner';
import { createJobDefinitions } from './definitions';

async function main() {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const redisUrl = process.env.REDIS_URL && process.env.REDIS_URL.trim() !== ''
    ? process.env.REDIS_URL
    : 'redis://127.0.0.1:6379';

  const runner = new JobRunner({
    connection: { url: redisUrl },
    logger,
    defaultTimezone: process.env.JOBS_TIMEZONE ?? 'Europe/Paris',
  });

  const definitions = createJobDefinitions({
    logger,
    timezone: process.env.JOBS_TIMEZONE ?? 'Europe/Paris',
  });

  await runner.registerScheduledJobs(definitions);

  logger.info({ redisUrl }, 'Background jobs worker started');

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Shutting down jobs worker');
    await runner.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start jobs worker', error);
  process.exit(1);
});

