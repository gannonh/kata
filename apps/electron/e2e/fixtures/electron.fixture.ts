import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

// Create a unique test data directory with minimal config to skip onboarding
function createTestDataDir(): string {
  const testId = `kata-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const testDataDir = path.join(tmpdir(), testId)

  // Create directory structure
  mkdirSync(testDataDir, { recursive: true })
  mkdirSync(path.join(testDataDir, 'workspaces', 'test-workspace'), { recursive: true })

  // Create minimal config.json with a test workspace
  // Note: Main bypass is via KATA_TEST_MODE=1 in IPC handler, but we still provide
  // valid config structure so the app can load workspaces if needed
  const workspaceDir = path.join(testDataDir, 'workspaces', 'test-workspace')
  const config = {
    authType: 'api_key',
    anthropicBaseUrl: 'http://localhost:11434', // Fake URL for keyless provider path
    workspaces: [
      {
        id: 'test-workspace',
        name: 'Test Workspace',
        rootPath: workspaceDir, // Must be rootPath, not path
        createdAt: Date.now(),
      }
    ],
    activeWorkspaceId: 'test-workspace'
  }
  writeFileSync(path.join(testDataDir, 'config.json'), JSON.stringify(config, null, 2))

  return testDataDir
}

// Check if running in CI (Linux headless)
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const testDataDir = createTestDataDir()

    // Base args
    const args = [
      path.join(__dirname, '../../dist/main.cjs'),
      // Use unique user data dir to avoid single-instance lock conflicts
      `--user-data-dir=${testDataDir}`
    ]

    // Add CI-specific flags for Linux headless environment
    if (isCI) {
      args.push(
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      )
    }

    const app = await electron.launch({
      args,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_TEST_MODE: '1',
        // Override config directory for test isolation
        KATA_CONFIG_DIR: testDataDir
      }
    })
    await use(app)
    await app.close()

    // Cleanup test data directory
    try {
      rmSync(testDataDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Wait for splash screen to disappear
    // The splash screen has class containing "z-splash" and opacity animation
    try {
      await window.waitForFunction(() => {
        // Look for any element with z-splash in its class
        const elements = document.querySelectorAll('*')
        for (const el of elements) {
          if (el.className && typeof el.className === 'string' && el.className.includes('z-splash')) {
            const style = getComputedStyle(el)
            // Still visible
            if (style.opacity !== '0' && style.display !== 'none') {
              return false
            }
          }
        }
        return true
      }, { timeout: 30000 })
    } catch {
      // Splash may already be gone or selector changed
    }

    // Extra wait for animations to complete
    await window.waitForTimeout(1000)

    // Handle onboarding if it appears (click through "Get Started" / "Continue" buttons)
    try {
      // Check for welcome/onboarding screens and click through them
      const getStartedButton = window.getByRole('button', { name: /Get Started|Continue/i })
      if (await getStartedButton.isVisible({ timeout: 2000 })) {
        await getStartedButton.click()
        await window.waitForTimeout(500)
      }
    } catch {
      // No onboarding screen, continue
    }

    await use(window)
  }
})

export { expect } from '@playwright/test'
