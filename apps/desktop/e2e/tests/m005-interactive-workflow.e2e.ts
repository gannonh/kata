import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import {
  expect,
  openMcpSettingsFromWorkflow,
  startMockWorkflowRuntime,
  test,
} from '../fixtures/electron.fixture'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MCP_FIXTURE_SCRIPT = path.resolve(__dirname, '../fixtures/mcp-stdio-server.mjs')

function writeValidMcpConfig(mcpConfigPath: string): void {
  writeFileSync(
    mcpConfigPath,
    `${JSON.stringify(
      {
        imports: [],
        settings: {
          toolPrefix: 'server',
          idleTimeout: 10,
        },
        mcpServers: {},
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

async function selectMoveOption(page: Page, triggerTestId: string, optionText: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionText }).click()
}

test.describe('m005 interactive workflow assembly', () => {
  test.describe('healthy assembled flow', () => {
    test.use({ symphonyMockMode: 'assembled_healthy' })

    test('healthy assembled flow keeps workflow and MCP surfaces coherent in one session', async ({
      readyWindow,
    }) => {
      await startMockWorkflowRuntime(readyWindow)

      await selectMoveOption(readyWindow, 'slice-move-select-KAT-2337', 'Move to Agent Review')
      await expect(readyWindow.getByTestId('slice-move-state-KAT-2337')).toContainText('Committed')
      await expect(readyWindow.getByTestId('kanban-column-agent_review')).toContainText('KAT-2337')

      await openMcpSettingsFromWorkflow(readyWindow)

      await readyWindow.getByTestId('mcp-add-server').click()
      await readyWindow.getByTestId('mcp-editor-name').fill('assembled-healthy-fixture')
      await readyWindow.getByTestId('mcp-editor-command').fill(process.execPath)
      await readyWindow.getByTestId('mcp-editor-args').fill(MCP_FIXTURE_SCRIPT)
      await readyWindow.getByTestId('mcp-editor-save').click()

      await expect(readyWindow.getByTestId('mcp-server-row-assembled-healthy-fixture')).toBeVisible()
      await readyWindow.getByTestId('mcp-refresh-assembled-healthy-fixture').click()
      await expect(readyWindow.getByTestId('mcp-status-badge-assembled-healthy-fixture')).toContainText('Connected')

      await readyWindow.getByTestId('settings-return-to-workflow').click()
      await expect(readyWindow.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()
      await expect(readyWindow.getByTestId('kanban-column-agent_review')).toContainText('KAT-2337')
    })
  })

  test.describe('failure-path recovery', () => {
    test.use({ symphonyMockMode: 'assembled_failure_recovery' })

    test('failure-path recovery keeps rollback and MCP errors visible until recovery succeeds', async ({
      readyWindow,
      mcpConfigPath,
    }) => {
      await startMockWorkflowRuntime(readyWindow)

      await selectMoveOption(readyWindow, 'slice-move-select-KAT-2337', 'Move to Human Review')
      await expect(readyWindow.getByTestId('slice-move-state-KAT-2337')).toContainText('Rollback:')
      await expect(readyWindow.getByTestId('slice-move-state-KAT-2337')).toContainText('Mocked Linear move failure')
      await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2337')

      await readyWindow.evaluate(async () => {
        await window.api.symphony.refreshDashboardSnapshot()
      })
      await readyWindow.getByTestId('kanban-refresh-board').click()
      await expect(readyWindow.getByTestId('board-state-notice-symphony-stale')).toBeVisible()

      await readyWindow.evaluate(async () => {
        await window.api.symphony.refreshDashboardSnapshot()
      })
      await readyWindow.getByTestId('kanban-refresh-board').click()
      await expect(readyWindow.getByTestId('board-state-notice-symphony-stale')).toHaveCount(0)

      await openMcpSettingsFromWorkflow(readyWindow)

      writeFileSync(mcpConfigPath, '{bad-json', 'utf8')
      await readyWindow.getByTestId('mcp-refresh-config').click()
      await expect(readyWindow.getByTestId('mcp-config-error')).toBeVisible()
      await expect(readyWindow.getByTestId('mcp-recovery-hint')).toBeVisible()

      writeValidMcpConfig(mcpConfigPath)
      await readyWindow.getByTestId('mcp-refresh-config').click()
      await expect(readyWindow.getByTestId('mcp-empty-state')).toBeVisible()

      await readyWindow.getByTestId('mcp-add-server').click()
      await readyWindow.getByTestId('mcp-editor-name').fill('assembled-recovery-fixture')
      await readyWindow.getByTestId('mcp-editor-command').fill('not-a-real-command-xyz')
      await readyWindow.getByTestId('mcp-editor-args').fill(MCP_FIXTURE_SCRIPT)
      await readyWindow.getByTestId('mcp-editor-save').click()

      await readyWindow.getByTestId('mcp-reconnect-assembled-recovery-fixture').click()
      await expect(readyWindow.getByTestId('mcp-status-badge-assembled-recovery-fixture')).toContainText(
        'COMMAND_NOT_FOUND',
      )
      await expect(readyWindow.getByTestId('mcp-status-error-assembled-recovery-fixture')).toBeVisible()
      await expect(readyWindow.getByTestId('mcp-row-recovery-hint')).toBeVisible()

      await readyWindow.getByTestId('mcp-edit-assembled-recovery-fixture').click()
      await readyWindow.getByTestId('mcp-editor-command').fill(process.execPath)
      await readyWindow.getByTestId('mcp-editor-args').fill(MCP_FIXTURE_SCRIPT)
      await readyWindow.getByTestId('mcp-editor-save').click()

      await readyWindow.getByTestId('mcp-refresh-assembled-recovery-fixture').click()
      await expect(readyWindow.getByTestId('mcp-status-badge-assembled-recovery-fixture')).toContainText('Connected')

      await readyWindow.getByTestId('settings-return-to-workflow').click()
      await expect(readyWindow.getByRole('heading', { name: /Workflow Board/i })).toBeVisible()
      await expect(readyWindow.getByTestId('kanban-column-in_progress')).toContainText('KAT-2337')
    })
  })
})
