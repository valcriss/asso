import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import objectStoragePlugin, { type ObjectStorage } from '../object-storage';

const sendMock = vi.hoisted(() => vi.fn());
const destroyMock = vi.hoisted(() => vi.fn());

const PutObjectCommandMock = vi.hoisted(() => vi.fn((input) => ({ input })));
const S3ClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    send: sendMock,
    destroy: destroyMock,
  }))
);

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientMock,
  PutObjectCommand: PutObjectCommandMock,
}));

interface FastifyObjectStorageStub {
  config: {
    S3_ACCESS_KEY_ID: string;
    S3_SECRET_ACCESS_KEY: string;
    S3_BUCKET: string;
    S3_REGION: string;
    S3_ENDPOINT: string;
    S3_PUBLIC_URL: string;
  };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  decorate: ReturnType<typeof vi.fn>;
  decorateRequest: ReturnType<typeof vi.fn>;
  addHook: ReturnType<typeof vi.fn>;
  hooks: HookRegistry;
}

type HookRegistry = {
  onRequest?: OnRequestHook;
  onClose?: CloseHook;
};

type OnRequestHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) => void | Promise<void>;

type CloseHook = () => void | Promise<void>;

function createFastify(configOverrides: Partial<Record<string, unknown>>): FastifyObjectStorageStub {
  const hooks: HookRegistry = {};
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const config = {
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_BUCKET: 'my-bucket',
    S3_REGION: 'eu-west-3',
    S3_ENDPOINT: '',
    S3_PUBLIC_URL: '',
    ...configOverrides,
  };

  const stub: FastifyObjectStorageStub = {
    config,
    log,
    decorate: vi.fn(),
    decorateRequest: vi.fn(),
    addHook: vi.fn((name: 'onRequest' | 'onClose', handler: OnRequestHook | CloseHook) => {
      if (name === 'onRequest') {
        hooks.onRequest = handler as OnRequestHook;
      } else {
        hooks.onClose = handler as CloseHook;
      }
    }),
    hooks,
  };

  return stub;
}

describe('object storage plugin', () => {
  it('uploads objects and builds urls using public endpoint when provided', async () => {
    sendMock.mockResolvedValueOnce({ VersionId: 'v1' });

    const fastify = createFastify({ S3_PUBLIC_URL: 'https://cdn.example.com/' });

    await objectStoragePlugin(fastify as unknown as FastifyInstance);

    expect(S3ClientMock).toHaveBeenCalledWith({
      region: 'eu-west-3',
      endpoint: undefined,
      forcePathStyle: false,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    const storage = fastify.decorate.mock.calls[0][1] as ObjectStorage;
    const result = await storage.putObject({
      key: 'path/to/file.pdf',
      body: Buffer.from('test'),
      contentType: 'application/pdf',
    });

    expect(PutObjectCommandMock).toHaveBeenCalledWith({
      Bucket: 'my-bucket',
      Key: 'path/to/file.pdf',
      Body: expect.any(Buffer),
      ContentType: 'application/pdf',
    });
    expect(result).toEqual({
      key: 'path/to/file.pdf',
      url: 'https://cdn.example.com/path/to/file.pdf',
      versionId: 'v1',
    });
  });

  it('falls back to endpoint and standard S3 urls and cleans up client', async () => {
    sendMock.mockResolvedValueOnce({});

    const fastify = createFastify({
      S3_PUBLIC_URL: '',
      S3_ENDPOINT: 'https://storage.local',
    });

    await objectStoragePlugin(fastify as unknown as FastifyInstance);

    expect(S3ClientMock).toHaveBeenCalledWith({
      region: 'eu-west-3',
      endpoint: 'https://storage.local',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    const storage = fastify.decorate.mock.calls[0][1] as ObjectStorage;

    expect(storage.getPublicUrl('doc.txt')).toBe('https://storage.local/my-bucket/doc.txt');

    sendMock.mockResolvedValueOnce({});
    await storage.putObject({ key: 'file.txt', body: Buffer.alloc(0), contentType: 'text/plain' });

    await fastify.hooks.onClose?.();
    expect(destroyMock).toHaveBeenCalled();
  });

  it('uses AWS URL format when no overrides are configured', async () => {
    sendMock.mockResolvedValueOnce({});

    const fastify = createFastify({ S3_PUBLIC_URL: '', S3_ENDPOINT: '' });

    await objectStoragePlugin(fastify as unknown as FastifyInstance);

    const storage = fastify.decorate.mock.calls[0][1] as ObjectStorage;
    expect(storage.getPublicUrl('image.png')).toBe(
      'https://my-bucket.s3.eu-west-3.amazonaws.com/image.png',
    );
  });

  it('decorates request objects with storage instance', async () => {
    const fastify = createFastify({});
    await objectStoragePlugin(fastify as unknown as FastifyInstance);

    type RequestWithStorage = FastifyRequest & { objectStorage?: ObjectStorage };
    const request = {} as RequestWithStorage;
    const done = vi.fn();

    await fastify.hooks.onRequest?.(request, {} as unknown as FastifyReply, done);

    expect(request.objectStorage).toBeDefined();
    expect(done).toHaveBeenCalled();
  });
});
