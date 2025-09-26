import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  listFiscalYears,
  createFiscalYear,
  updateFiscalYear,
  setFiscalYearLock,
} from '../modules/accounting/fiscal-years';
import { writeAuditLog } from '../modules/audit/service';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const yearParamsSchema = organizationParamsSchema.extend({
  fiscalYearId: z.string().uuid(),
});

const fiscalYearsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireRole = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);

  fastify.get('/orgs/:orgId/fiscal-years', { preHandler: requireRole }, async (request) => {
    const { orgId } = organizationParamsSchema.parse(request.params);
    ensureOrganizationAccess(request.user?.organizationId, orgId);

    const years = await listFiscalYears(request.prisma, orgId);
    return { data: years };
  });

  fastify.post('/orgs/:orgId/fiscal-years', { preHandler: requireRole }, async (request, reply) => {
    const { orgId } = organizationParamsSchema.parse(request.params);
    ensureOrganizationAccess(request.user?.organizationId, orgId);

    const year = await createFiscalYear(request.prisma, orgId, request.body);
    reply.status(201).send({ data: year });
  });

  fastify.patch(
    '/orgs/:orgId/fiscal-years/:fiscalYearId',
    { preHandler: requireRole },
    async (request) => {
      const { orgId, fiscalYearId } = yearParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const year = await updateFiscalYear(request.prisma, orgId, fiscalYearId, request.body);
      return { data: year };
    }
  );

  fastify.post(
    '/orgs/:orgId/fiscal-years/:fiscalYearId/lock',
    { preHandler: requireRole },
    async (request) => {
      const { orgId, fiscalYearId } = yearParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const year = await setFiscalYearLock(request.prisma, orgId, fiscalYearId, { locked: true });
      await writeAuditLog(
        request.prisma,
        orgId,
        request.user?.id ?? null,
        'FISCAL_YEAR_LOCKED',
        'fiscal_year',
        year.id,
        { lockedAt: year.lockedAt }
      );
      return { data: year };
    }
  );

  fastify.delete(
    '/orgs/:orgId/fiscal-years/:fiscalYearId/lock',
    { preHandler: requireRole },
    async (request) => {
      const { orgId, fiscalYearId } = yearParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const year = await setFiscalYearLock(request.prisma, orgId, fiscalYearId, { locked: false });
      await writeAuditLog(
        request.prisma,
        orgId,
        request.user?.id ?? null,
        'FISCAL_YEAR_UNLOCKED',
        'fiscal_year',
        year.id,
        { lockedAt: year.lockedAt }
      );
      return { data: year };
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

export default fiscalYearsRoutes;
