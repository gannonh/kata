/**
 * E2E-06: Git status badge test
 * Verifies branch badge shows correct branch in demo repo.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { execSync } from 'child_process'
import { homedir } from 'os'
import path from 'path'
import { ensureChatReady } from './helpers'

test.describe('Live Git Status', () => {
  test('E2E-06: git badge shows correct branch in demo repo', async ({ mainWindow }) => {
    await ensureChatReady(mainWindow)

    const gitBadge = mainWindow.locator('[data-testid="git-branch-badge"]')
    await gitBadge.waitFor({ state: 'visible', timeout: 15000 })

    // Get the actual branch from the demo repo
    const demoRepoPath = path.join(homedir(), 'kata-agents-demo-repo')
    const actualBranch = execSync('git branch --show-current', {
      cwd: demoRepoPath,
      encoding: 'utf-8',
    }).trim()

    // Badge should show the actual branch from the demo repo
    await expect(gitBadge).toContainText(actualBranch)
  })
})
