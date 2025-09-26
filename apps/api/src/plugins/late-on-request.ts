import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

type OnRequestHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: unknown) => void
) => void | Promise<void>;

const lateOnRequestPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const lateHooks: OnRequestHook[] = [];
  let ready = false;

  const originalAddHook = fastify.addHook.bind(fastify);

  fastify.addHook('onReady', async () => {
    ready = true;
  });

  fastify.addHook('onRequest', async (request, reply) => {
    for (const hook of lateHooks) {
      // Execute hook supporting both callback and promise styles
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (err?: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        };

        try {
          const result = hook(request, reply, done);
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            (result as Promise<unknown>).then(() => done(), done);
          } else if (hook.length < 3) {
            // Hook without callback argument completed synchronously
            done();
          }
        } catch (error) {
          done(error);
        }
      });
    }
  });

  fastify.addHook = function patchedAddHook(name: string, hook: OnRequestHook) {
    if (name === 'onRequest' && ready) {
      lateHooks.push(hook);
      return this;
    }

    return originalAddHook(name as any, hook as any);
  } as typeof fastify.addHook;
}, { name: 'late-on-request-hook' });

export default lateOnRequestPlugin;
