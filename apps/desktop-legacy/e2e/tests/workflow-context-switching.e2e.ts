import { test, expect } from '../fixtures/electron.fixture'

test.describe('Workflow context switching and failure visibility', () => {
  test('auto-enters kanban in execution context and supports manual override', async ({ readyWindow }) => {
    await expect(readyWindow.getByTestId('workflow-kanban-pane')).toBeVisible()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Context: execution')

    await readyWindow.getByRole('button', { name: /Open planning view/i }).click()
    await expect(readyWindow.getByText('Planning View')).toBeVisible()

    await readyWindow.reload()
    await expect(readyWindow.getByText('Planning View')).toBeVisible()

    await readyWindow.getByRole('button', { name: /Close planning view/i }).click()
    await expect(readyWindow.getByTestId('workflow-kanban-pane')).toBeVisible()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Manual override: kanban')

    await readyWindow.getByRole('button', { name: /Return to auto mode/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Auto mode:')
  })

  test('renders deterministic missing-config, auth-failure, empty, stale, and recovery states', async ({ readyWindow }) => {
    const refreshButton = readyWindow.getByRole('button', { name: /Refresh workflow board/i })

    const setScenario = async (scenario: string) => {
      await readyWindow.evaluate(async (nextScenario) => {
        await window.api.workflow.setScope(`scenario:${nextScenario}`)
      }, scenario)
      await refreshButton.click()
    }

    await setScenario('missing-config')
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Workflow board unavailable')
    await expect(readyWindow.getByText(/not configured/i)).toBeVisible()

    await setScenario('auth-failure')
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Workflow board unavailable')
    await expect(readyWindow.getByText(/Invalid Linear API key/i)).toBeVisible()

    await setScenario('empty')
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('No slices found in the active milestone')

    await setScenario('stale')
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Showing stale board snapshot')

    await setScenario('recovery')
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Live data · linear')
  })
})
