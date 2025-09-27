import { describe, expect, it } from 'vitest';
import {
  HttpProblemError,
  isHttpProblemError,
  toProblemDetail,
} from '../problem-details';

describe('HttpProblemError', () => {
  it('stores metadata and optional cause', () => {
    const cause = new Error('boom');
    const error = new HttpProblemError({
      status: 422,
      title: 'INVALID_DATA',
      detail: 'Payload is invalid.',
      instance: '/tests/1',
      type: 'https://example.org/problems/invalid-data',
      cause,
    });

    expect(error.name).toBe('HttpProblemError');
    expect(error.status).toBe(422);
    expect(error.type).toBe('https://example.org/problems/invalid-data');
    expect(error.detail).toBe('Payload is invalid.');
    expect(error.instance).toBe('/tests/1');
    expect(error.cause).toBe(cause);
  });
});

describe('isHttpProblemError', () => {
  it('detects native and plain-object problem errors', () => {
    const asInstance = new HttpProblemError({ status: 400, title: 'BAD_REQUEST' });
    expect(isHttpProblemError(asInstance)).toBe(true);

    const asObject = { name: 'HttpProblemError', status: 404, title: 'NOT_FOUND' };
    expect(isHttpProblemError(asObject)).toBe(true);

    expect(isHttpProblemError({})).toBe(false);
    expect(isHttpProblemError(null)).toBe(false);
  });
});

describe('toProblemDetail', () => {
  it('preserves HttpProblemError properties', () => {
    const detail = toProblemDetail(new HttpProblemError({
      status: 400,
      title: 'BAD_REQUEST',
      type: 'https://example.org/problems/bad-request',
      detail: 'Missing field',
    }), '/instance');

    expect(detail).toEqual({
      type: 'https://example.org/problems/bad-request',
      title: 'BAD_REQUEST',
      status: 400,
      detail: 'Missing field',
      instance: '/instance',
    });
  });

  it('normalizes fastify-style errors', () => {
    const fastifyError = { statusCode: 404, message: 'Not Found', code: 'FST_ERR_NOT_FOUND' };
    const detail = toProblemDetail(fastifyError);

    expect(detail).toEqual({
      type: 'about:blank',
      title: 'FST_ERR_NOT_FOUND',
      status: 404,
      detail: 'Not Found',
      instance: undefined,
    });
  });

  it('omits details for 5xx fastify errors', () => {
    const fastifyError = { statusCode: 503, message: 'Service Unavailable', code: 'ERR' };
    const detail = toProblemDetail(fastifyError);

    expect(detail.detail).toBeUndefined();
    expect(detail.status).toBe(503);
  });

  it('falls back to default internal error when no status code is available', () => {
    const customError = { status: 401, message: 'Unauthorized', name: 'Custom' };
    const detail = toProblemDetail(customError);

    expect(detail).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: undefined,
      instance: undefined,
    });
  });

  it('handles unknown errors gracefully', () => {
    const fromError = toProblemDetail(new Error('Oops'));
    expect(fromError).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: undefined,
      instance: undefined,
    });

    const fromUnknown = toProblemDetail('boom');
    expect(fromUnknown).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: undefined,
      instance: undefined,
    });
  });
});
