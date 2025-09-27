import { describe, expect, it, vi } from 'vitest';
import objectStoragePlugin from '../object-storage';

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

function createFastify(configOverrides: Partial<Record<string, unknown>>) {
  const hooks: Record<string, any> = {};
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

  return {
    config,
    log,
    decorate: vi.fn(),
    decorateRequest: vi.fn(),
    addHook: vi.fn((name: string, handler: any) => {
      hooks[name] = handler;
    }),
    hooks,
  };
}

describe('object storage plugin', () => {
  it('uploads objects and builds urls using public endpoint when provided', async () => {
    sendMock.mockResolvedValueOnce({ VersionId: 'v1' });

    const fastify = createFastify({ S3_PUBLIC_URL: 'https://cdn.example.com/' });

    await objectStoragePlugin(fastify as any);

    expect(S3ClientMock).toHaveBeenCalledWith({
      region: 'eu-west-3',
      endpoint: undefined,
      forcePathStyle: false,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    const storage = fastify.decorate.mock.calls[0][1] as any;
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

    await objectStoragePlugin(fastify as any);

    expect(S3ClientMock).toHaveBeenCalledWith({
      region: 'eu-west-3',
      endpoint: 'https://storage.local',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    });

    const storage = fastify.decorate.mock.calls[0][1] as any;

    expect(storage.getPublicUrl('doc.txt')).toBe('https://storage.local/my-bucket/doc.txt');

    sendMock.mockResolvedValueOnce({});
    await storage.putObject({ key: 'file.txt', body: Buffer.alloc(0), contentType: 'text/plain' });

    fastify.hooks.onClose();
    expect(destroyMock).toHaveBeenCalled();
  });

  it('uses AWS URL format when no overrides are configured', async () => {
    sendMock.mockResolvedValueOnce({});

    const fastify = createFastify({ S3_PUBLIC_URL: '', S3_ENDPOINT: '' });

    await objectStoragePlugin(fastify as any);

    const storage = fastify.decorate.mock.calls[0][1] as any;
    expect(storage.getPublicUrl('image.png')).toBe(
      'https://my-bucket.s3.eu-west-3.amazonaws.com/image.png',
    );
  });
});
