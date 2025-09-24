import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  createDonation,
  exportDonations,
  listDonations,
  listDonationsQuerySchema,
  donationExportQuerySchema,
} from '../modules/donations';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const donationsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireDonationManager = fastify.authorizeRoles(UserRole.TREASURER, UserRole.ADMIN);
  const requireDonationViewer = fastify.authorizeRoles(
    UserRole.TREASURER,
    UserRole.ADMIN,
    UserRole.SECRETARY,
    UserRole.VIEWER
  );

  fastify.get(
    '/orgs/:orgId/donations',
    { preHandler: requireDonationViewer },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = listDonationsQuerySchema.parse(request.query ?? {});
      const pagination = request.pagination;

      const result = await listDonations(request.prisma, orgId, query, {
        pagination: pagination
          ? {
              limit: pagination.limit,
              offset: pagination.offset,
            }
          : undefined,
      });

      const meta = pagination
        ? {
            total: result.total,
            page: pagination.page,
            limit: pagination.limit,
          }
        : { total: result.total };

      return { data: result.items, meta };
    }
  );

  fastify.post(
    '/orgs/:orgId/donations',
    { preHandler: requireDonationManager },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const donation = await createDonation(request.prisma, request.objectStorage, orgId, request.body);
      reply.status(201).send({ data: donation });
    }
  );

  fastify.get(
    '/orgs/:orgId/donations/export',
    { preHandler: requireDonationManager },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = donationExportQuerySchema.parse(request.query ?? {});
      const report = await exportDonations(request.prisma, orgId, query);

      reply
        .type('text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="donations-${report.fiscalYear.label}.csv"`
        )
        .send(report.csv);
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

export default donationsRoutes;
