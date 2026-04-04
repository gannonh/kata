import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '../fixtures/electron.fixture'

test.describe('Workflow kanban GitHub parity', () => {
  test('renders github labels mode snapshot through the runtime board path', async ({ readyWindow, workspaceDir }) => {
    writeFileSync(
      path.join(workspaceDir, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        '  label_prefix: symphony',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText(
      'Live data · github · labels · kata-sh/kata-mono',
    )
    await expect(readyWindow.getByText(/#2249 · \[S02\] GitHub Workflow Board Parity/i)).toBeVisible()
    await expect(readyWindow.getByText(/#2250 · \[S03\] Workflow Context Switching and Failure Visibility/i)).toBeVisible()
  })

  test('renders github projects v2 mode snapshot through the runtime board path', async ({ readyWindow, workspaceDir }) => {
    writeFileSync(
      path.join(workspaceDir, 'WORKFLOW.md'),
      [
        '---',
        'tracker:',
        '  kind: github',
        '  repo_owner: kata-sh',
        '  repo_name: kata-mono',
        '  github_project_number: 7',
        '---',
        '',
      ].join('\n'),
      'utf8',
    )

    await readyWindow.getByRole('button', { name: /Refresh workflow board/i }).click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText(
      'Live data · github · projects_v2 · kata-sh/kata-mono',
    )
    await expect(readyWindow.getByText(/#2249 · \[S02\] GitHub Workflow Board Parity/i)).toBeVisible()
    await expect(readyWindow.getByText(/#2251 · \[S04\] End-to-End Kanban Integration Proof/i)).toBeVisible()
  })

  test('documents live github smoke path for parity proof', async ({ readyWindow }) => {
    // Manual smoke path:
    // 1. Launch Desktop without KATA_TEST_MODE and open a GitHub-backed workspace (WORKFLOW.md tracker.kind=github).
    // 2. Verify board header badge shows backend `github` and mode (`labels` or `projects_v2`).
    // 3. Confirm cards link to GitHub issues and statuses match either project status field or state labels.
    // 4. Change one issue state in GitHub, click "Refresh workflow board", and verify the card moves columns.
    await expect(readyWindow.getByTestId('workflow-board-status')).toBeVisible()
  })
})
