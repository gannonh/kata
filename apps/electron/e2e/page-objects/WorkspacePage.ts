import type { Page, Locator } from '@playwright/test'

/**
 * Page object for workspace management interactions.
 * Handles workspace creation, switching, and configuration.
 *
 * Note: Uses structural selectors since the app doesn't have data-testid
 * attributes yet. These selectors may need updating as the UI evolves.
 */
export class WorkspacePage {
  readonly page: Page
  readonly workspaceSelector: Locator

  constructor(page: Page) {
    this.page = page
    // Workspace selector - look for buttons/elements that might contain workspace name
    // This will need refinement based on actual UI structure
    this.workspaceSelector = page.locator('[class*="workspace"], [class*="Workspace"]').first()
  }

  /**
   * Open the workspace selector dropdown
   */
  async openWorkspaceSelector(): Promise<void> {
    await this.workspaceSelector.click()
  }

  /**
   * Get current workspace name
   */
  async getCurrentWorkspaceName(): Promise<string | null> {
    // Try multiple approaches to find workspace name
    try {
      // Look for the workspace name in the sidebar/header
      const workspaceElement = this.page.locator('[class*="workspace-name"], [class*="WorkspaceName"]').first()
      if (await workspaceElement.isVisible({ timeout: 1000 })) {
        return workspaceElement.textContent()
      }
    } catch {
      // Continue to fallback
    }

    // Fallback: just check if selector has text
    return this.workspaceSelector.textContent()
  }

  /**
   * Wait for workspace to be loaded
   */
  async waitForWorkspaceReady(timeout = 10000): Promise<void> {
    // Wait for the main app container
    await this.page.waitForSelector('[contenteditable="true"]', {
      state: 'visible',
      timeout
    })
  }

  /**
   * Check if settings panel is open
   */
  async isSettingsOpen(): Promise<boolean> {
    const settingsPanel = this.page.locator('[class*="settings"], [class*="Settings"]')
    return settingsPanel.isVisible()
  }
}
