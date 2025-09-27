import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import idempotencyPlugin from '../plugins/idempotency';
import { InMemoryIdempotencyStore } from '../lib/idempotency/in-memory-store';
import type { IdempotencyRecord, IdempotencyStore } from '../lib/idempotency/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

describe('idempotencyPlugin', () => {
  afterEach(async () => {
    vi.useRealTimers();
  });

  it('stores a response once and replays it on subsequent requests', async () => {
    const app = Fastify();
    const store = new InMemoryIdempotencyStore();
    let handled = 0;

    await app.register(idempotencyPlugin, { store, ttlSeconds: 60 });
    app.post('/submit', async (request, reply) => {
      handled += 1;
      return reply.code(201).send({ handled });
    });
    await app.ready();

    const key = 'duplicate-key';

    const first = await app.inject({
      method: 'POST',
      url: '/submit',
      headers: { 'idempotency-key': key },
      payload: { payload: 1 },
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ handled: 1 });
    expect(first.headers['idempotency-key']).toBe(key);
    expect(first.headers['idempotency-replayed']).toBe('false');

    const record = await store.get(key);
    expect(record).toMatchObject({ status: 'completed' });
    expect(record?.response).toMatchObject({ statusCode: 201, body: expect.any(String) });

    const second = await app.inject({
      method: 'POST',
      url: '/submit',
      headers: { 'idempotency-key': key },
      payload: { payload: 2 },
    });

    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual({ handled: 1 });
    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(handled).toBe(1);

    await app.close();
  });

  it('rejects concurrent processing attempts for the same key', async () => {
    const app = Fastify();
    const processingRecord: IdempotencyRecord = { status: 'processing', createdAt: Date.now() };
    const getSpy = vi.fn(async () => processingRecord);
    const store: IdempotencyStore = {
      get: getSpy,
      set: vi.fn(),
    };

    await app.register(idempotencyPlugin, { store });
    app.post('/submit', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/submit',
      headers: { 'idempotency-key': 'processing-key' },
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('Another request with the same Idempotency-Key'),
    });
    expect(getSpy).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('drops records when the handler returns a 5xx response', async () => {
    const key = 'fails-once';
    const deleteSpy = vi.fn(async () => {});
    const store: IdempotencyStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      setIfNotExists: vi.fn(async () => true),
      delete: deleteSpy,
    };

    const app = Fastify();
    await app.register(idempotencyPlugin, { store });
    app.post('/submit', async (request, reply) => {
      return reply.code(503).send('temporary');
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/submit',
      headers: { 'idempotency-key': key },
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('temporary');
    expect(response.headers['idempotency-key']).toBe(key);
    expect(response.headers).not.toHaveProperty('idempotency-replayed');
    expect(deleteSpy).toHaveBeenCalledWith(key);

    await app.close();
  });

  it('validates the incoming header name and value', async () => {
    const app = Fastify();
    await app.register(idempotencyPlugin, { header: 'X-Idem-Key' });
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();

    const emptyHeader = await app.inject({
      method: 'GET',
      url: '/ping',
      headers: { 'x-idem-key': '' },
    });

    expect(emptyHeader.statusCode).toBe(400);

    const okResponse = await app.inject({
      method: 'GET',
      url: '/ping',
      headers: { 'x-idem-key': 'valid-key' },
    });

    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.headers['idempotency-key']).toBe('valid-key');
    expect(okResponse.headers['idempotency-replayed']).toBe('false');

    await app.close();
  });

  it('rejects requests with multiple idempotency headers', async () => {
    const fastify = createIdempotencyStub();
    await idempotencyPlugin(fastify as unknown as FastifyInstance, {});

    const preHandler = fastify.hooks.preHandler;
    expect(preHandler).toBeDefined();

    const request = {
      headers: { 'idempotency-key': ['a', 'b'] },
      idempotencyReplay: false,
    } as unknown as FastifyRequest;

    await expect(preHandler?.(request, createReplyStub())).rejects.toMatchObject({
      status: 400,
      title: 'Invalid Idempotency-Key header',
    });
  });
});

type PreHandlerHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

interface FastifyIdempotencyStub {
  decorate: ReturnType<typeof vi.fn>;
  decorateRequest: ReturnType<typeof vi.fn>;
  addHook: ReturnType<typeof vi.fn>;
  hooks: { preHandler?: PreHandlerHook };
}

function createIdempotencyStub(): FastifyIdempotencyStub {
  const hooks: FastifyIdempotencyStub['hooks'] = {};

  const stub: FastifyIdempotencyStub = {
    decorate: vi.fn(),
    decorateRequest: vi.fn(),
    addHook: vi.fn((hook: 'preHandler' | 'onSend', handler: PreHandlerHook) => {
      if (hook === 'preHandler') {
        hooks.preHandler = handler as PreHandlerHook;
      }
    }),
    hooks,
  };

  return stub;
}

function createReplyStub(): FastifyReply {
  const reply = {
    header: vi.fn(() => reply),
    status: vi.fn(() => reply),
    send: vi.fn(async () => reply),
  };

  return reply as unknown as FastifyReply;
}
