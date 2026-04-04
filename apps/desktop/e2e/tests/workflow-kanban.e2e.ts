import { test, expect } from '../fixtures/electron.fixture'

test.describe('Workflow kanban board', () => {
  test('renders canonical columns and allows expanding tasks', async ({ readyWindow }) => {
    // Test seam: in KATA_TEST_MODE, WorkflowBoardService serves a deterministic board fixture
    await expect(readyWindow.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Backlog' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Todo' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'In Progress' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Agent Review' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Human Review' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Merging' })).toBeVisible()
    await expect(readyWindow.getByRole('heading', { name: 'Done' })).toBeVisible()

    const sliceTitle = readyWindow.getByText(/KAT-2247 · \[S01\] Linear Workflow Board in the Right Pane/i)
    await expect(sliceTitle).toBeVisible()

    await readyWindow.getByRole('button', { name: /Show tasks/i }).click()

    await expect(readyWindow.getByText(/KAT-2251 · \[T01\] Define canonical workflow snapshot contract/i)).toBeVisible()
    await expect(readyWindow.getByText(/KAT-2252 · \[T02\] Wire workflow board service through IPC/i)).toBeVisible()
  })

  test('documents live Linear smoke path for manual integration proof', async ({ readyWindow }) => {
    // Manual smoke path:
    // 1. Run desktop dev app without KATA_TEST_MODE and with a Linear-backed workspace.
    // 2. Confirm right pane header shows the active milestone name and "Live data · linear" status.
    // 3. Expand at least one slice card and verify child tasks match live Linear statuses.
    // 4. Move one task in Linear, click "Refresh workflow board", and verify UI status updates.
    await expect(readyWindow.getByTestId('workflow-board-status')).toBeVisible()
  })
})
