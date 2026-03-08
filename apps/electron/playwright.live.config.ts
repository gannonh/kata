import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests/live',
  testMatch: '**/*.live.e2e.ts',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  // Live tests share a persistent demo environment and credentials, so keep
  // them serial until the fixture is made parallel-safe.
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
