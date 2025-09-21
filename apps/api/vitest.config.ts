import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    threads: false,
    testTimeout: 60000,
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
    },
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
