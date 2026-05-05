import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/electron.fixture'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MCP_FIXTURE_SCRIPT = path.resolve(__dirname, '../fixtures/mcp-stdio-server.mjs')

function writeMcpConfig(
  mcpConfigPath: string,
  config: {
    mcpServers?: Record<string, Record<string, unknown>>
  },
): void {
  writeFileSync(
    mcpConfigPath,
    `${JSON.stringify(
      {
        imports: [],
        settings: {
          toolPrefix: 'server',
          idleTimeout: 10,
        },
        ...config,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

async function openMcpSettings(window: Page) {
  await window.getByRole('button', { name: /Settings/i }).click()
  await window.getByRole('tab', { name: /^MCP$/i }).click()
  await expect(window.getByTestId('mcp-settings-panel')).toBeVisible()
}

test.describe('MCP settings e2e', () => {
  test('covers empty, malformed, add/edit/delete, and reconnect failure paths', async ({
    readyWindow,
    mcpConfigPath,
  }) => {
    if (existsSync(mcpConfigPath)) {
      rmSync(mcpConfigPath)
    }

    await openMcpSettings(readyWindow)

    await expect(readyWindow.getByTestId('mcp-empty-state')).toBeVisible()
    await expect(readyWindow.getByTestId('mcp-provenance-badge')).toContainText('Global shared config')

    await readyWindow.getByTestId('mcp-add-server').click()
    await readyWindow.getByTestId('mcp-editor-name').fill('fixture-local')
    await readyWindow.getByTestId('mcp-editor-command').fill(process.execPath)
    await readyWindow.getByTestId('mcp-editor-args').fill(MCP_FIXTURE_SCRIPT)
    await readyWindow.getByTestId('mcp-editor-save').click()

    await expect(readyWindow.getByTestId('mcp-server-row-fixture-local')).toBeVisible()

    await readyWindow.getByTestId('mcp-refresh-fixture-local').click()
    await expect(readyWindow.getByTestId('mcp-status-badge-fixture-local')).toContainText('Connected')
    await expect(readyWindow.getByTestId('mcp-tools-fixture-local')).toContainText('echo, ping')

    await readyWindow.getByTestId('mcp-edit-fixture-local').click()
    await readyWindow.getByTestId('mcp-editor-args').fill(`${MCP_FIXTURE_SCRIPT} --alt`)
    await readyWindow.getByTestId('mcp-editor-save').click()

    await readyWindow.getByTestId('mcp-refresh-fixture-local').click()
    await expect(readyWindow.getByTestId('mcp-tools-fixture-local')).toContainText('alt_echo, alt_ping')

    await readyWindow.getByTestId('mcp-edit-fixture-local').click()
    await readyWindow.getByTestId('mcp-editor-command').fill('not-a-real-command-xyz')
    await readyWindow.getByTestId('mcp-editor-save').click()

    await readyWindow.getByTestId('mcp-reconnect-fixture-local').click()
    await expect(readyWindow.getByTestId('mcp-status-badge-fixture-local')).toContainText('COMMAND_NOT_FOUND')

    await readyWindow.getByTestId('mcp-edit-fixture-local').click()
    await readyWindow.getByTestId('mcp-editor-command').fill(process.execPath)
    await readyWindow.getByTestId('mcp-editor-args').fill(MCP_FIXTURE_SCRIPT)
    await readyWindow.getByTestId('mcp-editor-save').click()

    await readyWindow.getByTestId('mcp-delete-fixture-local').click()
    await readyWindow.getByTestId('mcp-confirm-delete-fixture-local').click()
    await expect(readyWindow.getByTestId('mcp-empty-state')).toBeVisible()

    writeFileSync(mcpConfigPath, '{bad-json', 'utf8')
    await readyWindow.getByTestId('mcp-refresh-config').click()
    await expect(readyWindow.getByTestId('mcp-config-error')).toBeVisible()

    writeMcpConfig(mcpConfigPath, { mcpServers: {} })
    await readyWindow.getByTestId('mcp-refresh-config').click()
    await expect(readyWindow.getByTestId('mcp-empty-state')).toBeVisible()
  })
})
