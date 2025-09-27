import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetOptions } from 'redis';
import { InMemoryIdempotencyStore } from '../lib/idempotency/in-memory-store';
import { RedisIdempotencyStore } from '../lib/idempotency/redis-store';
import { replayStoredResponse } from '../lib/idempotency/utils';
import type { IdempotencyRecord, StoredIdempotencyResponse } from '../lib/idempotency/types';

describe('RedisIdempotencyStore', () => {
  const prefix = 'idempotency:';

  class FakeRedisClient {
    public store = new Map<string, string>();
    public lastOptions: SetOptions | undefined;
    public deletedKeys: string[] = [];

    public async get(key: string): Promise<string | null> {
      return this.store.has(key) ? this.store.get(key)! : null;
    }

    public async set(key: string, value: string, options?: SetOptions): Promise<'OK' | null> {
      this.lastOptions = options;
      const shouldRespectNx = options?.NX === true;
      if (shouldRespectNx && this.store.has(key)) {
        return null;
      }

      this.store.set(key, value);
      return 'OK';
    }

    public async del(key: string): Promise<void> {
      this.deletedKeys.push(key);
      this.store.delete(key);
    }
  }

const createRecord = (): IdempotencyRecord => ({
  status: 'processing',
  createdAt: Date.now(),
});

  it('stores and retrieves records without ttl', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);

    await store.set('test', createRecord(), 0);

    expect(client.lastOptions).toBeUndefined();
    expect(client.store.has(`${prefix}test`)).toBe(true);

    const record = await store.get('test');
    expect(record).toMatchObject({ status: 'processing' });
  });

  it('stores records with ttl and composes redis options', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);

    await store.set('with-ttl', createRecord(), 30);

    expect(client.lastOptions).toEqual({ PX: 30000 });
  });

  it('only sets new value when NX flag succeeds', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);

    const first = await store.setIfNotExists('nx', createRecord(), 10);
    const second = await store.setIfNotExists('nx', createRecord(), 10);

    expect(client.lastOptions).toEqual({ PX: 10000, NX: true });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('returns null when key is missing', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);

    const record = await store.get('missing');
    expect(record).toBeNull();
  });

  it('purges unparsable payloads and bubbles errors', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);
    const fullKey = `${prefix}broken`;

    client.store.set(fullKey, '{invalid json');

    await expect(store.get('broken')).rejects.toThrow(SyntaxError);
    expect(client.deletedKeys).toContain(fullKey);
    expect(client.store.has(fullKey)).toBe(false);
  });

  it('deletes stored records', async () => {
    const client = new FakeRedisClient();
    const store = new RedisIdempotencyStore(client as unknown as any);
    const fullKey = `${prefix}todelete`;

    client.store.set(fullKey, JSON.stringify(createRecord()));
    await store.delete('todelete');

    expect(client.deletedKeys).toContain(fullKey);
    expect(client.store.has(fullKey)).toBe(false);
  });
});

describe('InMemoryIdempotencyStore', () => {
  const baseRecord = (status: IdempotencyRecord['status'] = 'processing'): IdempotencyRecord => ({
    status,
    createdAt: Date.now(),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores values with ttl and evicts them after expiry', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set('short', baseRecord(), 1);

    expect(await store.get('short')).not.toBeNull();

    vi.advanceTimersByTime(1200);
    expect(await store.get('short')).toBeNull();
  });

  it('keeps values without ttl until deleted', async () => {
    const store = new InMemoryIdempotencyStore();
    await store.set('persist', baseRecord(), 0);

    vi.advanceTimersByTime(86_400_000);
    expect(await store.get('persist')).not.toBeNull();

    await store.delete('persist');
    expect(await store.get('persist')).toBeNull();
  });

  it('setIfNotExists respects existing keys and expired entries', async () => {
    const store = new InMemoryIdempotencyStore();

    expect(await store.setIfNotExists('key', baseRecord(), 1)).toBe(true);
    expect(await store.setIfNotExists('key', baseRecord(), 1)).toBe(false);

    vi.advanceTimersByTime(1200);
    expect(await store.setIfNotExists('key', baseRecord(), 1)).toBe(true);
  });

  it('compacts expired entries when cleanup window is reached', async () => {
    const store = new InMemoryIdempotencyStore(500);

    await store.set('expired', baseRecord(), 1);
    vi.advanceTimersByTime(1200);

    await store.set('fresh', baseRecord(), 10);

    expect(await store.get('expired')).toBeNull();
    expect(await store.get('fresh')).not.toBeNull();
  });
});

describe('replayStoredResponse', () => {
  it('replays headers, status and decodes base64 body when needed', async () => {
    const header = vi.fn();
    const status = vi.fn();
    const send = vi.fn();
    const reply = {
      header: header.mockImplementation(() => reply),
      status: status.mockImplementation(() => reply),
      send,
    } as any;

    const stored: StoredIdempotencyResponse = {
      statusCode: 201,
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': 'abc',
      },
      body: Buffer.from('{"ok":true}').toString('base64'),
      isBase64Encoded: true,
    };

    await replayStoredResponse(reply, stored);

    expect(header).toHaveBeenCalledWith('content-type', 'application/json');
    expect(header).toHaveBeenCalledWith('x-idempotency-key', 'abc');
    expect(status).toHaveBeenCalledWith(201);
    expect(send).toHaveBeenCalledWith(Buffer.from('{"ok":true}'));
  });

  it('sends plain payloads when not base64 encoded', async () => {
    const header = vi.fn();
    const status = vi.fn();
    const send = vi.fn();
    const reply = {
      header: header.mockImplementation(() => reply),
      status: status.mockImplementation(() => reply),
      send,
    } as any;

    const stored: StoredIdempotencyResponse = {
      statusCode: 200,
      headers: {},
      body: 'plain-text',
      isBase64Encoded: false,
    };

    await replayStoredResponse(reply, stored);

    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith('plain-text');
  });
});
