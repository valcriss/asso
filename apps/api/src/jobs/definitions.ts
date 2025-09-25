import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { ScheduledJobDefinition } from './runner';

export interface JobDefinitionDependencies {
  logger: Logger;
  timezone?: string;
  onJobExecuted?: (jobKey: string, job: Job) => void;
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
      processor: createHandler('gdpr-data-purge', 'Processing GDPR data purge routine', deps),
    },
  ];
}

