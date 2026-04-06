import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/electron.fixture'

async function startMockRuntime(page: Page) {
  await expect(page.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()

  await page.evaluate(async () => {
    await window.api.symphony.start()
  })

  await page.getByRole('button', { name: /Refresh workflow board/i }).click()
}

test.describe('workflow board interaction closure', () => {
  test.use({ symphonyMockMode: 'kanban_assigned' })

  test('supports scope switching, column collapse persistence, inline escalation response, and issue actions', async ({
    readyWindow,
  }) => {
    await startMockRuntime(readyWindow)

    await readyWindow.getByRole('button', { name: /Show Active scope/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Scope: Active')

    await readyWindow.getByRole('button', { name: /Show Project scope/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Scope: Project')

    await readyWindow.getByRole('button', { name: /Show Milestone scope/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Scope: Milestone')

    await readyWindow.getByTestId('kanban-column-toggle-todo').click()
    await expect(readyWindow.getByTestId('kanban-column-hidden-todo')).toContainText('1 hidden')

    await readyWindow.reload()
    await expect(readyWindow.getByTestId('kanban-column-hidden-todo')).toContainText('1 hidden')

    await readyWindow.getByTestId('kanban-expand-all-columns').click()
    await expect(readyWindow.getByTestId('kanban-column-hidden-todo')).toBeHidden()

    await readyWindow.getByTestId('slice-open-issue-KAT-2247').click()
    await expect(readyWindow.getByTestId('slice-issue-action-KAT-2247')).toContainText('Opened KAT-2247 in browser')

    await readyWindow.getByTestId('slice-escalation-toggle-KAT-2247').click()
    await readyWindow.getByTestId('slice-escalation-input-req-123').fill('Proceed with the current milestone scope.')
    await readyWindow.getByTestId('slice-escalation-submit-req-123').click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('0 escalations')
    await expect(readyWindow.getByTestId('slice-escalation-toggle-KAT-2247')).toBeHidden()
  })
})

test.describe('workflow board escalation failure visibility', () => {
  test.use({ symphonyMockMode: 'response_failure' })

  test('surfaces failed inline escalation responses without silent success', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await readyWindow.getByTestId('slice-escalation-toggle-KAT-2247').click()
    await readyWindow.getByTestId('slice-escalation-input-req-123').fill('Try failing this response path.')
    await readyWindow.getByTestId('slice-escalation-submit-req-123').click()

    await expect(readyWindow.getByTestId('slice-escalation-result-KAT-2247')).toContainText('Mocked response failure')
  })
})
