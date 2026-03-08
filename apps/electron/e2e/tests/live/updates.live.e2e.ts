/**
 * Updates Live E2E Tests
 * Tests update checking and notification functionality.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { openSettingsSubpage } from './helpers'

test.describe('Live Updates', () => {
  test.setTimeout(60_000)

  test('check for updates button exists in app settings', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'app')
    await expect(mainWindow.getByRole('button', { name: 'Check Now' })).toBeVisible({ timeout: 5000 })
  })

  test('version number is displayed in settings', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'app')
    await expect(mainWindow.getByText(/\d+\.\d+\.\d+/).first()).toBeVisible({ timeout: 5000 })
  })

  test('manual update check runs and returns control to the button', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'app')

    const updateButton = mainWindow.getByRole('button', { name: 'Check Now' })
    await expect(updateButton).toBeVisible({ timeout: 5000 })
    await updateButton.click()

    await expect(mainWindow.getByRole('button', { name: /Checking\.\.\./i })).toBeVisible({ timeout: 5000 })
    await expect(mainWindow.getByRole('button', { name: 'Check Now' })).toBeVisible({ timeout: 30000 })
  })

  test('notifications toggle exists in app settings', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'app')
    await expect(mainWindow.getByText(/Desktop notifications/i)).toBeVisible({ timeout: 5000 })
  })
})
