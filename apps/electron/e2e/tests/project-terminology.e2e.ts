import { test, expect } from '../fixtures/electron.fixture'

/**
 * Verify that "chats/conversations" terminology has been replaced with "projects"
 * across all user-facing UI surfaces.
 */

test.describe('Project Terminology', () => {
  test('sidebar shows "New Project" button', async ({ mainWindow }) => {
    const newProjectButton = mainWindow.locator('[data-tutorial="new-chat-button"]')
    await expect(newProjectButton).toBeVisible({ timeout: 10000 })
    await expect(newProjectButton).toContainText('New Project')
  })

  test('sidebar shows "All Projects" nav item', async ({ mainWindow }) => {
    const nav = mainWindow.getByRole('navigation', { name: 'Main navigation' })
    const allProjects = nav.getByRole('button', { name: /^All Projects\b/i })
    await expect(allProjects).toBeVisible({ timeout: 10000 })
  })

  test('sidebar does not contain old "All Chats" or "New Chat" labels', async ({ mainWindow }) => {
    const nav = mainWindow.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav).toBeVisible({ timeout: 10000 })

    // Verify old labels are gone
    await expect(nav.getByRole('button', { name: /^All Chats\b/i })).toHaveCount(0)
    await expect(mainWindow.locator('[data-tutorial="new-chat-button"]').filter({ hasText: 'New Chat' })).toHaveCount(0)
  })

  test('empty state shows "No projects yet" with "New Project" action', async ({ mainWindow }) => {
    // The mocked fixture creates an empty workspace, so empty state should render
    // in the session list area. Scope to the empty-state container so the test
    // doesn't accidentally pass by matching the always-visible sidebar button.
    const emptyState = mainWindow.locator('[data-slot="empty"]')
    const emptyTitle = emptyState.getByText('No projects yet')
    const newProjectAction = emptyState.getByRole('button', { name: /New Project/i })

    // At least one of these should be visible (session list or main content panel)
    const titleVisible = await emptyTitle.first().isVisible({ timeout: 5000 }).catch(() => false)
    const actionVisible = await newProjectAction.first().isVisible({ timeout: 2000 }).catch(() => false)

    expect(titleVisible || actionVisible).toBe(true)

    // Verify old terminology is absent
    await expect(mainWindow.getByText('No conversations yet')).toHaveCount(0)
    await expect(mainWindow.getByRole('button', { name: /New Conversation/i })).toHaveCount(0)
  })

  test('new session defaults to "New project" title', async ({ mainWindow }) => {
    const newProjectButton = mainWindow.locator('[data-tutorial="new-chat-button"]')
    await expect(newProjectButton).toBeVisible({ timeout: 10000 })
    await newProjectButton.click()

    // After creating a session, the session list should show "New project" as the title
    const sessionItem = mainWindow.locator('[data-testid="session-list-item"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 10000 })
    await expect(sessionItem).toContainText('New project')
  })
})
