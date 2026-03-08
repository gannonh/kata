import { test, expect } from '../fixtures/orchestration.fixture'

test.describe('Orchestration Session Tree', () => {
  test('projects child transcripts and renders nested child rows', async ({ mainWindow }) => {
    await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="260308-root"]')).toBeVisible()
    await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="260308-child-a"]')).toBeVisible()
    await expect(mainWindow.locator('[data-testid="session-list-item"][data-session-id="260308-child-b"]')).toBeVisible()

    const childRow = mainWindow.locator('[data-testid="session-list-item"][data-session-id="260308-child-a"]')
    await childRow.click()

    await expect(mainWindow.locator('[data-testid="assistant-turn-toggle"]')).toBeVisible()
    await mainWindow.locator('[data-testid="assistant-turn-toggle"]').click()
    await mainWindow.locator('[data-testid="activity-group-row"][data-activity-id="task-a"]').click()

    await expect(mainWindow.locator('[data-testid="activity-row"][data-activity-id="tool-a-terminal"]')).toBeVisible()
    await expect(mainWindow.locator('[data-testid="activity-row"][data-activity-id="tool-a-read"]')).toBeVisible()
    await expect(mainWindow.locator('[data-testid="activity-row"][data-activity-id="tool-b-terminal"]')).toHaveCount(0)

    await mainWindow.locator('[data-testid="activity-row"][data-activity-id="tool-a-terminal"]').click()
    await expect(mainWindow.getByRole('dialog')).toContainText('foobar.txt')
  })
})
