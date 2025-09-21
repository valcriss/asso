import type { RedisClientType, SetOptions } from 'redis';
import type { IdempotencyRecord, IdempotencyStore } from './types';

export class RedisIdempotencyStore implements IdempotencyStore {
  public constructor(
    private readonly client: RedisClientType,
    private readonly prefix = 'idempotency:',
  ) {}

  public async get(key: string): Promise<IdempotencyRecord | null> {
    const raw = await this.client.get(this.composeKey(key));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as IdempotencyRecord;
    } catch (error) {
      await this.client.del(this.composeKey(key));
      throw error;
    }
  }

  public async set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(record);
    const options = this.buildSetOptions(ttlSeconds);
    if (options) {
      await this.client.set(this.composeKey(key), payload, options);
      return;
    }

    await this.client.set(this.composeKey(key), payload);
  }

  public async setIfNotExists(
    key: string,
    record: IdempotencyRecord,
    ttlSeconds: number,
  ): Promise<boolean> {
    const payload = JSON.stringify(record);
    const options = this.buildSetOptions(ttlSeconds, true);
    const response = await this.client.set(this.composeKey(key), payload, options);
    return response === 'OK';
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(this.composeKey(key));
  }

  private composeKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private buildSetOptions(ttlSeconds: number, nx = false): SetOptions | undefined {
    const options: SetOptions = {};

    if (ttlSeconds > 0) {
      options.PX = ttlSeconds * 1000;
    }

    if (nx) {
      options.NX = true;
    }

    return Object.keys(options).length > 0 ? options : undefined;
  }
}
