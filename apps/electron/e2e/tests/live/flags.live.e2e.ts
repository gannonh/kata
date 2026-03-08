/**
 * Flags Live E2E Tests
 * Tests session flagging functionality.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { goToAllChats, openFlaggedChats } from './helpers'

test.describe('Live Flags', () => {
  test.setTimeout(60_000)

  test('session context menu has flag option', async ({ mainWindow }) => {
    await goToAllChats(mainWindow)
    const sessionItem = mainWindow.locator('[data-testid="session-list-item-button"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 5000 })
    await sessionItem.click({ button: 'right' })
    await expect(mainWindow.getByText(/Flag|Unflag/i).first()).toBeVisible({ timeout: 5000 })
    await mainWindow.keyboard.press('Escape')
  })

  test('flag icon displays for flagged sessions', async ({ mainWindow }) => {
    await openFlaggedChats(mainWindow)
    await expect(mainWindow.locator('[data-testid="session-list-item"]').first()).toBeVisible({ timeout: 5000 })
  })
})
