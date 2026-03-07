/**
 * Status Live E2E Tests
 * Tests session status management (todo, in-progress, done, etc.).
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Status', () => {
  test.setTimeout(60_000)

  test('session has status indicator', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Look for status indicators in the session list or current session
    const statusIndicator = mainWindow.locator('[class*="status"]')
      .or(mainWindow.locator('[class*="Status"]'))

    // There should be some status-related elements
    const statusCount = await statusIndicator.count()

    // Sessions should have status-related elements
    expect(statusCount).toBeGreaterThan(0)
  })

  test('status dropdown shows available statuses', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Find a session item and look for status selector
    const sessionItem = mainWindow.locator('[class*="session"]').first()

    if (await sessionItem.isVisible({ timeout: 5000 })) {
      // Right-click for context menu
      await sessionItem.click({ button: 'right' })
      await mainWindow.waitForTimeout(500)

      // Look for status options in menu
      const statusOptions = mainWindow.getByText(/todo|in.progress|done|cancelled|needs.review/i)

      const hasStatus = await statusOptions.first().isVisible({ timeout: 3000 }).catch(() => false)

      // Close menu
      await mainWindow.keyboard.press('Escape')

      // Document whether status options are in context menu
      expect(hasStatus).toBeTruthy()
    }
  })

  test('default statuses are available', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Navigate to settings to check status configuration
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for statuses section in settings
    const statusesSection = mainWindow.getByText(/statuses/i)

    if (await statusesSection.isVisible({ timeout: 3000 })) {
      // Should see default statuses listed
      const todoStatus = mainWindow.getByText(/todo/i)
      const doneStatus = mainWindow.getByText(/done/i)

      const hasTodo = await todoStatus.isVisible({ timeout: 2000 }).catch(() => false)
      const hasDone = await doneStatus.isVisible({ timeout: 2000 }).catch(() => false)

      expect(hasTodo || hasDone).toBeTruthy()
    }

    // Close settings
    await mainWindow.keyboard.press('Escape')
  })
})
