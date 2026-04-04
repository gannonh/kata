import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

function createIsolatedDataDir(): string {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-e2e-'))
  mkdirSync(path.join(dataDir, 'workspace'), { recursive: true })
  return dataDir
}

async function waitForAppReady(window: Page): Promise<void> {
  await window.waitForLoadState('domcontentloaded')
  // Wait for React to mount — #root should have children once the app renders
  await window.waitForFunction(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
    { timeout: 15_000 },
  )
  // Small settle time for React renders to finalize
  await window.waitForTimeout(500)
}

async function dismissOnboardingIfPresent(window: Page): Promise<void> {
  const getStarted = window.getByRole('button', { name: /Get started/i })
  if (!(await getStarted.isVisible({ timeout: 2_000 }).catch(() => false))) {
    return
  }

  // Step 1 → 2: "Get started"
  await getStarted.click()
  await window.waitForTimeout(500)

  // Step 2 → 3: Click a provider card then "Continue"
  // Provider buttons contain provider name + description. Click whichever is first.
  const providerCard = window.getByRole('button', { name: /Anthropic|OpenAI/i }).first()
  if (await providerCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await providerCard.click()
    await window.waitForTimeout(300)
  }

  const continueButton = window.getByRole('button', { name: /Continue/i })
  if (await continueButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await continueButton.click()
    await window.waitForTimeout(500)
  }

  // Step 3 → 4: "Skip for now" (skip API key entry)
  const skipForNow = window.getByRole('button', { name: /Skip for now/i })
  if (await skipForNow.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await skipForNow.click()
    await window.waitForTimeout(500)
  }

  // Step 4 → done: "Start chatting"
  const startChatting = window.getByRole('button', { name: /Start chatting/i })
  if (await startChatting.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await startChatting.click()
    await window.waitForTimeout(500)
  }
}

type DesktopFixtures = {
  electronApp: ElectronApplication
  workspaceDir: string
  mainWindow: Page
  readyWindow: Page
}

export const test = base.extend<DesktopFixtures>({
  workspaceDir: async ({}, use) => {
    const dataDir = createIsolatedDataDir()
    const workspaceDir = path.join(dataDir, 'workspace')
    try {
      await use(workspaceDir)
    } finally {
      try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* noop */ }
    }
  },
  electronApp: async ({ workspaceDir }, use) => {
    const dataDir = path.dirname(workspaceDir)
    const mainEntry = path.join(__dirname, '../../dist/main.cjs')
    const preloadEntry = path.join(__dirname, '../../dist/preload.cjs')

    // The e2e fixture expects build outputs to exist before test launch.
    // Run: bun run build:main && bun run build:preload && bun run build:renderer
    if (!existsSync(mainEntry) || !existsSync(preloadEntry)) {
      throw new Error(
        `Missing build output(s). Expected ${mainEntry} and ${preloadEntry}. ` +
          'Run bun run build:main && bun run build:preload && bun run build:renderer first.',
      )
    }

    const args = [
      mainEntry,
      `--user-data-dir=${dataDir}`,
    ]

    if (isCI) {
      args.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
    }

    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_TEST_MODE: '1',
        KATA_WORKSPACE_PATH: workspaceDir,
        // Don't override HOME — that breaks CLI binary discovery and auth.json lookup.
        // The --user-data-dir flag isolates Electron's own data (localStorage, cookies).
      },
    })

    try {
      await use(app)
    } finally {
      // app.close() can hang for 30s+ waiting for the kata CLI subprocess to shut
      // down gracefully. Race it with a hard kill to keep test runs fast.
      const pid = app.process().pid
      const closePromise = app.close().catch(() => {})
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3_000))
      await Promise.race([closePromise, timeout])
      if (pid) {
        try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
      }
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const existingWindows = electronApp.windows()
    const window = existingWindows.length > 0
      ? existingWindows[0]
      : await electronApp.firstWindow()
    await waitForAppReady(window)
    await use(window)
  },

  /** mainWindow with onboarding auto-dismissed — use for tests that need the chat shell. */
  readyWindow: async ({ electronApp }, use) => {
    const existingWindows = electronApp.windows()
    const window = existingWindows.length > 0
      ? existingWindows[0]
      : await electronApp.firstWindow()
    await waitForAppReady(window)
    await dismissOnboardingIfPresent(window)
    await use(window)
  },
})

export { expect } from '@playwright/test'
