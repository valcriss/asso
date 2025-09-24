import fp from 'fastify-plugin';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyPluginAsync } from 'fastify';

export interface PutObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface PutObjectResult {
  url: string;
}

export interface ObjectStorage {
  putObject(params: PutObjectParams): Promise<PutObjectResult>;
  getPublicUrl(key: string): string;
}

declare module 'fastify' {
  interface FastifyInstance {
    objectStorage: ObjectStorage;
  }

  interface FastifyRequest {
    objectStorage: ObjectStorage;
  }
}

const objectStoragePlugin: FastifyPluginAsync = fp(async (fastify) => {
  const {
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
    S3_BUCKET,
    S3_REGION,
    S3_ENDPOINT,
    S3_PUBLIC_URL,
  } = fastify.config;

  const s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });

  const buildObjectUrl = (key: string): string => {
    if (S3_PUBLIC_URL && S3_PUBLIC_URL.trim() !== '') {
      return `${S3_PUBLIC_URL.replace(/\/?$/, '')}/${key}`;
    }

    if (S3_ENDPOINT && S3_ENDPOINT.trim() !== '') {
      return `${S3_ENDPOINT.replace(/\/?$/, '')}/${S3_BUCKET}/${key}`;
    }

    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  };

  const storage: ObjectStorage = {
    async putObject({ key, body, contentType }: PutObjectParams): Promise<PutObjectResult> {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );

      return { url: buildObjectUrl(key) };
    },
    getPublicUrl(key: string): string {
      return buildObjectUrl(key);
    },
  };

  fastify.decorate('objectStorage', storage);
  fastify.decorateRequest('objectStorage', undefined as unknown as ObjectStorage);

  fastify.addHook('onRequest', (request, _reply, done) => {
    request.objectStorage = fastify.objectStorage;
    done();
  });

  fastify.addHook('onClose', async () => {
    s3Client.destroy();
  });
}, { name: 'object-storage' });

export default objectStoragePlugin;
