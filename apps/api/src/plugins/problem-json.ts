import fp from 'fastify-plugin';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import { toProblemDetail, isHttpProblemError } from '../lib/problem-details';

const problemJsonPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const instance = request.raw.url ?? request.url;
    const problem = toProblemDetail(error, instance);

    if (problem.status >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
    } else if (!isHttpProblemError(error)) {
      request.log.warn({ err: error }, 'Handled error');
    }

    reply
      .status(problem.status)
      .type('application/problem+json')
      .send({
        ...problem,
        detail:
          problem.status >= 500 && problem.detail === undefined
            ? 'An unexpected error occurred.'
            : problem.detail,
        instance,
      });
  });
});

export default problemJsonPlugin;
