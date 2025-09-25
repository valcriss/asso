import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { RedisMemoryServer } from 'redis-memory-server';
import { JobRunner } from '../jobs/runner';
import { createJobDefinitions } from '../jobs/definitions';

describe('scheduled jobs worker', () => {
  let redis: RedisMemoryServer;
  let runner: JobRunner;
  const executedJobs: string[] = [];
  const listeners = new Map<string, () => void>();

  beforeAll(async () => {
    redis = await RedisMemoryServer.create();
    const host = await redis.getHost();
    const port = await redis.getPort();

    const logger = pino({ level: 'silent' });

    const definitions = createJobDefinitions({
      logger,
      timezone: 'UTC',
      onJobExecuted: (jobKey) => {
        executedJobs.push(jobKey);
        listeners.get(jobKey)?.();
      },
    });

    runner = new JobRunner({
      connection: { host, port },
      logger,
      defaultTimezone: 'UTC',
    });

    await runner.registerScheduledJobs(definitions);
  });

  afterAll(async () => {
    await runner.close();
    await redis.stop();
  });

  it('registers repeatable jobs with persistence', async () => {
    const membershipJobs = await runner.getRepeatableJobs('membership-fee-reminders');
    const subsidyJobs = await runner.getRepeatableJobs('subsidy-deadline-notifications');
    const backupJobs = await runner.getRepeatableJobs('nightly-backups');
    const purgeJobs = await runner.getRepeatableJobs('gdpr-data-purge');

    expect(membershipJobs).toHaveLength(1);
    expect(subsidyJobs).toHaveLength(1);
    expect(backupJobs).toHaveLength(1);
    expect(purgeJobs).toHaveLength(1);

    expect(membershipJobs[0]).toMatchObject({ name: 'membership-fee-reminders' });
    expect(subsidyJobs[0]).toMatchObject({ name: 'subsidy-deadline-notifications' });
    expect(backupJobs[0]).toMatchObject({ name: 'nightly-backups' });
    expect(purgeJobs[0]).toMatchObject({ name: 'gdpr-data-purge' });
  });

  it('processes a job when triggered manually', async () => {
    await new Promise<void>((resolve) => {
      listeners.set('gdpr-data-purge', resolve);
      void runner.runJobNow('gdpr-data-purge', { triggeredBy: 'test' }, 'test');
    });

    listeners.delete('gdpr-data-purge');
    expect(executedJobs).toContain('gdpr-data-purge');
  });
});

