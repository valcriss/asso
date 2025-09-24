import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  exportProjectJustification,
  getProjectVarianceReport,
  projectExportQuerySchema,
  listProjectsQuerySchema,
  projectVarianceQuerySchema,
} from '../modules/projects';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const projectParamsSchema = organizationParamsSchema.extend({
  projectId: z.string().uuid(),
});

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  const requireProjectViewer = fastify.authorizeRoles(
    UserRole.ADMIN,
    UserRole.TREASURER,
    UserRole.SECRETARY,
    UserRole.VIEWER
  );
  const requireProjectManager = fastify.authorizeRoles(UserRole.ADMIN, UserRole.TREASURER);

  fastify.get(
    '/orgs/:orgId/projects',
    { preHandler: requireProjectViewer },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = listProjectsQuerySchema.parse(request.query ?? {});
      const report = await listProjects(request.prisma, orgId, query);

      return {
        data: report.projects,
        totals: report.totals,
      };
    }
  );

  fastify.post(
    '/orgs/:orgId/projects',
    { preHandler: requireProjectManager },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const project = await createProject(request.prisma, orgId, request.body);
      reply.status(201).send({ data: project });
    }
  );

  fastify.get(
    '/orgs/:orgId/projects/:projectId',
    { preHandler: requireProjectViewer },
    async (request) => {
      const { orgId, projectId } = projectParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const project = await getProject(request.prisma, orgId, projectId);
      return { data: project };
    }
  );

  fastify.patch(
    '/orgs/:orgId/projects/:projectId',
    { preHandler: requireProjectManager },
    async (request) => {
      const { orgId, projectId } = projectParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const project = await updateProject(request.prisma, orgId, projectId, request.body);
      return { data: project };
    }
  );

  fastify.delete(
    '/orgs/:orgId/projects/:projectId',
    { preHandler: requireProjectManager },
    async (request, reply) => {
      const { orgId, projectId } = projectParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      await deleteProject(request.prisma, orgId, projectId);
      reply.status(204).send();
    }
  );

  fastify.get(
    '/orgs/:orgId/projects/:projectId/export',
    { preHandler: requireProjectManager },
    async (request, reply) => {
      const { orgId, projectId } = projectParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = projectExportQuerySchema.parse(request.query ?? {});
      const report = await exportProjectJustification(request.prisma, orgId, projectId, query);

      const periodSuffix = report.period ? `-${sanitizeForFilename(report.period.label)}` : '';
      const filename = `project-${sanitizeForFilename(report.project.code)}${periodSuffix}.csv`;

      reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(report.csv);
    }
  );

  fastify.get(
    '/orgs/:orgId/projects/variance',
    { preHandler: requireProjectViewer },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = projectVarianceQuerySchema.parse(request.query ?? {});
      const report = await getProjectVarianceReport(request.prisma, orgId, query);
      return { data: report };
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

function sanitizeForFilename(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'export';
}

export default projectsRoutes;
