import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/live/**',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron tests must run serially
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
