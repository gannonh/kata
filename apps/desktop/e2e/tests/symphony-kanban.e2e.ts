import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/electron.fixture'

async function startMockRuntime(page: Page) {
  await page.evaluate(async () => {
    await window.api.symphony.start()
  })
  await page.getByRole('button', { name: /Refresh workflow board/i }).click()
}

test.describe('Symphony-aware kanban convergence', () => {
  test.use({ symphonyMockMode: 'kanban_assigned' })

  test('projects assignment and escalation metadata onto matching cards', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: live · 2 workers · 1 escalation')
    await expect(readyWindow.getByTestId('slice-symphony-KAT-2247')).toContainText('Execution: edit')
    await expect(readyWindow.getByText('1 escalation')).toBeVisible()

    await readyWindow.getByRole('button', { name: /Show tasks/i }).click()
    await expect(readyWindow.getByText('Worker KAT-2252')).toBeVisible()
  })
})

test.describe('Symphony stale and disconnected degradation', () => {
  test.use({ symphonyMockMode: 'kanban_stale' })

  test('surfaces stale operator context without hiding workflow cards', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: stale')
    await expect(readyWindow.getByTestId('workflow-board-symphony-stale')).toContainText('Snapshot is old.')
    await expect(readyWindow.getByText(/KAT-2247 · \[S01\]/i)).toBeVisible()
  })
})

test.describe('Symphony disconnected projection', () => {
  test.use({ symphonyMockMode: 'kanban_disconnected' })

  test('marks runtime-disconnected state on kanban metadata', async ({ readyWindow }) => {
    await startMockRuntime(readyWindow)

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Symphony: disconnected')
    await expect(readyWindow.getByTestId('slice-symphony-KAT-2247')).toContainText('Symphony runtime disconnected')
    await expect(readyWindow.getByText(/KAT-2247 · \[S01\]/i)).toBeVisible()
  })
})
