/**
 * E2E-07: Permission mode cycling test
 * Cycles through safe/ask/allow-all modes and verifies UI updates.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { ChatPage } from '../../page-objects/ChatPage'

test.describe('Live Permission Modes', () => {
  test('E2E-07: cycle through permission modes with SHIFT+TAB', async ({ mainWindow }) => {
    const chatPage = new ChatPage(mainWindow)
    await chatPage.waitForReady()

    // Permission mode dropdown has data-tutorial attribute
    const modeBadge = mainWindow.locator('[data-tutorial="permission-mode-dropdown"]')
    await expect(modeBadge).toBeVisible({ timeout: 10000 })

    // Default mode is 'ask' (displays as "Ask to Edit" or similar)
    // The badge contains the mode display name
    const initialText = await modeBadge.textContent()
    expect(initialText).toBeTruthy()

    // Mode cycle order: ask -> allow-all -> safe -> ask
    // Display names: "Ask to Edit" -> "Auto" -> "Explore" -> "Ask to Edit"

    // Cycle 1: ask -> allow-all (Auto)
    await chatPage.cyclePermissionMode()
    await mainWindow.waitForTimeout(300) // Wait for state update
    await expect(modeBadge).toContainText(/Auto|Execute/i, { timeout: 5000 })

    // Cycle 2: allow-all -> safe (Explore)
    await chatPage.cyclePermissionMode()
    await mainWindow.waitForTimeout(300)
    await expect(modeBadge).toContainText(/Explore/i, { timeout: 5000 })

    // Cycle 3: safe -> ask (Ask to Edit)
    await chatPage.cyclePermissionMode()
    await mainWindow.waitForTimeout(300)
    await expect(modeBadge).toContainText(/Ask/i, { timeout: 5000 })
  })
})
