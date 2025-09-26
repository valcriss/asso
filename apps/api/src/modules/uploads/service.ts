import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { HttpProblemError } from '../../lib/problem-details';
import type { ObjectStorage } from '../../plugins/object-storage';
import type { AntivirusScanner } from '../../plugins/antivirus';
import { uploadTargetSchema } from './schemas';

export type UploadClient = PrismaClient | Prisma.TransactionClient;

interface UploadInput {
  filename: string;
  contentType: string;
  buffer: Buffer;
  targetType: 'entry' | 'project';
  targetId: string;
}

export async function uploadAttachment(
  client: UploadClient,
  storage: ObjectStorage,
  antivirus: AntivirusScanner,
  organizationId: string,
  input: UploadInput
) {
  const parsedTarget = uploadTargetSchema.parse({
    targetType: input.targetType,
    targetId: input.targetId,
  });

  await ensureTargetExists(client, organizationId, parsedTarget);

  const normalizedContentType = normalizeContentType(input.contentType);
  const sanitizedFilename = sanitizeFilename(input.filename);

  if (sanitizedFilename.length === 0) {
    throw new HttpProblemError({
      status: 400,
      title: 'INVALID_FILENAME',
      detail: 'The uploaded file name must contain at least one visible character.',
    });
  }

  if (input.buffer.length === 0) {
    throw new HttpProblemError({
      status: 400,
      title: 'EMPTY_FILE',
      detail: 'The uploaded file is empty.',
    });
  }

  const scanResult = await antivirus.scanBuffer(input.buffer);
  if (scanResult.status === 'infected') {
    throw new HttpProblemError({
      status: 422,
      title: 'FILE_INFECTED',
      detail: scanResult.signature
        ? `The uploaded file is infected (${scanResult.signature}).`
        : 'The uploaded file is infected.',
    });
  }

  const sha256 = createHash('sha256').update(input.buffer).digest('hex');
  const storageKey = buildStorageKey(organizationId, parsedTarget, sanitizedFilename);

  const uploadResult = await storage.putObject({
    key: storageKey,
    body: input.buffer,
    contentType: normalizedContentType,
  });

  const attachment = await client.attachment.create({
    data: {
      organizationId,
      entryId: parsedTarget.targetType === 'entry' ? parsedTarget.targetId : null,
      projectId: parsedTarget.targetType === 'project' ? parsedTarget.targetId : null,
      storageKey,
      url: uploadResult.url,
      filename: sanitizedFilename,
      mime: normalizedContentType,
      sha256,
      versionId: uploadResult.versionId ?? null,
      byteSize: input.buffer.length,
    },
  });

  return attachment;
}

async function ensureTargetExists(
  client: UploadClient,
  organizationId: string,
  target: { targetType: 'entry' | 'project'; targetId: string }
): Promise<void> {
  if (target.targetType === 'entry') {
    const entry = await client.entry.findFirst({
      where: { id: target.targetId, organizationId },
      select: { id: true },
    });

    if (!entry) {
      throw new HttpProblemError({
        status: 404,
        title: 'ENTRY_NOT_FOUND',
        detail: 'The specified accounting entry does not exist.',
      });
    }
    return;
  }

  const project = await client.project.findFirst({
    where: { id: target.targetId, organizationId },
    select: { id: true },
  });

  if (!project) {
    throw new HttpProblemError({
      status: 404,
      title: 'PROJECT_NOT_FOUND',
      detail: 'The specified project does not exist.',
    });
  }
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return 'document';
  }

  const nameWithoutDirs = trimmed.replace(/\\/g, '/').split('/').pop() ?? trimmed;
  const ext = extname(nameWithoutDirs);
  const base = ext ? nameWithoutDirs.slice(0, -ext.length) : nameWithoutDirs;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
  return safeExt ? `${safeBase}${safeExt}` : safeBase;
}

function normalizeContentType(contentType: string): string {
  const value = contentType?.trim();
  return value && value.length > 0 ? value : 'application/octet-stream';
}

function buildStorageKey(
  organizationId: string,
  target: { targetType: 'entry' | 'project'; targetId: string },
  filename: string
): string {
  const unique = randomUUID();
  const extension = extname(filename);
  const basename = extension ? filename.slice(0, -extension.length) : filename;
  const safeExtension = extension || '';
  const targetSegment = target.targetType === 'entry' ? 'entries' : 'projects';
  return [
    'attachments',
    organizationId,
    targetSegment,
    target.targetId,
    `${basename}-${unique}${safeExtension}`,
  ]
    .map((part) => part.replace(/\s+/g, '-'))
    .join('/');
}
