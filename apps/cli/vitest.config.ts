import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.vitest.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      all: false,
      reporter: ['text', 'lcov'],
      exclude: ['src/**/*.test.ts', 'src/**/*.vitest.test.ts', 'src/**/*.d.ts', 'dist/**'],
    },
  },
})
