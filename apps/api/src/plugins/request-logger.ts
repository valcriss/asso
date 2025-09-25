import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { getTenantIdentifier } from '../lib/http/tenant';

declare module 'fastify' {
  interface FastifyRequest {
    logContext?: {
      requestId: string;
      userId: string | null;
      organizationId: string | null;
    };
  }
}

const requestLoggerPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = request.id;
    const userId = request.user?.id ?? null;
    const organizationId = request.user?.organizationId ?? getTenantIdentifier(request.headers);

    const bindings = {
      requestId,
      userId,
      organizationId,
    } as const;

    request.log = request.log.child(bindings);
    request.logContext = bindings;

    reply.header('x-request-id', requestId);
  });

  fastify.addHook('preHandler', async (request) => {
    const previousContext = request.logContext;
    const userId = request.user?.id ?? null;
    const organizationId = request.user?.organizationId ?? previousContext?.organizationId ?? null;

    if (!previousContext || previousContext.userId !== userId || previousContext.organizationId !== organizationId) {
      const bindings = {
        requestId: request.id,
        userId,
        organizationId,
      } as const;

      request.log = request.log.child(bindings);
      request.logContext = bindings;
    }
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const responseTimeMs = typeof reply.elapsedTime === 'number' ? reply.elapsedTime : 0;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs,
      },
      'request.completed'
    );
  });
});

export default requestLoggerPlugin;
