import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import { getFiscalDashboard } from '../modules/accounting/dashboard';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const accountingDashboardRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAccountingRole = fastify.authorizeRoles(
    UserRole.ADMIN,
    UserRole.TREASURER,
    UserRole.SECRETARY,
    UserRole.VIEWER
  );

  fastify.get(
    '/orgs/:orgId/accounting/dashboard',
    { preHandler: requireAccountingRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const dashboard = await getFiscalDashboard(request.prisma, orgId);
      return { data: dashboard };
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

export default accountingDashboardRoutes;
