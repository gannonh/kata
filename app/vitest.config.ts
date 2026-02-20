import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/preload/**/*.d.ts'],
      perFile: true,
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100
      }
    }
  }
})
