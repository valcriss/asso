import fp from 'fastify-plugin';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { HttpProblemError } from '../lib/problem-details';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  isSettled: () => boolean;
};

interface TenantTransactionContext {
  done: Promise<void>;
  settled: boolean;
  commit: () => Promise<void>;
  rollback: (reason?: unknown) => Promise<void>;
}

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  roles: UserRole[];
  isSuperAdmin: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    prisma: PrismaClient | Prisma.TransactionClient;
    user?: AuthenticatedUser;
    tenantTransaction?: TenantTransactionContext;
  }
}

const organizationIdSchema = z.string().uuid();

function createDeferred<T>(): Deferred<T> {
  let resolved = false;
  let rejected = false;
  let resolveFn: (value: T) => void;
  let rejectFn: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  return {
    promise,
    resolve: (value: T) => {
      if (resolved || rejected) {
        return;
      }

      resolved = true;
      resolveFn(value);
    },
    reject: (reason?: unknown) => {
      if (resolved || rejected) {
        return;
      }

      rejected = true;
      rejectFn(reason);
    },
    isSettled: () => resolved || rejected,
  };
}

async function applyTenantContext(client: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const tenantAssignment = Prisma.sql`SET LOCAL app.current_org = ${Prisma.raw(`'${organizationId}'`)}`;
  await client.$executeRaw(tenantAssignment);
}

const prismaPlugin = fp(async (fastify) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  fastify.decorate('prisma', prisma);
  fastify.decorateRequest('prisma', undefined as unknown as PrismaClient | Prisma.TransactionClient);
  fastify.decorateRequest('tenantTransaction', undefined as TenantTransactionContext | undefined);

  fastify.addHook('onRequest', async (request) => {
    request.prisma = prisma;

    const organizationId = request.user?.organizationId;
    const isSuperAdminPath =
      request.user?.isSuperAdmin && typeof request.raw.url === 'string'
        ? request.raw.url.startsWith('/api/v1/super-admin')
        : false;

    if (!organizationId || isSuperAdminPath) {
      return;
    }

    const validatedOrgId = organizationIdSchema.parse(organizationId);

    const organization = await prisma.organization.findUnique({
      where: { id: validatedOrgId },
      select: { accessLockedAt: true },
    });

    if (!organization) {
      throw new HttpProblemError({
        status: 403,
        title: 'FORBIDDEN_ORGANIZATION_ACCESS',
        detail: 'You do not have access to this organization.',
      });
    }

    if (organization.accessLockedAt) {
      throw new HttpProblemError({
        status: 423,
        title: 'ORGANIZATION_LOCKED',
        detail: 'This organization is currently locked by a super-admin.',
      });
    }

    const ready = createDeferred<void>();
    const release = createDeferred<void>();

    const transactionPromise = prisma
      .$transaction(async (tx) => {
        try {
          await applyTenantContext(tx, validatedOrgId);
          request.prisma = tx;
          ready.resolve();
          await release.promise;
        } catch (error) {
          if (!ready.isSettled()) {
            ready.reject(error);
          }

          throw error;
        }
      })
      .catch((error) => {
        request.log.error({ err: error }, 'Tenant transaction failed');
        throw error;
      });

    const context: TenantTransactionContext = {
      done: transactionPromise.then(() => undefined),
      settled: false,
      commit: async () => {
        if (context.settled) {
          return;
        }

        context.settled = true;
        release.resolve();
        await transactionPromise;
      },
      rollback: async (reason?: unknown) => {
        if (context.settled) {
          return;
        }

        context.settled = true;
        release.reject(reason ?? new Error('Tenant transaction aborted'));
        await transactionPromise.catch(() => undefined);
      },
    };

    request.tenantTransaction = context;

    transactionPromise
      .catch(() => undefined)
      .finally(() => {
        if (request.tenantTransaction === context) {
          request.tenantTransaction = undefined;
        }

        request.prisma = prisma;
      });

    await ready.promise;
  });

  fastify.addHook('onRoute', (routeOptions) => {
    const originalHandler = routeOptions.handler;

    if (typeof originalHandler !== 'function') {
      return;
    }

    routeOptions.handler = async function wrappedHandler(request, reply) {
      const result = await originalHandler.call(this, request, reply);

      if (request.tenantTransaction && !request.tenantTransaction.settled) {
        await request.tenantTransaction.commit();
      }

      return result;
    };
  });

  fastify.addHook('onResponse', async (request) => {
    const context = request.tenantTransaction;
    if (!context) {
      return;
    }

    if (!context.settled) {
      try {
        await context.commit();
      } catch (error) {
        request.log.error({ err: error }, 'Failed to commit tenant transaction');
        throw error;
      }
    } else {
      await context.done.catch(() => undefined);
    }
  });

  fastify.addHook('onError', async (request, _reply, error) => {
    const context = request.tenantTransaction;
    if (!context) {
      return;
    }

    await context.rollback(error);
  });

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}, {
  name: 'prisma',
});

export default prismaPlugin;
