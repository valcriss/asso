import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { HttpProblemError } from '../lib/problem-details';
import { InMemoryIdempotencyStore } from '../lib/idempotency/in-memory-store';
import type { IdempotencyRecord, IdempotencyStore, StoredIdempotencyResponse } from '../lib/idempotency/types';
import { replayStoredResponse } from '../lib/idempotency/utils';

declare module 'fastify' {
  interface FastifyInstance {
    idempotencyStore: IdempotencyStore;
  }

  interface FastifyRequest {
    idempotencyKey?: string;
    idempotencyReplay: boolean;
  }
}

export interface IdempotencyPluginOptions {
  header?: string;
  ttlSeconds?: number;
  store?: IdempotencyStore;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours

const idempotencyPlugin: FastifyPluginAsync<IdempotencyPluginOptions> = fp(
  async (fastify, options: IdempotencyPluginOptions = {}) => {
    const headerName = (options.header ?? 'idempotency-key').toLowerCase();
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const store = options.store ?? new InMemoryIdempotencyStore();

    fastify.decorate('idempotencyStore', store);
    fastify.decorateRequest('idempotencyKey', undefined);
    fastify.decorateRequest('idempotencyReplay', false);

    fastify.addHook('preHandler', async (request, reply) => {
      request.idempotencyKey = undefined;
      request.idempotencyReplay = false;

      const rawHeader = request.headers[headerName];

      if (rawHeader === undefined) {
        return;
      }

      if (Array.isArray(rawHeader)) {
        throw new HttpProblemError({
          status: 400,
          title: 'Invalid Idempotency-Key header',
          detail: 'Multiple Idempotency-Key headers are not allowed.',
        });
      }

      const key = rawHeader.trim();

      if (key.length === 0) {
        throw new HttpProblemError({
          status: 400,
          title: 'Invalid Idempotency-Key header',
          detail: 'The Idempotency-Key header must not be empty.',
        });
      }

      request.idempotencyKey = key;

      const existingRecord = await store.get(key);

      if (existingRecord?.status === 'completed' && existingRecord.response) {
        request.idempotencyReplay = true;
        reply.header('idempotency-key', key);
        reply.header('idempotency-replayed', 'true');
        await replayStoredResponse(reply, existingRecord.response);
        return;
      }

      if (existingRecord?.status === 'processing') {
        throw new HttpProblemError({
          status: 409,
          title: 'Request already in progress',
          detail: 'Another request with the same Idempotency-Key is still being processed.',
        });
      }

      const inserted = await upsertProcessingRecord(store, key, ttlSeconds);

      if (!inserted) {
        const record = await store.get(key);
        if (record?.status === 'completed' && record.response) {
          request.idempotencyReplay = true;
          reply.header('idempotency-key', key);
          reply.header('idempotency-replayed', 'true');
          await replayStoredResponse(reply, record.response);
          return;
        }

        throw new HttpProblemError({
          status: 409,
          title: 'Request already in progress',
          detail: 'Another request with the same Idempotency-Key is still being processed.',
        });
      }
    });

    fastify.addHook('onSend', async (request, reply, payload) => {
      const key = request.idempotencyKey;
      if (!key) {
        return payload;
      }

      reply.header('idempotency-key', key);

      if (request.idempotencyReplay) {
        return payload;
      }

      const statusCode = reply.statusCode;

      if (statusCode >= 500) {
        await store.delete?.(key);
        return payload;
      }

      const serializedResponse = serializeResponse(reply, payload, statusCode);
      const record: IdempotencyRecord = {
        status: 'completed',
        createdAt: Date.now(),
        response: serializedResponse,
      } satisfies IdempotencyRecord;

      await store.set(key, record, ttlSeconds);

      reply.header('idempotency-replayed', 'false');

      return payload;
    });
  },
  { name: 'idempotency-plugin' },
);

async function upsertProcessingRecord(
  store: IdempotencyStore,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const record: IdempotencyRecord = {
    status: 'processing',
    createdAt: now,
  } satisfies IdempotencyRecord;

  if (store.setIfNotExists) {
    const inserted = await store.setIfNotExists(key, record, ttlSeconds);
    if (inserted) {
      return true;
    }
  } else {
    const existing = await store.get(key);
    if (!existing) {
      await store.set(key, record, ttlSeconds);
      return true;
    }
  }

  return false;
}

function serializeResponse(
  reply: FastifyReply,
  payload: unknown,
  statusCode: number,
): StoredIdempotencyResponse {
  let body: string;
  let isBase64Encoded = false;

  if (payload === undefined || payload === null) {
    body = '';
  } else if (Buffer.isBuffer(payload)) {
    body = payload.toString('base64');
    isBase64Encoded = true;
  } else if (typeof payload === 'string') {
    body = payload;
  } else {
    body = JSON.stringify(payload);
  }

  const headers: Record<string, string> = {};
  const originalHeaders = reply.getHeaders();
  for (const [header, value] of Object.entries(originalHeaders)) {
    if (typeof value === 'string') {
      headers[header] = value;
    } else if (Array.isArray(value)) {
      headers[header] = value.join(', ');
    } else if (value !== undefined) {
      headers[header] = String(value);
    }
  }

  return {
    statusCode,
    body,
    isBase64Encoded,
    headers,
  } satisfies StoredIdempotencyResponse;
}

export default idempotencyPlugin;
