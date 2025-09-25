import type { Job, Processor } from 'bullmq';
import type { Logger } from 'pino';
import type { PrismaClient } from '@prisma/client';
import type { ScheduledJobDefinition } from './runner';
import { purgeSoftDeletedRecords } from '../modules/compliance/gdpr-purge';

export interface JobDefinitionDependencies {
  logger: Logger;
  timezone?: string;
  onJobExecuted?: (jobKey: string, job: Job) => void;
  prisma: PrismaClient;
}

function createHandler(jobKey: string, message: string, deps: JobDefinitionDependencies) {
  return async (job: Job): Promise<void> => {
    deps.logger.info({ jobId: job.id, name: job.name, queue: job.queueName }, message);
    await job.updateProgress(100);
    deps.onJobExecuted?.(jobKey, job);
  };
}

export function createJobDefinitions(deps: JobDefinitionDependencies): ScheduledJobDefinition[] {
  const timezone = deps.timezone ?? 'Europe/Paris';

  return [
    {
      key: 'membership-fee-reminders',
      name: 'membership-fee-reminders',
      queueName: 'membership-fee-reminders',
      cron: '0 8 * * *',
      timezone,
      buildJobData: () => ({ jobType: 'membership-fee-reminders' }),
      processor: createHandler(
        'membership-fee-reminders',
        'Processing membership fee reminder campaign',
        deps
      ),
    },
    {
      key: 'subsidy-deadline-notifications',
      name: 'subsidy-deadline-notifications',
      queueName: 'subsidy-deadline-notifications',
      cron: '0 7 * * 1',
      timezone,
      buildJobData: () => ({ jobType: 'subsidy-deadline-notifications' }),
      processor: createHandler(
        'subsidy-deadline-notifications',
        'Processing subsidy deadline notification dispatch',
        deps
      ),
    },
    {
      key: 'nightly-backups',
      name: 'nightly-backups',
      queueName: 'nightly-backups',
      cron: '0 2 * * *',
      timezone,
      buildJobData: () => ({ jobType: 'nightly-backups' }),
      processor: createHandler('nightly-backups', 'Processing nightly backup workflow', deps),
    },
    {
      key: 'gdpr-data-purge',
      name: 'gdpr-data-purge',
      queueName: 'gdpr-data-purge',
      cron: '0 3 * * *',
      timezone,
      buildJobData: () => ({ jobType: 'gdpr-data-purge' }),
      processor: createGdprPurgeHandler(deps),
    },
  ];
}

function createGdprPurgeHandler(deps: JobDefinitionDependencies): Processor<Record<string, unknown>, void> {
  return async (job: Job<Record<string, unknown>, void>): Promise<void> => {
    deps.logger.info({ jobId: job.id }, 'Starting GDPR data purge');

    const result = await purgeSoftDeletedRecords(deps.prisma);

    deps.logger.info(
      {
        jobId: job.id,
        membersPurged: result.membersPurged,
        memberAssignmentsPurged: result.memberFeeAssignmentsPurged,
        memberPaymentsPurged: result.memberPaymentsPurged,
        donationsPurged: result.donationsPurged,
      },
      'Completed GDPR data purge'
    );

    await job.updateProgress(100);
    deps.onJobExecuted?.('gdpr-data-purge', job as Job);
  };
}

