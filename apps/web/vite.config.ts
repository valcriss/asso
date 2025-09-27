/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Dev server proxy so that frontend relative calls to /api/... are forwarded
  // to the Fastify backend (default port 3000). This avoids 404 responses from
  // the Vite dev server when the app calls fetch('/api/v1/...'). In production
  // a reverse proxy (nginx, Traefik, etc.) or the same origin build should
  // handle this routing instead.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Do not rewrite the path; backend already expects /api/v1 prefix.
        // If backend port changes, update target or use an env var loader.
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/modules/accounting/views/EntryCreateView.vue',
        'src/modules/accounting/views/OfxImportView.vue',
        'src/modules/auth/**/*.vue',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 78,
      },
    },
  },
});
