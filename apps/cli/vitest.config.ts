import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/*.vitest.test.ts',
      'src/resources/extensions/symphony/tests/**/*.test.ts',
    ],
    passWithNoTests: true,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      all: false,
      reporter: ['text', 'lcov'],
      include: [
        'src/resources/extensions/kata/auto-dispatch.ts',
        'src/resources/extensions/kata/prompt-loader.ts',
        'src/resources/extensions/pr-lifecycle/pr-runner.ts',
        'src/resources/extensions/pr-lifecycle/pr-body-composer.ts',
        'src/resources/extensions/search-the-web/provider.ts',
        'src/resources/extensions/search-the-web/tavily.ts',
        'src/resources/extensions/subagent/elapsed.ts',
        'src/resources/extensions/subagent/worker-registry.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.vitest.test.ts', 'src/**/*.d.ts', 'dist/**'],
      thresholds: {
        lines: 55,
        branches: 55,
        functions: 55,
      },
    },
  },
})
