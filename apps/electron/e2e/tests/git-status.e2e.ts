import { test, expect } from '../fixtures/electron.fixture'

/**
 * Tests for Git Status Badge feature.
 *
 * Requirements:
 * - GIT-01: User can see current git branch name in workspace UI
 * - GIT-02: User sees no git indicator when workspace is not a git repository
 * - GIT-03: User can see git status update when switching workspaces
 *
 * Note: GIT-01 and GIT-03 are tested via unit tests in git-service.test.ts
 * since they require complex workspace setup. The E2E test below verifies
 * the UI correctly hides the badge for non-git directories.
 */

test.describe('Git Status Badge', () => {
  test('GIT-02: should not show git badge for non-git directories', async ({ mainWindow }) => {
    // The default test workspace is not a git repo
    // Wait for the app to fully load
    await mainWindow.waitForLoadState('networkidle')

    // Wait a bit for git status to be fetched
    await mainWindow.waitForTimeout(2000)

    // Git badge should not be present (requirement GIT-02)
    const gitBadge = mainWindow.locator('[data-testid="git-branch-badge"]')
    await expect(gitBadge).not.toBeVisible()
  })
})
