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
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/modules/accounting/views/EntryCreateView.vue',
        'src/modules/accounting/views/OfxImportView.vue',
        'src/modules/auth/**/*.vue',
      ],
      lines: 80,
      functions: 80,
      statements: 80,
      branches: 80,
    },
  },
});
