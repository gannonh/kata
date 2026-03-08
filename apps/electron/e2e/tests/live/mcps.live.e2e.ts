/**
 * MCPs (Model Context Protocol) Live E2E Tests
 * Tests MCP server configuration and connection status.
 */
import { test, expect } from '../../fixtures/live.fixture'
import { openSourceFilter, openSettingsSubpage } from './helpers'

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
    await openSourceFilter(mainWindow, 'mcps')

    const sourceItems = mainWindow.locator('.source-item')
    await expect(sourceItems.first()).toBeVisible({ timeout: 5000 })
    await expect(sourceItems.first().getByText('MCP', { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('MCP connection status is displayed', async ({ mainWindow }) => {
    await openSourceFilter(mainWindow, 'mcps')

    const firstSource = mainWindow.locator('.source-item').first()
    await expect(firstSource).toBeVisible({ timeout: 5000 })
    await firstSource.click()

    await expect(mainWindow.getByRole('heading', { name: /Filesystem Source/i })).toBeVisible({ timeout: 5000 })
  })

  test('add source button exists', async ({ mainWindow }) => {
    await openSourceFilter(mainWindow, 'mcps')
    await expect(mainWindow.locator('[data-tutorial="add-source-button"]')).toBeVisible({ timeout: 5000 })
  })

  test('local MCP toggle exists in workspace settings', async ({ mainWindow }) => {
    await openSettingsSubpage(mainWindow, 'workspace')
    await expect(mainWindow.getByText(/Local MCP Servers/i)).toBeVisible({ timeout: 5000 })
  })
})
