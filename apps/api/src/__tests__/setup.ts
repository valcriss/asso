import 'esbuild-register';

import { isHttpProblemError } from '../lib/problem-details';

// Fastify autoload inspects Vitest-specific environment variables to decide
// whether to force ESM dynamic imports. When it detects Vitest it uses native
// `import()` for `.ts` files, which Node cannot handle without a loader.
// Clearing the detection flags lets autoload fall back to the CommonJS
// `require` path, which works together with `esbuild-register`.
delete process.env.VITEST;
delete process.env.VITEST_WORKER_ID;

process.on('unhandledRejection', (reason) => {
  if (isHttpProblemError(reason)) {
    return;
  }

  throw reason;
});
