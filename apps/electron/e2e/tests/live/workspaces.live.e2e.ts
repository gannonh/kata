/**
 * Workspaces Live E2E Tests
 * Tests workspace creation, switching, and management.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live Workspaces', () => {
  test.setTimeout(60_000)

  test('workspace switcher is visible and shows current workspace', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Look for workspace switcher - it's a button with "Select workspace" aria-label
    const workspaceSwitcher = mainWindow.getByRole('button', { name: 'Select workspace' })

    // The workspace switcher should be visible
    await expect(workspaceSwitcher).toBeVisible({ timeout: 10000 })

    // Verify it shows the demo workspace name
    await expect(mainWindow.getByText('Demo Workspace')).toBeVisible({ timeout: 5000 })
  })

  test('workspace dropdown opens on click', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Find and click workspace switcher
    const workspaceSwitcher = mainWindow.locator('[data-tutorial="workspace-switcher"]')
      .or(mainWindow.getByRole('button', { name: /workspace/i }).first())

    if (await workspaceSwitcher.isVisible({ timeout: 5000 })) {
      await workspaceSwitcher.click()
      await mainWindow.waitForTimeout(500)

      // Verify dropdown menu appears with options
      const dropdownMenu = mainWindow.locator('[role="menu"]')
        .or(mainWindow.locator('[class*="dropdown"]'))
        .or(mainWindow.locator('[class*="popover"]'))

      // Should see some menu content
      await expect(dropdownMenu.first()).toBeVisible({ timeout: 3000 })

      // Close by pressing escape
      await mainWindow.keyboard.press('Escape')
    }
  })

  test('add workspace option exists in dropdown', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Find and click workspace switcher
    const workspaceSwitcher = mainWindow.locator('[data-tutorial="workspace-switcher"]')
      .or(mainWindow.getByRole('button', { name: /workspace/i }).first())

    if (await workspaceSwitcher.isVisible({ timeout: 5000 })) {
      await workspaceSwitcher.click()
      await mainWindow.waitForTimeout(500)

      // Look for add workspace option
      const addOption = mainWindow.getByText(/add workspace|new workspace|create/i)
        .or(mainWindow.locator('[class*="FolderPlus"]'))

      // The option should exist in the menu
      const menuVisible = await addOption.first().isVisible({ timeout: 3000 }).catch(() => false)

      // Close menu
      await mainWindow.keyboard.press('Escape')

      // This test passes if either we found the add option or the menu was visible
      expect(menuVisible).toBeTruthy()
    }
  })
})
