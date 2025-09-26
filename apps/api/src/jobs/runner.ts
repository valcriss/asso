import { JobScheduler, Queue, Worker, type JobsOptions, type Processor, type WorkerOptions } from 'bullmq';
import type { ConnectionOptions, RepeatOptions } from 'bullmq';
import type { Logger } from 'pino';

export interface ScheduledJobDefinition<Data extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Unique identifier for the scheduled job definition.
   */
  key: string;
  /**
   * Name used inside the BullMQ queue. Displayed in job listings.
   */
  name: string;
  /**
   * Queue name used to store repeatable jobs and manual triggers.
   */
  queueName: string;
  /**
   * Cron expression used to schedule the job.
   */
  cron: string;
  /**
   * Timezone used for the cron expression. Falls back to the runner default.
   */
  timezone?: string;
  /**
   * Optional payload used when registering the repeatable job. The same payload
   * will be re-used for manual triggers when no custom data is provided.
   */
  buildJobData?: () => Promise<Data> | Data;
  /**
   * Additional BullMQ job options applied when registering the repeatable job.
   */
  jobOptions?: Omit<JobsOptions, 'repeat'>;
  /**
   * Optional worker options controlling concurrency, etc.
   */
  workerOptions?: WorkerOptions;
  /**
   * Handler executed when the job runs.
   */
  processor: Processor<Data, void>;
}

type GenericJobDefinition = ScheduledJobDefinition<Record<string, unknown>>;
type GenericQueue = Queue<Record<string, unknown>, void, string>;

interface RegisteredJob {
  definition: GenericJobDefinition;
  queue: GenericQueue;
}

export interface JobRunnerOptions {
  connection: ConnectionOptions;
  logger?: Logger;
  defaultTimezone?: string;
}

export class JobRunner {
  private readonly connection: ConnectionOptions;

  private readonly logger?: Logger;

  private readonly defaultTimezone: string;

  private readonly definitions = new Map<string, RegisteredJob>();

  private readonly queues: Queue[] = [];

  private readonly schedulers: JobScheduler[] = [];

  private readonly workers: Worker[] = [];

  constructor(options: JobRunnerOptions) {
    this.connection = options.connection;
    this.logger = options.logger;
    this.defaultTimezone = options.defaultTimezone ?? 'UTC';
  }

  async registerScheduledJobs(definitions: ScheduledJobDefinition[]): Promise<void> {
    for (const definition of definitions) {
      await this.registerDefinition(definition);
    }
  }

  private async registerDefinition<Data extends Record<string, unknown>>(
    definition: ScheduledJobDefinition<Data>
  ): Promise<void> {
    if (this.definitions.has(definition.key)) {
      throw new Error(`Job definition with key "${definition.key}" already registered`);
    }

    const queue = new Queue<Data, void, string>(definition.queueName, { connection: this.connection });
    await queue.waitUntilReady();
    const scheduler = new JobScheduler(definition.queueName, { connection: this.connection });
    await scheduler.waitUntilReady();

    const worker = new Worker<Data, void, string>(definition.queueName, definition.processor, {
      connection: this.connection,
      ...definition.workerOptions,
    });

    worker.on('failed', (job, error) => {
      this.logger?.error(
        {
          err: error,
          jobId: job?.id,
          jobName: job?.name,
          queue: definition.queueName,
        },
        'Scheduled job failed'
      );
    });

    this.queues.push(queue);
    this.schedulers.push(scheduler);
    this.workers.push(worker);
    this.definitions.set(definition.key, {
      definition: definition as unknown as GenericJobDefinition,
      queue: queue as unknown as GenericQueue,
    });

    await this.registerRepeatableJob(scheduler, definition as unknown as GenericJobDefinition);
  }

  async runJobNow<Data extends Record<string, unknown> = Record<string, unknown>>(
    key: string,
    data?: Data,
    jobNameSuffix = 'manual'
  ): Promise<void> {
    const registration = this.definitions.get(key);
    if (!registration) {
      throw new Error(`Unknown job definition with key "${key}"`);
    }

    const definition = registration.definition as ScheduledJobDefinition<Data>;
    const queue = registration.queue as Queue<Data, void, string>;

    const payload =
      data ??
      ((await definition.buildJobData?.()) as Data | undefined) ??
      ({} as Data);

    const jobName = `${definition.name}:${jobNameSuffix}:${Date.now()}`;

    await (queue as unknown as {
      add: (name: string, data: Data, options?: JobsOptions) => Promise<unknown>;
    }).add(jobName, payload, {
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async getRepeatableJobs(key: string) {
    const registration = this.definitions.get(key);
    if (!registration) {
      throw new Error(`Unknown job definition with key "${key}"`);
    }

    return registration.queue.getRepeatableJobs();
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.schedulers.map((scheduler) => scheduler.close()));
    await Promise.all(this.queues.map((queue) => queue.close()));
  }

  private async registerRepeatableJob(
    scheduler: JobScheduler,
    definition: GenericJobDefinition
  ): Promise<void> {
    const targetJobId = this.getRepeatJobId(definition);

    await scheduler.removeJobScheduler(targetJobId).catch(() => undefined);

    const jobData = (await definition.buildJobData?.()) ?? {};

    const repeat: RepeatOptions = {
      pattern: definition.cron,
      tz: definition.timezone ?? this.defaultTimezone,
    };

    const options: JobsOptions = {
      removeOnComplete: true,
      removeOnFail: 100,
      ...definition.jobOptions,
    };

    await scheduler.upsertJobScheduler(
      targetJobId,
      repeat,
      definition.name,
      jobData,
      options,
      { override: true }
    );
  }

  private getRepeatJobId(definition: ScheduledJobDefinition): string {
    return `${definition.key}:repeat`;
  }
}
