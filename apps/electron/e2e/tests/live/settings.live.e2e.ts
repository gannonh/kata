/**
 * Settings Live E2E Tests
 * Tests app settings, workspace settings, and preferences.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Settings', () => {
  test.setTimeout(60_000)

  test('app settings page loads and displays version', async ({ mainWindow }) => {
    // Navigate to settings via keyboard shortcut
    await mainWindow.keyboard.press('Meta+,')

    // Wait for settings to load
    await mainWindow.waitForTimeout(1000)

    // Verify settings page is visible (look for version info - no "v" prefix)
    const versionText = mainWindow.getByText(/\d+\.\d+\.\d+/)
    await expect(versionText.first()).toBeVisible({ timeout: 5000 })
  })

  test('workspace settings shows model selector', async ({ mainWindow }) => {
    // Navigate to settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for workspace settings section
    const workspaceTab = mainWindow.getByRole('tab', { name: /workspace/i })
    if (await workspaceTab.isVisible()) {
      await workspaceTab.click()
    }

    // Verify model selector exists (Opus/Sonnet/Haiku options)
    const modelSection = mainWindow.getByText(/model/i).first()
    await expect(modelSection).toBeVisible({ timeout: 5000 })
  })

  test('appearance settings accessible', async ({ mainWindow }) => {
    // Navigate to settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Look for appearance tab/section
    const appearanceTab = mainWindow.getByRole('tab', { name: /appearance/i })
    if (await appearanceTab.isVisible()) {
      await appearanceTab.click()

      // Verify theme/appearance controls exist
      const themeSection = mainWindow.getByText(/theme|color|font/i).first()
      await expect(themeSection).toBeVisible({ timeout: 5000 })
    }
  })

  test('settings navigation with escape key', async ({ mainWindow }) => {
    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Click into App settings to go to nested view
    const appSettingsButton = mainWindow.getByRole('button', { name: /App.*Notifications/i })
    await appSettingsButton.click()
    await mainWindow.waitForTimeout(500)

    // Verify we're in App Settings nested page
    await expect(mainWindow.getByRole('heading', { name: 'App Settings', level: 1 })).toBeVisible({ timeout: 3000 })

    // Press escape - should go back to settings navigator (not fully close settings)
    await mainWindow.keyboard.press('Escape')
    await mainWindow.waitForTimeout(500)

    // Verify we went back - App Settings heading should be gone (or we're back at navigator)
    // The settings navigator shows clickable buttons for each settings category
    const appButton = mainWindow.getByRole('button', { name: /App.*Notifications/i })
    await expect(appButton).toBeVisible({ timeout: 5000 })
  })
})
