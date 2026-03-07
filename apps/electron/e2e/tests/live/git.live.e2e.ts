/**
 * E2E-06: Git status badge test
 * Verifies branch badge shows correct branch in demo repo.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { execSync } from 'child_process'
import { homedir } from 'os'
import path from 'path'

test.describe('Live Git Status', () => {
  test('E2E-06: git badge shows correct branch in demo repo', async ({ mainWindow }) => {
    // Wait for app to fully load and git status to be fetched
    await mainWindow.waitForLoadState('networkidle')

    // Additional wait for git status async fetch
    await mainWindow.waitForTimeout(3000)

    // Get the actual branch from the demo repo
    const demoRepoPath = path.join(homedir(), 'kata-agents-demo-repo')
    const actualBranch = execSync('git branch --show-current', {
      cwd: demoRepoPath,
      encoding: 'utf-8',
    }).trim()

    // Git badge should be visible since demo workspace points to a git repo
    const gitBadge = mainWindow.locator('[data-testid="git-branch-badge"]')

    // Git badge should be visible (demo workspace is a git repo)
    await expect(gitBadge).toBeVisible({ timeout: 10000 })

    // Badge should show the actual branch from the demo repo
    // Note: create-demo-repo.sh sets up with 'main' branch by default
    await expect(gitBadge).toContainText(actualBranch)
  })
})
