import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import type { FastifyPluginAsync } from 'fastify';
import {
  BullMqMemberReminderQueue,
  InMemoryMemberReminderQueue,
  MemberReminderQueue,
  type MemberPaymentReminderJob,
} from '../lib/jobs/member-reminder-queue';

declare module 'fastify' {
  interface FastifyInstance {
    memberReminderQueue: MemberReminderQueue;
  }
}

const memberReminderPlugin: FastifyPluginAsync = fp(async (fastify) => {
  let queue: MemberReminderQueue;

  const redisUrl = fastify.config.REDIS_URL;
  if (redisUrl && redisUrl.trim() !== '') {
    const bullQueue = new Queue<MemberPaymentReminderJob>('member-payment-reminders', {
      connection: { url: redisUrl },
    });
    queue = new BullMqMemberReminderQueue(bullQueue);
  } else {
    queue = new InMemoryMemberReminderQueue();
    fastify.log.warn('REDIS_URL not configured; member payment reminders will be stored in memory only.');
  }

  fastify.decorate('memberReminderQueue', queue);

  fastify.addHook('onClose', async () => {
    if (typeof queue.close === 'function') {
      await queue.close();
    }
  });
});

export default memberReminderPlugin;
