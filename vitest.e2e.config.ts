import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts', 'tests/e2e/**/*.test.tsx'],
  },
});
