import type { FastifyReply } from 'fastify';
import type { StoredIdempotencyResponse } from './types';

export async function replayStoredResponse(
  reply: FastifyReply,
  stored: StoredIdempotencyResponse,
): Promise<void> {
  for (const [header, value] of Object.entries(stored.headers)) {
    reply.header(header, value);
  }

  reply.status(stored.statusCode);
  const body = stored.isBase64Encoded
    ? Buffer.from(stored.body, 'base64')
    : stored.body;

  await reply.send(body);
}
