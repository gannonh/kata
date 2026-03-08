/**
 * Settings Live E2E Tests
 * Tests app settings, workspace settings, and preferences.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { openSettingsSubpage } from './helpers'

test.describe('Live Settings', () => {
  test.setTimeout(60_000)

  test('app settings page loads and displays version', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'app')
    await expect(mainWindow.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible({ timeout: 5000 })
  })

  test('workspace settings shows model selector', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'workspace')
    await expect(mainWindow.getByText(/Model/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('appearance settings accessible', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'appearance')
    await expect(mainWindow.getByText(/Theme|font|tool icons/i).first()).toBeVisible({ timeout: 5000 })
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
