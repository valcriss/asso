// Global test setup for Vitest
import { config } from '@vue/test-utils';

// Stub RouterLink globally to suppress warnings in unit tests.
config.global.stubs = {
  ...(config.global.stubs || {}),
  RouterLink: { template: '<a><slot /></a>' },
};
