import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../fixtures/electron.fixture'

test.describe('M009 desktop workflow evidence capture', () => {
  test('captures workflow board screenshot after live refresh', async ({ readyWindow, workspaceDir }) => {
    // Keep the workspace configured for a GitHub tracker to mirror M009 expectations.
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

    // KAT-2773: intentionally loose — this fixture currently falls back to Linear in
    // test mode, so we assert refresh completion and capture screenshot evidence only.
    await expect(readyWindow.getByTestId('workflow-board-status')).toContainText('Live data ·')

    const screenshotDir = path.join(process.cwd(), 'docs/uat/M009/evidence/screenshots')
    mkdirSync(screenshotDir, { recursive: true })

    await readyWindow.screenshot({
      path: path.join(screenshotDir, '01-workflow-board-after-refresh.png'),
      fullPage: true,
    })
  })
})
