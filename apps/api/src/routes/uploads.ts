import type { FastifyPluginAsync } from 'fastify';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import { uploadAttachment } from '../modules/uploads/service';
import { uploadTargetSchema } from '../modules/uploads/schemas';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireUploadRole = fastify.authorizeRoles(
    UserRole.ADMIN,
    UserRole.TREASURER,
    UserRole.SECRETARY
  );

  fastify.post(
    '/orgs/:orgId/uploads',
    { preHandler: requireUploadRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const file = await request.file();
      if (!file) {
        throw new HttpProblemError({
          status: 400,
          title: 'FILE_REQUIRED',
          detail: 'A multipart file field named "file" must be provided.',
        });
      }

      const target = parseTarget(file);

      if (file.file.truncated) {
        throw new HttpProblemError({
          status: 413,
          title: 'FILE_TOO_LARGE',
          detail: 'The uploaded file exceeds the maximum allowed size of 20 MB.',
        });
      }

      const buffer = await file.toBuffer();

      const attachment = await uploadAttachment(
        request.prisma,
        request.objectStorage,
        request.antivirus,
        orgId,
        {
          filename: file.filename ?? 'document',
          contentType: file.mimetype ?? 'application/octet-stream',
          buffer,
          targetType: target.targetType,
          targetId: target.targetId,
        }
      );

      reply.status(201).send({ data: attachment });
    }
  );
};

function parseTarget(file: MultipartFile) {
  const fields = file.fields ?? {};
  const targetType = getFieldValue(fields['targetType']);
  const targetId = getFieldValue(fields['targetId']);

  return uploadTargetSchema.parse({
    targetType,
    targetId,
  });
}

function getFieldValue(value: Multipart | Multipart[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return getFieldValue(value[0]);
  }

  if (value.type === 'field') {
    return typeof value.value === 'string' ? value.value : String(value.value);
  }

  return undefined;
}

function ensureOrganizationAccess(userOrgId: string | undefined, orgId: string): void {
  if (!userOrgId) {
    throw new HttpProblemError({
      status: 401,
      title: 'UNAUTHORIZED',
      detail: 'Authentication is required.',
    });
  }

  if (userOrgId !== orgId) {
    throw new HttpProblemError({
      status: 403,
      title: 'FORBIDDEN_ORGANIZATION_ACCESS',
      detail: 'You do not have access to this organization.',
    });
  }
}

export default uploadsRoutes;
