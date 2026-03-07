/**
 * Live E2E Test Fixture
 *
 * Uses the demo environment (~/.kata-agents-demo/) with real OAuth credentials
 * from ~/.kata-agents/credentials.enc. No KATA_TEST_MODE -- this exercises
 * the full auth path.
 *
 * The demo directory is NOT cleaned up after tests (persistent across runs).
 * Call `bun run demo:setup` to seed it, or `bun run demo:reset` to recreate.
 */

import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { homedir } from 'os'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Path to demo config directory used for live tests */
export const DEMO_CONFIG_DIR = path.join(homedir(), '.kata-agents-demo')
const PROJECT_ROOT = path.resolve(__dirname, '../../../../')
const CREDENTIALS_PATH = path.join(homedir(), '.kata-agents', 'credentials.enc')

type LiveFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<LiveFixtures>({
  electronApp: async ({}, use) => {
    // Validate credentials exist before launching
    if (!existsSync(CREDENTIALS_PATH)) {
      throw new Error(
        `Live E2E tests require credentials.\n` +
        `Run the app first and authenticate via OAuth to create ~/.kata-agents/credentials.enc`
      )
    }

    // Ensure demo environment exists (no-op if already seeded)
    try {
      execSync('bun run scripts/setup-demo.ts', { cwd: PROJECT_ROOT, stdio: 'pipe' })
      execSync('bash scripts/create-demo-repo.sh', { cwd: PROJECT_ROOT, stdio: 'pipe' })
    } catch (e) {
      const stderr = e instanceof Error && 'stderr' in e ? String((e as any).stderr) : ''
      throw new Error(
        `Demo setup failed. Run manually: bun run demo:reset\n${stderr}`
      )
    }

    const args = [
      path.join(__dirname, '../../dist/main.cjs'),
      `--user-data-dir=${DEMO_CONFIG_DIR}`,
    ]

    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_CONFIG_DIR: DEMO_CONFIG_DIR,
        // No KATA_TEST_MODE -- uses real auth via shared credentials.enc
      },
      timeout: 30_000,
    })

    await use(app)
    await app.close()
    // Demo dir is NOT cleaned up -- persistent across test runs
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Wait for splash screen to disappear (longer timeout for real API)
    try {
      await window.waitForFunction(() => {
        const elements = document.querySelectorAll('*')
        for (const el of elements) {
          if (el.className && typeof el.className === 'string' && el.className.includes('z-splash')) {
            const style = getComputedStyle(el)
            if (style.opacity !== '0' && style.display !== 'none') {
              return false
            }
          }
        }
        return true
      }, { timeout: 60_000 })
    } catch (e) {
      // Splash may already be gone, but log for debugging
      console.log('Splash screen wait skipped:', e instanceof Error ? e.message : 'timeout')
    }

    // Extra settle time for real API initialization
    await window.waitForTimeout(2000)

    await use(window)
  },
})

export { expect } from '@playwright/test'
