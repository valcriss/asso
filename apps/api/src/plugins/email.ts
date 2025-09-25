import fp from 'fastify-plugin';
import { Queue, Worker } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
import nodemailer from 'nodemailer';
import {
  BullMqEmailQueue,
  InMemoryEmailQueue,
  createEmailProcessor,
  createEmailService,
  type EmailJob,
  type EmailService,
} from '../lib/email/service';

declare module 'fastify' {
  interface FastifyInstance {
    emailService: EmailService;
  }
}

const EMAIL_QUEUE_NAME = 'email-dispatch';

const emailPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM,
    REDIS_URL,
  } = fastify.config;

  let transporter: nodemailer.Transporter;

  if (SMTP_HOST && SMTP_HOST.trim() !== '') {
    const auth = SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    fastify.log.warn('SMTP host not configured; emails will be captured locally (JSON transport).');
  }

  try {
    await transporter.verify();
  } catch (error) {
    fastify.log.warn({ err: error }, 'Unable to verify SMTP configuration at startup.');
  }

  const processor = createEmailProcessor(transporter, {
    defaultFrom: SMTP_FROM,
  });

  let emailQueue: BullMqEmailQueue | InMemoryEmailQueue;

  if (REDIS_URL && REDIS_URL.trim() !== '') {
    const connection = { url: REDIS_URL };
    const queue = new Queue<EmailJob>(EMAIL_QUEUE_NAME, { connection });
    const worker = new Worker<EmailJob>(
      EMAIL_QUEUE_NAME,
      async (job) => processor(job.data),
      { connection }
    );

    worker.on('failed', (job, error) => {
      fastify.log.error({ err: error, jobId: job?.id }, 'Email job failed');
    });

    emailQueue = new BullMqEmailQueue(queue, worker);
  } else {
    emailQueue = new InMemoryEmailQueue(processor);
    fastify.log.warn('REDIS_URL not configured; email jobs will be processed synchronously in memory.');
  }

  const emailService = createEmailService(emailQueue);

  fastify.decorate('emailService', emailService);

  fastify.addHook('onClose', async () => {
    await emailService.close();
    if (typeof transporter.close === 'function') {
      transporter.close();
    }
  });
});

export default emailPlugin;
