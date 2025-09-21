export type IdempotencyStatus = 'processing' | 'completed';

export interface StoredIdempotencyResponse {
  statusCode: number;
  body: string;
  isBase64Encoded: boolean;
  headers: Record<string, string>;
}

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  createdAt: number;
  response?: StoredIdempotencyResponse;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<void>;
  setIfNotExists?(key: string, record: IdempotencyRecord, ttlSeconds: number): Promise<boolean>;
  delete?(key: string): Promise<void>;
}
