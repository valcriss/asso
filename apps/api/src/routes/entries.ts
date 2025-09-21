import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import { createEntry, lockEntry } from '../modules/accounting/entries';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const entryParamsSchema = organizationParamsSchema.extend({
  entryId: z.string().uuid(),
});

const entriesRoutes: FastifyPluginAsync = async (fastify) => {
  const requireTreasuryRole = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);

  fastify.post(
    '/orgs/:orgId/entries',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const userId = request.user?.id;
      if (!userId) {
        throw new HttpProblemError({
          status: 401,
          title: 'UNAUTHORIZED',
          detail: 'Authentication is required.',
        });
      }

      const entry = await createEntry(request.prisma, orgId, userId, request.body);
      reply.status(201).send({ data: entry });
    }
  );

  fastify.post(
    '/orgs/:orgId/entries/:entryId/lock',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId, entryId } = entryParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const entry = await lockEntry(request.prisma, orgId, entryId);
      return { data: entry };
    }
  );
};

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

export default entriesRoutes;
