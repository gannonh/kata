import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/electron.fixture'

async function startMockRuntime(page: Page) {
  await expect(page.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()

  await page.evaluate(async () => {
    await window.api.symphony.start()
  })

  await page.getByRole('button', { name: /Refresh workflow board/i }).click()
}

async function selectMoveOption(page: Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

test.describe('workflow board mutation flows', () => {
  test.use({ symphonyMockMode: 'kanban_assigned' })

  test('proves move success and rollback visibility through the Electron runtime boundary', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await selectMoveOption(readyWindow, 'slice-move-select-KAT-2247', 'Move to In Progress')

    await expect(readyWindow.getByTestId('slice-move-state-KAT-2247')).toContainText('moved to In Progress')
    await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2247')

    await selectMoveOption(readyWindow, 'slice-move-select-KAT-2247', 'Move to Human Review')

    await expect(readyWindow.getByTestId('slice-move-state-KAT-2247')).toContainText('Mocked Linear move failure')
    await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2247')
  })

  test('proves create + edit task flows with persisted board reconciliation', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await readyWindow.getByTestId('slice-add-task-KAT-2247').click()
    await readyWindow.getByTestId('task-mutation-title').fill('Created from board mutation test')
    await readyWindow.getByTestId('task-mutation-description').fill('Created through Electron mutation e2e flow.')
    await readyWindow.getByTestId('task-mutation-submit').click()

    await readyWindow.getByTestId('slice-task-toggle-KAT-2247').click()
    await expect(readyWindow.getByText('Created from board mutation test')).toBeVisible()

    await readyWindow.getByTestId('task-edit-KAT-2252').click()
    await expect(readyWindow.getByTestId('task-mutation-title')).toBeVisible()
    await readyWindow.getByTestId('task-mutation-title').fill('Edited task title from board')

    await readyWindow.locator('#task-mutation-state').click()
    await readyWindow.getByRole('option', { name: 'Agent Review' }).click()
    await readyWindow.getByTestId('task-mutation-submit').click()

    const editedTaskRow = readyWindow.locator('li', { hasText: 'Edited task title from board' })
    await expect(editedTaskRow).toBeVisible()
    await expect(editedTaskRow).toContainText('Agent Review')
  })
})
