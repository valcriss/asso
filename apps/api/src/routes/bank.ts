import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  createBankAccount,
  deleteBankAccount,
  getBankAccount,
  listBankAccounts,
  updateBankAccount,
} from '../modules/accounting/bank-accounts';
import { recordBankStatement } from '../modules/accounting/bank-statements';
import {
  getReconciliationSuggestions,
  importOfxTransactions,
} from '../modules/accounting/bank-transactions';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const bankAccountParamsSchema = organizationParamsSchema.extend({
  bankAccountId: z.string().uuid(),
});

const bankRoutes: FastifyPluginAsync = async (fastify) => {
  const requireTreasuryRole = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);

  fastify.get(
    '/orgs/:orgId/bank/accounts',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const accounts = await listBankAccounts(request.prisma, orgId);
      return { data: accounts };
    }
  );

  fastify.post(
    '/orgs/:orgId/bank/accounts',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const account = await createBankAccount(request.prisma, orgId, request.body);
      reply.status(201).send({ data: account });
    }
  );

  fastify.get(
    '/orgs/:orgId/bank/accounts/:bankAccountId',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId, bankAccountId } = bankAccountParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const account = await getBankAccount(request.prisma, orgId, bankAccountId);
      return { data: account };
    }
  );

  fastify.patch(
    '/orgs/:orgId/bank/accounts/:bankAccountId',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId, bankAccountId } = bankAccountParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const account = await updateBankAccount(request.prisma, orgId, bankAccountId, request.body);
      return { data: account };
    }
  );

  fastify.delete(
    '/orgs/:orgId/bank/accounts/:bankAccountId',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId, bankAccountId } = bankAccountParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      await deleteBankAccount(request.prisma, orgId, bankAccountId);
      reply.status(204).send();
    }
  );

  fastify.post(
    '/orgs/:orgId/bank/statements',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const statement = await recordBankStatement(request.prisma, orgId, request.body);
      reply.status(201).send({ data: statement });
    }
  );

  fastify.post(
    '/orgs/:orgId/bank/import-ofx',
    { preHandler: requireTreasuryRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const result = await importOfxTransactions(request.prisma, orgId, request.body);
      reply.status(201).send({ data: result });
    }
  );

  fastify.post(
    '/orgs/:orgId/bank/reconcile',
    { preHandler: requireTreasuryRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const result = await getReconciliationSuggestions(request.prisma, orgId, request.body);
      return { data: result };
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

export default bankRoutes;
