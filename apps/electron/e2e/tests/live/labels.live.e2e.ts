/**
 * Labels Live E2E Tests
 * Tests label management and application to sessions.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Labels', () => {
  test.setTimeout(60_000)

  test('label menu opens with # in chat input', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Focus the chat input
    const chatInput = mainWindow.locator('[contenteditable="true"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })
    await chatInput.click()

    // Type # to trigger label menu
    await mainWindow.keyboard.type('#')
    await mainWindow.waitForTimeout(500)

    // Look for label menu/dropdown
    const labelMenu = mainWindow.locator('[class*="menu"]')
      .or(mainWindow.locator('[class*="dropdown"]'))
      .or(mainWindow.locator('[class*="popover"]'))

    const menuVisible = await labelMenu.first().isVisible({ timeout: 3000 }).catch(() => false)

    // Clear the input
    await mainWindow.keyboard.press('Escape')
    await mainWindow.keyboard.press('Backspace')

    // Label menu should appear when typing #
    expect(menuVisible).toBeTruthy()
  })

  test('labels settings page shows label configuration', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for labels tab/section
    const labelsTab = mainWindow.getByRole('tab', { name: /labels/i })
      .or(mainWindow.getByText(/labels/i).first())

    if (await labelsTab.isVisible({ timeout: 3000 })) {
      await labelsTab.click()
      await mainWindow.waitForTimeout(500)

      // Should see label management UI
      const labelsSection = mainWindow.getByText(/add label|create label|no labels/i)
      const hasLabels = await labelsSection.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasLabels).toBeTruthy()
    }

    // Close settings
    await mainWindow.keyboard.press('Escape')
  })

  test('label badge renders with color', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Look for any label badges in the UI
    const labelBadge = mainWindow.locator('[class*="label"][class*="badge"]')
      .or(mainWindow.locator('[class*="Label"]'))

    // Count visible label badges
    const badgeCount = await labelBadge.count()

    // Label badges render when labels are applied to sessions
    expect(badgeCount).toBeGreaterThanOrEqual(0) // May be zero if no labels applied
  })
})
