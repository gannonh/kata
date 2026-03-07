/**
 * MCPs (Model Context Protocol) Live E2E Tests
 * Tests MCP server configuration and connection status.
 */
import { test, expect } from '../../fixtures/live.fixture'

test.describe('Live MCPs', () => {
  test.setTimeout(60_000)

  test('sources/MCPs panel is accessible', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')
    await mainWindow.waitForTimeout(2000)

    // Look for sources/MCPs section in sidebar
    const sourcesSection = mainWindow.getByText(/sources|mcp/i)
      .or(mainWindow.locator('[class*="source"]'))

    const hasSources = await sourcesSection.first().isVisible({ timeout: 5000 }).catch(() => false)

    expect(hasSources).toBeTruthy()
  })

  test('MCP sources list shows configured servers', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to sources panel
    const sourcesNav = mainWindow.getByRole('button', { name: /sources/i })
      .or(mainWindow.getByText(/sources/i).first())

    if (await sourcesNav.isVisible({ timeout: 5000 })) {
      await sourcesNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for MCP items or empty state
      const mcpItem = mainWindow.locator('[class*="source"]')
        .or(mainWindow.getByText(/mcp|api|local/i))
      const emptyState = mainWindow.getByText(/no sources|add source/i)

      const hasItems = await mcpItem.first().isVisible({ timeout: 3000 }).catch(() => false)
      const hasEmpty = await emptyState.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasItems || hasEmpty).toBeTruthy()
    }
  })

  test('MCP connection status is displayed', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to sources
    const sourcesNav = mainWindow.getByRole('button', { name: /sources/i })
      .or(mainWindow.getByText(/sources/i).first())

    if (await sourcesNav.isVisible({ timeout: 5000 })) {
      await sourcesNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for connection status indicators
      const statusIndicator = mainWindow.getByText(/connected|disconnected|needs auth|error/i)
        .or(mainWindow.locator('[class*="status"]'))

      const hasStatus = await statusIndicator.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasStatus).toBeTruthy()
    }
  })

  test('add source button exists', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Navigate to sources
    const sourcesNav = mainWindow.getByRole('button', { name: /sources/i })
      .or(mainWindow.getByText(/sources/i).first())

    if (await sourcesNav.isVisible({ timeout: 5000 })) {
      await sourcesNav.click()
      await mainWindow.waitForTimeout(1000)

      // Look for add source button
      const addButton = mainWindow.getByRole('button', { name: /add source/i })
        .or(mainWindow.getByText(/add source/i))
        .or(mainWindow.locator('[class*="Plus"]'))

      const hasAdd = await addButton.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasAdd).toBeTruthy()
    }
  })

  test('local MCP toggle exists in workspace settings', async ({ mainWindow }) => {
    await mainWindow.waitForLoadState('networkidle')

    // Open settings
    await mainWindow.keyboard.press('Meta+,')
    await mainWindow.waitForTimeout(1000)

    // Navigate to workspace settings
    const workspaceTab = mainWindow.getByRole('tab', { name: /workspace/i })
    if (await workspaceTab.isVisible({ timeout: 3000 })) {
      await workspaceTab.click()
      await mainWindow.waitForTimeout(500)

      // Look for local MCP toggle in advanced section
      const mcpToggle = mainWindow.getByText(/local mcp/i)
        .or(mainWindow.getByText(/mcp servers/i))

      const hasToggle = await mcpToggle.first().isVisible({ timeout: 3000 }).catch(() => false)

      expect(hasToggle).toBeTruthy()
    }

    // Close settings
    await mainWindow.keyboard.press('Escape')
  })
})
