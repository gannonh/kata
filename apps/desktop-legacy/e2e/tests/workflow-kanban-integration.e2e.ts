import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '../fixtures/electron.fixture'

function writeGithubWorkflowConfig(
  workspaceDir: string,
  mode: 'labels' | 'projects_v2',
): void {
  const lines =
    mode === 'projects_v2'
      ? [
          '---',
          'tracker:',
          '  kind: github',
          '  repo_owner: kata-sh',
          '  repo_name: kata-mono',
          '  github_project_number: 7',
          '---',
          '',
        ]
      : [
          '---',
          'tracker:',
          '  kind: github',
          '  repo_owner: kata-sh',
          '  repo_name: kata-mono',
          '  label_prefix: symphony',
          '---',
          '',
        ]

  writeFileSync(path.join(workspaceDir, 'WORKFLOW.md'), lines.join('\n'), 'utf8')
}

test.describe('Workflow kanban integration proof', () => {
  test('preserves manual override and recovers stale/error states through refresh path', async ({ readyWindow }) => {
    const refreshButton = readyWindow.getByRole('button', { name: /Refresh workflow board/i })

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Context: execution')

    await readyWindow.getByRole('button', { name: /Open planning view/i }).click()
    await expect(readyWindow.getByText('Planning View')).toBeVisible()

    await readyWindow.reload()
    await expect(readyWindow.getByText('Planning View')).toBeVisible()

    await readyWindow.getByRole('button', { name: /Close planning view/i }).click()
    await readyWindow.getByRole('button', { name: /Return to auto mode/i }).click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Auto mode:')

    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope('scenario:stale')
    })
    await refreshButton.click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Showing stale board snapshot')

    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope('scenario:recovery')
    })
    await refreshButton.click()
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Live data · linear')
  })

  test('switches between github labels and projects_v2 without changing renderer path', async ({
    readyWindow,
    workspaceDir,
  }) => {
    const refreshButton = readyWindow.getByRole('button', { name: /Refresh workflow board/i })

    writeGithubWorkflowConfig(workspaceDir, 'labels')
    await refreshButton.click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText(
      'Live data · github · labels · kata-sh/kata-mono',
    )
    await expect(readyWindow.getByText(/#2249 · \[S02\] GitHub Workflow Board Parity/i)).toBeVisible()

    writeGithubWorkflowConfig(workspaceDir, 'projects_v2')
    await refreshButton.click()

    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText(
      'Live data · github · projects_v2 · kata-sh/kata-mono',
    )
    await expect(readyWindow.getByText(/#2251 · \[S04\] End-to-End Kanban Integration Proof/i)).toBeVisible()
  })
})
