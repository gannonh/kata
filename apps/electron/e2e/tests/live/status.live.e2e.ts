/**
 * Status Live E2E Tests
 * Tests session status management (todo, in-progress, done, etc.).
 */
import { test, expect } from '../../fixtures/live.fixture'
import { goToAllChats } from './helpers'

test.describe('Live Status', () => {
  test.setTimeout(60_000)

  test('session has status indicator', async ({ mainWindow }) => {
    await goToAllChats(mainWindow)
    await expect(mainWindow.getByLabel('Change todo state').first()).toBeVisible({ timeout: 5000 })
  })

  test('status dropdown shows available statuses', async ({ mainWindow }) => {
    await goToAllChats(mainWindow)

    const sessionItem = mainWindow.locator('[data-testid="session-list-item-button"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 5000 })

    await sessionItem.click({ button: 'right' })
    await expect(mainWindow.getByText(/Todo|Done|Cancelled|Needs Review/i).first()).toBeVisible({ timeout: 5000 })
    await mainWindow.keyboard.press('Escape')
  })

  test('default statuses are available', async ({ mainWindow }) => {
    await expect(mainWindow.getByRole('button', { name: 'Todo' }).first()).toBeVisible({ timeout: 5000 })
    await expect(mainWindow.getByRole('button', { name: 'Done' }).first()).toBeVisible({ timeout: 5000 })
  })
})
