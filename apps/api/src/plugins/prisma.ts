import fp from 'fastify-plugin';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

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
  fastify.decorateRequest('prisma', prisma);
  fastify.decorateRequest('tenantTransaction', undefined as TenantTransactionContext | undefined);

  fastify.addHook('onRequest', async (request) => {
    request.prisma = prisma;

    const organizationId = request.user?.organizationId;
    if (!organizationId) {
      return;
    }

    const validatedOrgId = organizationIdSchema.parse(organizationId);

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
