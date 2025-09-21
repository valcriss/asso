import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { HttpProblemError } from '../lib/problem-details';

declare module 'fastify' {
  interface FastifyRequest {
    pagination: PaginationContext | null;
  }
}

export interface PaginationPluginOptions {
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginationContext {
  page: number;
  limit: number;
  offset: number;
}

const paginationPlugin: FastifyPluginAsync<PaginationPluginOptions> = fp(
  async (fastify, options: PaginationPluginOptions = {}) => {
    const defaultPage = options.defaultPage ?? 1;
    const defaultLimit = options.defaultLimit ?? 50;
    const maxLimit = options.maxLimit ?? 200;
  const minLimit = 1;

    fastify.decorateRequest('pagination', null);

    fastify.addHook('preHandler', async (request) => {
      const query = (request.query ?? {}) as Record<string, unknown>;
      const parsedPage = parseOptionalInteger(query.page, 'page');
      const parsedLimit = parseOptionalInteger(query.limit, 'limit');

      const page = parsedPage ?? defaultPage;
      const limit = parsedLimit ?? defaultLimit;

      if (page < 1) {
        throw new HttpProblemError({
          status: 400,
          title: 'Invalid pagination parameters',
          detail: 'The "page" query parameter must be greater than or equal to 1.',
        });
      }

      if (limit < minLimit || limit > maxLimit) {
        throw new HttpProblemError({
          status: 400,
          title: 'Invalid pagination parameters',
          detail: `The "limit" query parameter must be between ${minLimit} and ${maxLimit}.`,
        });
      }

      request.pagination = {
        page,
        limit,
        offset: (page - 1) * limit,
      } satisfies PaginationContext;
    });
  },
  { name: 'pagination-plugin' },
);

function parseOptionalInteger(value: unknown, field: 'page' | 'limit'): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) {
      throw new HttpProblemError({
        status: 400,
        title: 'Invalid pagination parameters',
        detail: `The "${field}" query parameter must be an integer.`,
      });
    }

    return Number.parseInt(value, 10);
  }

  throw new HttpProblemError({
    status: 400,
    title: 'Invalid pagination parameters',
    detail: `The "${field}" query parameter must be an integer value.`,
  });
}

export default paginationPlugin;
