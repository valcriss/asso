import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createEmailNotifier, type EmailNotifier } from '../modules/notifications/email-notifier';

declare module 'fastify' {
  interface FastifyInstance {
    emailNotifier: EmailNotifier;
  }
}

const notificationsPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const notifier = createEmailNotifier(fastify.emailService);
  fastify.decorate('emailNotifier', notifier);
});

export default notificationsPlugin;
