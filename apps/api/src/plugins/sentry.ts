import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import * as Sentry from '@sentry/node';
import { getTenantIdentifier } from '../lib/http/tenant';

const SENTRY_SHUTDOWN_TIMEOUT_MS = 2000;

const sentryPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const dsn = fastify.config.SENTRY_DSN;

  if (!dsn) {
    fastify.log.info('Sentry DSN not provided. Error tracking is disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: fastify.config.SENTRY_ENVIRONMENT ?? fastify.config.NODE_ENV,
    tracesSampleRate: fastify.config.SENTRY_TRACES_SAMPLE_RATE,
  });

  fastify.log.info('Sentry error tracking enabled.');

  fastify.addHook('onError', async (request, reply, error) => {
    Sentry.withScope((scope) => {
      scope.setTag('request_id', request.id);

      const organizationId = request.user?.organizationId ?? getTenantIdentifier(request.headers);

      if (request.user) {
        scope.setUser({ id: request.user.id, organizationId: organizationId ?? undefined });
      } else if (organizationId) {
        scope.setContext('organization', { id: organizationId });
      }

      scope.setContext('request', {
        method: request.method,
        url: request.url,
        route: request.routeOptions?.url,
        statusCode: reply.statusCode,
      });

      scope.setExtra('request_headers', request.headers);

      Sentry.captureException(error);
    });

    try {
      await Sentry.flush(SENTRY_SHUTDOWN_TIMEOUT_MS);
    } catch (flushError) {
      request.log.warn({ err: flushError }, 'Failed to flush Sentry events');
    }
  });

  fastify.addHook('onClose', async () => {
    try {
      await Sentry.close(SENTRY_SHUTDOWN_TIMEOUT_MS);
    } catch (error) {
      fastify.log.warn({ err: error }, 'Failed to close Sentry');
    }
  });
});

export default sentryPlugin;
