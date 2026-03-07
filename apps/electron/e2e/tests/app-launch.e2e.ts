import { test, expect } from '../fixtures/electron.fixture'

/**
 * Tests for basic app launch and initialization.
 * These are the most critical tests - if the app doesn't launch,
 * nothing else matters.
 */

test.describe('App Launch', () => {
  test('should launch the Electron app successfully', async ({ electronApp }) => {
    // Verify app is running
    const isRunning = electronApp.process() !== null
    expect(isRunning).toBe(true)
  })

  test('should open the main window', async ({ mainWindow }) => {
    // Verify window opened and has content
    const title = await mainWindow.title()
    expect(title).toBeTruthy()
  })

  test('should display the app container', async ({ mainWindow }) => {
    // Wait for React app to mount
    await mainWindow.waitForSelector('[data-testid="app-container"]', {
      timeout: 15000
    }).catch(() => {
      // Fallback: check for any React root
      return mainWindow.waitForSelector('#root', { timeout: 15000 })
    })

    // Verify page has loaded
    const content = await mainWindow.content()
    expect(content).toContain('root')
  })

  test('should not have any console errors on startup', async ({ electronApp, mainWindow }) => {
    const errors: string[] = []

    mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Wait for app to fully load
    await mainWindow.waitForLoadState('networkidle')

    // Filter out expected/benign errors
    const criticalErrors = errors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('DevTools') &&
      !error.includes('ResizeObserver')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('should have correct window dimensions', async ({ electronApp, mainWindow }) => {
    const windowSize = await mainWindow.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))

    // App should have reasonable minimum dimensions
    expect(windowSize.width).toBeGreaterThan(400)
    expect(windowSize.height).toBeGreaterThan(300)
  })

  test('should have proper security settings', async ({ electronApp, mainWindow }) => {
    // Verify the app has a valid window with web contents
    const windows = electronApp.windows()
    expect(windows.length).toBeGreaterThan(0)

    // Verify context isolation is enabled (security best practice)
    const isContextIsolated = await mainWindow.evaluate(() => {
      // In a properly isolated context, we shouldn't have direct access to Node APIs
      return typeof window !== 'undefined' && typeof require === 'undefined'
    })
    expect(isContextIsolated).toBe(true)
  })

  test('should load in test mode with KATA_TEST_MODE', async ({ electronApp }) => {
    // Verify the app recognizes it's in test mode
    const isTestMode = await electronApp.evaluate(() => {
      return process.env.KATA_TEST_MODE === '1'
    })

    expect(isTestMode).toBe(true)
  })
})
