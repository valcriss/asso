import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  createJournal,
  importDefaultJournals,
  listJournals,
  updateJournal,
} from '../modules/accounting/journals';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const journalParamsSchema = organizationParamsSchema.extend({
  journalId: z.string().uuid(),
});

const journalsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireTreasuryRole = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);

  fastify.get(
    '/orgs/:orgId/journals',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const journals = await listJournals(request.prisma, orgId);
      return { data: journals };
    }
  );

  fastify.post(
    '/orgs/:orgId/journals',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const journal = await createJournal(request.prisma, orgId, request.body);
      reply.status(201).send({ data: journal });
    }
  );

  fastify.post(
    '/orgs/:orgId/journals/import-default',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const result = await importDefaultJournals(request.prisma, orgId);
      reply.status(201).send(result);
    }
  );

  fastify.patch(
    '/orgs/:orgId/journals/:journalId',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId, journalId } = journalParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const journal = await updateJournal(request.prisma, orgId, journalId, request.body);
      return { data: journal };
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

export default journalsRoutes;
