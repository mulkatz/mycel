import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.integration.test.ts'],
    testTimeout: 30000,
  },
});
