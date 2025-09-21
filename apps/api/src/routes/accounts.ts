import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  createAccount,
  importDefaultAccounts,
  listAccounts,
  updateAccount,
} from '../modules/accounting/accounts';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const accountParamsSchema = organizationParamsSchema.extend({
  accountId: z.string().uuid(),
});

const accountsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireTreasuryRole = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);

  fastify.get(
    '/orgs/:orgId/accounts',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const accounts = await listAccounts(request.prisma, orgId);
      return { data: accounts };
    }
  );

  fastify.post(
    '/orgs/:orgId/accounts',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const account = await createAccount(request.prisma, orgId, request.body);
      reply.status(201).send({ data: account });
    }
  );

  fastify.post(
    '/orgs/:orgId/accounts/import-default',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const result = await importDefaultAccounts(request.prisma, orgId);
      reply.status(201).send(result);
    }
  );

  fastify.patch(
    '/orgs/:orgId/accounts/:accountId',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId, accountId } = accountParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const account = await updateAccount(request.prisma, orgId, accountId, request.body);
      return { data: account };
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

export default accountsRoutes;
