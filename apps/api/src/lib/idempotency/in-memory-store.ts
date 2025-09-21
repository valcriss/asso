import type { IdempotencyRecord, IdempotencyStore } from './types';

type StoredItem = {
  record: IdempotencyRecord;
  expiresAt: number;
};

function isExpired(item: StoredItem, now: number): boolean {
  return item.expiresAt !== Number.POSITIVE_INFINITY && item.expiresAt <= now;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly store = new Map<string, StoredItem>();

  public constructor(private readonly cleanupWindowMs = 60_000) {}

  public async get(key: string): Promise<IdempotencyRecord | null> {
    this.evictExpired(key);
    const entry = this.store.get(key);
    return entry?.record ?? null;
  }

  public async set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    const now = Date.now();
    const expiresAt = ttlSeconds > 0 ? now + ttlSeconds * 1000 : Number.POSITIVE_INFINITY;
    this.store.set(key, { record, expiresAt });
    this.maybeCompact(now);
  }

  public async setIfNotExists(
    key: string,
    record: IdempotencyRecord,
    ttlSeconds: number,
  ): Promise<boolean> {
    this.evictExpired(key);

    if (this.store.has(key)) {
      return false;
    }

    await this.set(key, record, ttlSeconds);
    return true;
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  private evictExpired(key?: string): void {
    const now = Date.now();

    if (key) {
      const entry = this.store.get(key);
      if (entry && isExpired(entry, now)) {
        this.store.delete(key);
      }
      return;
    }

    for (const [storedKey, value] of this.store.entries()) {
      if (isExpired(value, now)) {
        this.store.delete(storedKey);
      }
    }
  }

  private maybeCompact(now: number): void {
    if (this.store.size === 0) {
      return;
    }

    const oldestExpiry = Math.min(
      ...Array.from(this.store.values(), (item) => item.expiresAt),
    );

    if (oldestExpiry === Number.POSITIVE_INFINITY) {
      return;
    }

    if (oldestExpiry - now <= this.cleanupWindowMs) {
      this.evictExpired();
    }
  }
}
