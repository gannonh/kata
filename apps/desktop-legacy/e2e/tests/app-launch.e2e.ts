import { test, expect } from '../fixtures/electron.fixture'

test.describe('App launch', () => {
  test('launches the Electron process', async ({ electronApp }) => {
    expect(electronApp.process()).not.toBeNull()
  })

  test('opens the main window with a title', async ({ mainWindow }) => {
    await expect(mainWindow).toHaveTitle(/Kata Desktop/i)
  })

  test('renders the root React container', async ({ mainWindow }) => {
    await expect(mainWindow.locator('#root')).toHaveCount(1)
  })

  test('has no critical console errors on startup', async ({ mainWindow }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    mainWindow.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    mainWindow.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await mainWindow.waitForTimeout(1_500)

    const criticalErrors = [...consoleErrors, ...pageErrors].filter((error) => {
      return ![
        'favicon',
        'DevTools',
        'ResizeObserver',
      ].some((allowed) => error.includes(allowed))
    })

    expect(criticalErrors).toEqual([])
  })

  test('uses reasonable viewport dimensions', async ({ mainWindow }) => {
    const dimensions = await mainWindow.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    expect(dimensions.width).toBeGreaterThan(800)
    expect(dimensions.height).toBeGreaterThan(500)
  })

  test('enables context isolation', async ({ mainWindow }) => {
    const isolationState = await mainWindow.evaluate(() => ({
      hasPreloadApi: typeof window.api !== 'undefined',
      requireType: typeof (globalThis as { require?: unknown }).require,
    }))

    expect(isolationState.hasPreloadApi).toBe(true)
    expect(isolationState.requireType).toBe('undefined')
  })

  test('recognizes KATA_TEST_MODE', async ({ electronApp }) => {
    const kataTestMode = await electronApp.evaluate(() => process.env.KATA_TEST_MODE)
    expect(kataTestMode).toBe('1')
  })
})
