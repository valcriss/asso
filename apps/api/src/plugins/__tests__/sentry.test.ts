import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import sentryPlugin from '../sentry';

const initMock = vi.hoisted(() => vi.fn());
const withScopeMock = vi.hoisted(() => vi.fn((callback) => callback(scopeMock())));
const captureExceptionMock = vi.hoisted(() => vi.fn());
const flushMock = vi.hoisted(() => vi.fn(async () => {}));
const closeMock = vi.hoisted(() => vi.fn(async () => {}));

const scopeMock = vi.hoisted(() => () => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
  setExtra: vi.fn(),
}));

vi.mock('@sentry/node', () => ({
  init: initMock,
  withScope: withScopeMock,
  captureException: captureExceptionMock,
  flush: flushMock,
  close: closeMock,
}));

const tenantIdentifierMock = vi.hoisted(() => vi.fn(() => 'tenant-from-header'));
vi.mock('../../lib/http/tenant', () => ({
  getTenantIdentifier: tenantIdentifierMock,
}));

interface FastifySentryStub {
  config: {
    NODE_ENV: string;
    SENTRY_ENVIRONMENT: string;
    SENTRY_TRACES_SAMPLE_RATE: number;
    SENTRY_DSN?: string;
  };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  addHook: ReturnType<typeof vi.fn>;
  hooks: {
    onError?: OnErrorHook;
    onClose?: CloseHook;
  };
}

type OnErrorHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) => void | Promise<void>;

type CloseHook = () => void | Promise<void>;

function createFastifyStub(configOverrides: Partial<Record<string, unknown>> = {}): FastifySentryStub {
  const hooks: { onError?: OnErrorHook; onClose?: CloseHook } = {};
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  const config = {
    NODE_ENV: 'development',
    SENTRY_ENVIRONMENT: 'staging',
    SENTRY_TRACES_SAMPLE_RATE: 0.4,
    ...configOverrides,
  };

  const stub: FastifySentryStub = {
    config,
    log,
    addHook: vi.fn((hook: 'onError' | 'onClose', handler: OnErrorHook | CloseHook) => {
      if (hook === 'onError') {
        hooks.onError = handler as OnErrorHook;
      } else {
        hooks.onClose = handler as CloseHook;
      }
    }),
    hooks,
  };

  return stub;
}

describe('sentry plugin', () => {
  it('skips initialization when DSN is missing', async () => {
    const fastify = createFastifyStub();

    await sentryPlugin(fastify as unknown as FastifyInstance);

    expect(fastify.log.info).toHaveBeenCalledWith(
      'Sentry DSN not provided. Error tracking is disabled.',
    );
    expect(initMock).not.toHaveBeenCalled();
    expect(fastify.addHook).not.toHaveBeenCalled();
  });

  it('configures sentry, captures errors, and closes gracefully', async () => {
    const fastify = createFastifyStub({ SENTRY_DSN: 'https://dsn' });

    await sentryPlugin(fastify as unknown as FastifyInstance);

    expect(initMock).toHaveBeenCalledWith({
      dsn: 'https://dsn',
      environment: 'staging',
      tracesSampleRate: 0.4,
    });
    expect(fastify.log.info).toHaveBeenCalledWith('Sentry error tracking enabled.');

    type RequestWithExtras = FastifyRequest & {
      routeOptions?: { url?: string };
      user?: { id: string; organizationId?: string };
      log: { warn: ReturnType<typeof vi.fn> };
    };

    const request = {
      id: 'req-1',
      method: 'GET',
      url: '/members',
      headers: { 'x-tenant-id': 'abc' },
      routeOptions: { url: '/members/:id' },
      user: { id: 'user-1', organizationId: 'org-1' },
      log: { warn: vi.fn() },
    } as RequestWithExtras;
    const reply = { statusCode: 500 } as unknown as FastifyReply;
    const error = new Error('Boom');

    const scope = scopeMock();
    withScopeMock.mockImplementationOnce((fn) => fn(scope));

    await fastify.hooks.onError?.(request, reply, error);

    expect(scope.setTag).toHaveBeenCalledWith('request_id', 'req-1');
    expect(scope.setUser).toHaveBeenCalledWith({ id: 'user-1', organizationId: 'org-1' });
    expect(scope.setContext).toHaveBeenCalledWith('request', {
      method: 'GET',
      url: '/members',
      route: '/members/:id',
      statusCode: 500,
    });
    expect(scope.setExtra).toHaveBeenCalledWith('request_headers', request.headers);
    expect(captureExceptionMock).toHaveBeenCalledWith(error);
    expect(flushMock).toHaveBeenCalledWith(2000);

    const scopeWithoutUser = scopeMock();
    withScopeMock.mockImplementationOnce((fn) => fn(scopeWithoutUser));
    tenantIdentifierMock.mockReturnValueOnce('tenant-header');

    const requestWithoutUser = {
      id: 'req-2',
      method: 'POST',
      url: '/members',
      headers: { 'x-tenant-id': 'tenant-header' },
      routeOptions: { url: '/members' },
      log: { warn: vi.fn() },
    } as RequestWithExtras;

    flushMock.mockRejectedValueOnce(new Error('flush failed'));

    await fastify.hooks.onError?.(requestWithoutUser, { statusCode: 400 } as unknown as FastifyReply, error);

    expect(scopeWithoutUser.setContext).toHaveBeenCalledWith('organization', { id: 'tenant-header' });
    expect(requestWithoutUser.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to flush Sentry events',
    );

    closeMock.mockRejectedValueOnce(new Error('close failed'));
    await fastify.hooks.onClose?.();
    expect(closeMock).toHaveBeenCalledWith(2000);
    expect(fastify.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to close Sentry',
    );
  });
});
