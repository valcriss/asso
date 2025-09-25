import { Queue, Worker, type JobsOptions } from 'bullmq';
import type { Transporter } from 'nodemailer';
import { renderEmailTemplate, type EmailTemplateId, type EmailTemplatePayloads } from './templates';

export interface EmailJob<K extends EmailTemplateId = EmailTemplateId> {
  to: string;
  template: K;
  payload: EmailTemplatePayloads[K];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export interface EmailProcessorOptions {
  defaultFrom: string;
  headers?: Record<string, string>;
}

export type EmailProcessor = (job: EmailJob) => Promise<void>;

export interface EmailQueue {
  enqueue(job: EmailJob): Promise<void>;
  close?(): Promise<void>;
}

export interface EmailService {
  send<K extends EmailTemplateId>(job: EmailJob<K>): Promise<void>;
  render<K extends EmailTemplateId>(template: K, payload: EmailTemplatePayloads[K]): ReturnType<typeof renderEmailTemplate>;
  close(): Promise<void>;
}

export function createEmailProcessor(
  transporter: Transporter,
  options: EmailProcessorOptions
): EmailProcessor {
  const headers = options.headers ?? {};

  return async (job: EmailJob): Promise<void> => {
    const rendered = renderEmailTemplate(job.template, job.payload as never);

    await transporter.sendMail({
      from: options.defaultFrom,
      to: job.to,
      cc: job.cc,
      bcc: job.bcc,
      replyTo: job.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        'X-Template-Category': rendered.category,
        ...headers,
      },
    });
  };
}

export class BullMqEmailQueue implements EmailQueue {
  private readonly queue: Queue<EmailJob>;
  private readonly worker: Worker<EmailJob>;
  private readonly addOptions: JobsOptions;

  constructor(queue: Queue<EmailJob>, worker: Worker<EmailJob>, addOptions?: JobsOptions) {
    this.queue = queue;
    this.worker = worker;
    this.addOptions = {
      removeOnComplete: true,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      ...addOptions,
    };
  }

  async enqueue(job: EmailJob): Promise<void> {
    await this.queue.add('send-email', job, this.addOptions);
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

export class InMemoryEmailQueue implements EmailQueue {
  readonly jobs: EmailJob[] = [];
  private readonly processor: EmailProcessor;

  constructor(processor: EmailProcessor) {
    this.processor = processor;
  }

  async enqueue(job: EmailJob): Promise<void> {
    this.jobs.push(job);
    await this.processor(job);
  }

  async close(): Promise<void> {
    this.jobs.length = 0;
  }
}

class QueueBackedEmailService implements EmailService {
  private readonly queue: EmailQueue;

  constructor(queue: EmailQueue) {
    this.queue = queue;
  }

  async send<K extends EmailTemplateId>(job: EmailJob<K>): Promise<void> {
    await this.queue.enqueue(job);
  }

  render<K extends EmailTemplateId>(template: K, payload: EmailTemplatePayloads[K]) {
    return renderEmailTemplate(template, payload);
  }

  async close(): Promise<void> {
    if (typeof this.queue.close === 'function') {
      await this.queue.close();
    }
  }
}

export function createEmailService(queue: EmailQueue): EmailService {
  return new QueueBackedEmailService(queue);
}

export type { EmailTemplatePayloads } from './templates';
