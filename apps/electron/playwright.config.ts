import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/live/**',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  // Mocked Electron e2e is isolated per test process, so we can run with
  // higher local parallelism and a smaller CI cap to keep resource usage sane.
  workers: process.env.CI ? 2 : 4,
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
