import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { HttpProblemError } from '../lib/problem-details';
import {
  applyAutomaticAssignments,
  createMember,
  createMemberFeeAssignment,
  createMembershipFeeTemplate,
  deleteMember,
  deleteMemberFeeAssignment,
  deleteMembershipFeeTemplate,
  getMember,
  getMemberFeeAssignment,
  getMembershipFeeTemplate,
  listMemberFeeAssignments,
  listMembers,
  listMembershipFeeTemplates,
  updateMember,
  updateMemberFeeAssignment,
  updateMembershipFeeTemplate,
} from '../modules/members';
import { listMemberFeeAssignmentsQuerySchema } from '../modules/members/member-fee-assignments';

const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

const memberParamsSchema = organizationParamsSchema.extend({
  memberId: z.string().uuid(),
});

const templateParamsSchema = organizationParamsSchema.extend({
  templateId: z.string().uuid(),
});

const assignmentParamsSchema = organizationParamsSchema.extend({
  assignmentId: z.string().uuid(),
});

const membersRoutes: FastifyPluginAsync = async (fastify) => {
  const requireMembershipRole = fastify.authorizeRoles(
    UserRole.ADMIN,
    UserRole.SECRETARY,
    UserRole.TREASURER
  );

  fastify.get(
    '/orgs/:orgId/members',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const members = await listMembers(request.prisma, orgId);
      return { data: members };
    }
  );

  fastify.post(
    '/orgs/:orgId/members',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const member = await createMember(request.prisma, orgId, request.body);
      reply.status(201).send({ data: member });
    }
  );

  fastify.get(
    '/orgs/:orgId/members/:memberId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, memberId } = memberParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const member = await getMember(request.prisma, orgId, memberId);
      return { data: member };
    }
  );

  fastify.patch(
    '/orgs/:orgId/members/:memberId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, memberId } = memberParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const member = await updateMember(request.prisma, orgId, memberId, request.body);
      return { data: member };
    }
  );

  fastify.delete(
    '/orgs/:orgId/members/:memberId',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId, memberId } = memberParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      await deleteMember(request.prisma, orgId, memberId);
      reply.status(204).send();
    }
  );

  fastify.get(
    '/orgs/:orgId/membership-fee-templates',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const templates = await listMembershipFeeTemplates(request.prisma, orgId);
      return { data: templates };
    }
  );

  fastify.post(
    '/orgs/:orgId/membership-fee-templates',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const template = await createMembershipFeeTemplate(request.prisma, orgId, request.body);
      reply.status(201).send({ data: template });
    }
  );

  fastify.get(
    '/orgs/:orgId/membership-fee-templates/:templateId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, templateId } = templateParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const template = await getMembershipFeeTemplate(request.prisma, orgId, templateId);
      return { data: template };
    }
  );

  fastify.patch(
    '/orgs/:orgId/membership-fee-templates/:templateId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, templateId } = templateParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const template = await updateMembershipFeeTemplate(request.prisma, orgId, templateId, request.body);
      return { data: template };
    }
  );

  fastify.delete(
    '/orgs/:orgId/membership-fee-templates/:templateId',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId, templateId } = templateParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      await deleteMembershipFeeTemplate(request.prisma, orgId, templateId);
      reply.status(204).send();
    }
  );

  fastify.get(
    '/orgs/:orgId/membership-fee-assignments',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const query = listMemberFeeAssignmentsQuerySchema.parse(request.query ?? {});
      const assignments = await listMemberFeeAssignments(request.prisma, orgId, query);
      return { data: assignments };
    }
  );

  fastify.post(
    '/orgs/:orgId/membership-fee-assignments',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const assignment = await createMemberFeeAssignment(request.prisma, orgId, request.body);
      reply.status(201).send({ data: assignment });
    }
  );

  fastify.get(
    '/orgs/:orgId/membership-fee-assignments/:assignmentId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, assignmentId } = assignmentParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const assignment = await getMemberFeeAssignment(request.prisma, orgId, assignmentId);
      return { data: assignment };
    }
  );

  fastify.patch(
    '/orgs/:orgId/membership-fee-assignments/:assignmentId',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId, assignmentId } = assignmentParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const assignment = await updateMemberFeeAssignment(request.prisma, orgId, assignmentId, request.body);
      return { data: assignment };
    }
  );

  fastify.delete(
    '/orgs/:orgId/membership-fee-assignments/:assignmentId',
    { preHandler: requireMembershipRole },
    async (request, reply) => {
      const { orgId, assignmentId } = assignmentParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      await deleteMemberFeeAssignment(request.prisma, orgId, assignmentId);
      reply.status(204).send();
    }
  );

  fastify.post(
    '/orgs/:orgId/membership-fee-assignments/apply',
    { preHandler: requireMembershipRole },
    async (request) => {
      const { orgId } = organizationParamsSchema.parse(request.params);
      ensureOrganizationAccess(request.user?.organizationId, orgId);

      const result = await applyAutomaticAssignments(request.prisma, orgId, request.body);
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

export default membersRoutes;
