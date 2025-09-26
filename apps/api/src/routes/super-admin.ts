import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { HttpProblemError } from '../lib/problem-details';

const uuidSchema = z.string().uuid();

const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Search term must contain at least two characters.')
    .max(255)
    .optional(),
  status: z.enum(['all', 'active', 'locked']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const lockBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const organizationSummarySelect = {
  id: true,
  name: true,
  createdAt: true,
  accessLockedAt: true,
  accessLockedBy: true,
  accessLockedReason: true,
  apiSecret: true,
  apiSecretRotatedAt: true,
} satisfies Prisma.OrganizationSelect;

type OrganizationSummaryRow = Prisma.OrganizationGetPayload<{
  select: typeof organizationSummarySelect;
}>;

const superAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const requireSuperAdmin = fastify.authorizeSuperAdmin();

  fastify.get(
    '/super-admin/organizations',
    { preHandler: requireSuperAdmin },
    async (request) => {
      const query = searchQuerySchema.parse(request.query ?? {});

      const where: Prisma.OrganizationWhereInput = {};

      if (query.q) {
        const searchPredicates: Prisma.OrganizationWhereInput[] = [
          { name: { contains: query.q, mode: 'insensitive' } },
        ];

        if (uuidSchema.safeParse(query.q).success) {
          searchPredicates.push({ id: query.q });
        }

        where.OR = searchPredicates;
      }

      if (query.status === 'active') {
        where.accessLockedAt = null;
      } else if (query.status === 'locked') {
        where.accessLockedAt = { not: null };
      }

      const organizations = await request.prisma.organization.findMany({
        where,
        orderBy: [
          { accessLockedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        take: query.limit,
        select: organizationSummarySelect,
      });

      return {
        data: await Promise.all(
          organizations.map((organization) => mapWithProjectCount(request.prisma, organization))
        ),
      };
    }
  );

  fastify.post(
    '/super-admin/organizations/:orgId/lock',
    { preHandler: requireSuperAdmin },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      const body = lockBodySchema.parse(request.body ?? {});

      const existing = await fetchOrganizationSummary(request.prisma, orgId);
      if (!existing) {
        throw organizationNotFoundError();
      }

      if (existing.lockedAt) {
        throw new HttpProblemError({
          status: 409,
          title: 'ORGANIZATION_ALREADY_LOCKED',
          detail: 'The organization is already locked.',
        });
      }

      const updated = await request.prisma.organization.update({
        where: { id: orgId },
        data: {
          accessLockedAt: new Date(),
          accessLockedBy: request.user?.id ?? null,
          accessLockedReason: body.reason ?? null,
        },
        select: organizationSummarySelect,
      });

      return {
        data: await mapWithProjectCount(request.prisma, updated),
      };
    }
  );

  fastify.delete(
    '/super-admin/organizations/:orgId/lock',
    { preHandler: requireSuperAdmin },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);

      const existing = await fetchOrganizationSummary(request.prisma, orgId);
      if (!existing) {
        throw organizationNotFoundError();
      }

      if (!existing.lockedAt) {
        throw new HttpProblemError({
          status: 409,
          title: 'ORGANIZATION_NOT_LOCKED',
          detail: 'The organization is not currently locked.',
        });
      }

      const updated = await request.prisma.organization.update({
        where: { id: orgId },
        data: {
          accessLockedAt: null,
          accessLockedBy: null,
          accessLockedReason: null,
        },
        select: organizationSummarySelect,
      });

      return {
        data: await mapWithProjectCount(request.prisma, updated),
      };
    }
  );

  fastify.post(
    '/super-admin/organizations/:orgId/rotate-secret',
    { preHandler: requireSuperAdmin },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);

      const existing = await fetchOrganizationSummary(request.prisma, orgId);
      if (!existing) {
        throw organizationNotFoundError();
      }

      const secret = randomBytes(24).toString('base64url');

      const updated = await request.prisma.organization.update({
        where: { id: orgId },
        data: {
          apiSecret: secret,
          apiSecretRotatedAt: new Date(),
        },
        select: organizationSummarySelect,
      });

      return {
        data: {
          ...(await mapWithProjectCount(request.prisma, updated)),
          secret,
        },
      };
    }
  );
};

async function mapWithProjectCount(
  client: PrismaClient | Prisma.TransactionClient,
  organization: OrganizationSummaryRow
) {
  const projectCount = await countProjectsForOrganization(client, organization.id);
  return mapOrganizationSummary(organization, projectCount);
}

function mapOrganizationSummary(organization: OrganizationSummaryRow, projectCount: number) {
  return {
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString(),
    status: organization.accessLockedAt ? 'LOCKED' : 'ACTIVE',
    lockedAt: toIso(organization.accessLockedAt),
    lockedBy: organization.accessLockedBy,
    lockReason: organization.accessLockedReason ?? null,
    hasActiveSecret: Boolean(organization.apiSecret),
    lastSecretRotationAt: toIso(organization.apiSecretRotatedAt),
    projectCount,
  };
}

async function fetchOrganizationSummary(
  client: PrismaClient | Prisma.TransactionClient,
  organizationId: string
): Promise<ReturnType<typeof mapOrganizationSummary> | null> {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: organizationSummarySelect,
  });

  if (!organization) {
    return null;
  }

  const projectCount = await countProjectsForOrganization(client, organization.id);
  return mapOrganizationSummary(organization, projectCount);
}

function organizationNotFoundError(): HttpProblemError {
  return new HttpProblemError({
    status: 404,
    title: 'ORGANIZATION_NOT_FOUND',
    detail: 'The requested organization does not exist.',
  });
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function countProjectsForOrganization(
  client: PrismaClient | Prisma.TransactionClient,
  organizationId: string
): Promise<number> {
  const setTenant = `SET app.current_org = '${organizationId}'`;
  const resetTenant = 'RESET app.current_org';

  if (client instanceof PrismaClient) {
    return client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(setTenant);
      try {
        return await tx.project.count();
      } finally {
        await tx.$executeRawUnsafe(resetTenant);
      }
    });
  }

  await client.$executeRawUnsafe(setTenant);
  try {
    return await client.project.count();
  } finally {
    await client.$executeRawUnsafe(resetTenant);
  }
}

export default superAdminRoutes;
