/**
 * Updates Live E2E Tests
 * Tests update checking and notification functionality.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Updates', () => {
  test.setTimeout(60_000)

  test('check for updates button exists in app settings', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for app settings tab (usually first/default)
    const appTab = mainWindow.getByRole('tab', { name: /app|general/i })
    if (await appTab.isVisible({ timeout: 3000 })) {
      await appTab.click()
      await mainWindow.waitForTimeout(500)
    }

    // Look for check for updates button
    const updateButton = mainWindow.getByRole('button', { name: /check for updates|check updates/i })
      .or(mainWindow.getByText(/check for updates/i))

    const hasButton = await updateButton.first().isVisible({ timeout: 5000 }).catch(() => false)

    // Close settings
    await mainWindow.keyboard.press('Escape')

    expect(hasButton).toBeTruthy()
  })

  test('version number is displayed in settings', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for version display (format: v0.0.0 or similar)
    const versionText = mainWindow.getByText(/v\d+\.\d+\.\d+|version/i)

    const hasVersion = await versionText.first().isVisible({ timeout: 5000 }).catch(() => false)

    // Close settings
    await mainWindow.keyboard.press('Escape')

    expect(hasVersion).toBeTruthy()
  })

  test('update check shows result message', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Find and click check for updates button
    const updateButton = mainWindow.getByRole('button', { name: /check for updates/i })
      .or(mainWindow.getByText(/check for updates/i))

    if (await updateButton.first().isVisible({ timeout: 5000 })) {
      await updateButton.first().click()
      await mainWindow.waitForTimeout(3000)

      // Look for result message (up to date or update available)
      const resultMessage = mainWindow.getByText(/up to date|update available|latest version|new version/i)

      const hasResult = await resultMessage.first().isVisible({ timeout: 5000 }).catch(() => false)

      expect(hasResult).toBeTruthy()
    }

    // Close settings
    await mainWindow.keyboard.press('Escape')
  })

  test('notifications toggle exists in app settings', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for notifications toggle
    const notificationsToggle = mainWindow.getByText(/notification/i)
      .or(mainWindow.locator('[class*="notification"]'))

    const hasToggle = await notificationsToggle.first().isVisible({ timeout: 5000 }).catch(() => false)

    // Close settings
    await mainWindow.keyboard.press('Escape')

    expect(hasToggle).toBeTruthy()
  })
})
