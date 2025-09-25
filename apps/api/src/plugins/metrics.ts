import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { getTenantIdentifier } from '../lib/http/tenant';

interface MetricsPluginOptions {
  endpoint?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    metricsRegistry?: Registry;
  }
}

const metricsPlugin: FastifyPluginAsync<MetricsPluginOptions> = fp(async (fastify, options) => {
  const endpoint = options?.endpoint ?? '/metrics';
  const register = new Registry();

  collectDefaultMetrics({ register });

  const httpRequestCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'organization_id'],
    registers: [register],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'organization_id'],
    registers: [register],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.6, 1, 2.5, 5, 10],
  });

  fastify.decorate('metricsRegistry', register);

  fastify.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    const statusCode = String(reply.statusCode);
    const organizationId =
      request.user?.organizationId ?? getTenantIdentifier(request.headers) ?? 'anonymous';

    const labels = {
      method: request.method,
      route,
      status_code: statusCode,
      organization_id: organizationId,
    } as const;

    httpRequestCounter.labels(labels.method, labels.route, labels.status_code, labels.organization_id).inc();
    const responseTimeSeconds = typeof reply.elapsedTime === 'number' ? reply.elapsedTime / 1000 : 0;

    httpRequestDuration
      .labels(labels.method, labels.route, labels.status_code, labels.organization_id)
      .observe(responseTimeSeconds);
  });

  fastify.get(endpoint, async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
});

export default metricsPlugin;
