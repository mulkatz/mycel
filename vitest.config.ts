import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/*/src/**/*.integration.test.ts', 'node_modules'],
  },
});
