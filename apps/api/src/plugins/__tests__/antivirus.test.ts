import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpProblemError } from '../../lib/problem-details';
import antivirusPlugin, { type AntivirusScanner } from '../antivirus';

const createScannerMock = vi.hoisted(() => vi.fn());
const isCleanReplyMock = vi.hoisted(() => vi.fn());

vi.mock('clamdjs', () => ({
  createScanner: createScannerMock,
  isCleanReply: isCleanReplyMock,
}));

interface FastifyAntivirusStub {
  config: {
    CLAMAV_ENABLED: boolean;
    CLAMAV_HOST?: string;
    CLAMAV_PORT: number;
    CLAMAV_TIMEOUT_MS: number;
  };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  decorate: ReturnType<typeof vi.fn>;
  decorateRequest: ReturnType<typeof vi.fn>;
  addHook: ReturnType<typeof vi.fn>;
  hooks: {
    onRequest?: OnRequestHook;
  };
}

type OnRequestHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) => void | Promise<void>;

function createFastify(configOverrides: Partial<Record<string, unknown>>): FastifyAntivirusStub {
  const hooks: { onRequest?: OnRequestHook } = {};
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const config = {
    CLAMAV_ENABLED: false,
    CLAMAV_HOST: undefined,
    CLAMAV_PORT: 3310,
    CLAMAV_TIMEOUT_MS: 5000,
    ...configOverrides,
  };

  const stub: FastifyAntivirusStub = {
    config,
    log,
    decorate: vi.fn(),
    decorateRequest: vi.fn(),
    addHook: vi.fn((hook: 'onRequest', handler: OnRequestHook) => {
      hooks.onRequest = handler;
    }),
    hooks,
  };

  return stub;
}

describe('antivirus plugin', () => {
  it('provides a disabled scanner when ClamAV is not enabled', async () => {
    const fastify = createFastify({ CLAMAV_ENABLED: false });

    await antivirusPlugin(fastify as unknown as FastifyInstance);

    expect(fastify.decorate).toHaveBeenCalledWith('antivirus', expect.any(Object));
    const antivirus = fastify.decorate.mock.calls[0][1] as AntivirusScanner;
    expect(await antivirus.scanBuffer(Buffer.from('test'))).toEqual({ status: 'skipped' });
    expect(createScannerMock).not.toHaveBeenCalled();
  });

  it('throws when enabled but host is missing', async () => {
    const fastify = createFastify({ CLAMAV_ENABLED: true, CLAMAV_HOST: undefined });

    await expect(antivirusPlugin(fastify as unknown as FastifyInstance)).rejects.toThrow(
      'CLAMAV_HOST is required when CLAMAV_ENABLED is true.',
    );
  });

  it('scans buffers and reports clean or infected status', async () => {
    const scanBufferMock = vi.fn();
    createScannerMock.mockReturnValueOnce({
      scanBuffer: scanBufferMock,
    });
    isCleanReplyMock.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const fastify = createFastify({ CLAMAV_ENABLED: true, CLAMAV_HOST: '127.0.0.1' });
    await antivirusPlugin(fastify as unknown as FastifyInstance);

    const antivirus = fastify.decorate.mock.calls[0][1] as AntivirusScanner;

    scanBufferMock.mockResolvedValueOnce('OK');
    expect(await antivirus.scanBuffer(Buffer.from('clean'))).toEqual({ status: 'clean' });

    scanBufferMock.mockResolvedValueOnce('stream: malware-signature FOUND');
    const infected = await antivirus.scanBuffer(Buffer.from('infected'));
    expect(infected).toMatchObject({
      status: 'infected',
      signature: 'malware-signature',
    });
    expect(infected.raw).toContain('malware-signature');
  });

  it('logs and throws when scanning fails', async () => {
    const scanBufferMock = vi.fn().mockRejectedValue(new Error('connection error'));
    createScannerMock.mockReturnValueOnce({ scanBuffer: scanBufferMock });

    const fastify = createFastify({ CLAMAV_ENABLED: true, CLAMAV_HOST: 'localhost' });
    await antivirusPlugin(fastify as unknown as FastifyInstance);

    const antivirus = fastify.decorate.mock.calls[0][1] as AntivirusScanner;

    await expect(antivirus.scanBuffer(Buffer.from('fail'))).rejects.toBeInstanceOf(HttpProblemError);
    expect(fastify.log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to scan uploaded file with ClamAV',
    );
  });

  it('decorates request objects with the scanner instance', async () => {
    const scanBufferMock = vi.fn().mockResolvedValue('OK');
    createScannerMock.mockReturnValueOnce({ scanBuffer: scanBufferMock });
    isCleanReplyMock.mockReturnValue(true);

    const fastify = createFastify({ CLAMAV_ENABLED: true, CLAMAV_HOST: '127.0.0.1' });
    await antivirusPlugin(fastify as unknown as FastifyInstance);

    type RequestWithAntivirus = FastifyRequest & { antivirus?: AntivirusScanner };
    const request = {} as RequestWithAntivirus;
    const done = vi.fn();
    await fastify.hooks.onRequest?.(request, {} as unknown as FastifyReply, done);

    expect(typeof request.antivirus?.scanBuffer).toBe('function');
    expect(done).toHaveBeenCalled();
  });
});
