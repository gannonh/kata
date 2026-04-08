import { writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type {
  ReliabilityRecoveryResult,
  ReliabilitySignal,
  ReliabilitySourceSurface,
  ReliabilitySurfaceState,
} from '@shared/types'
import {
  expect,
  startMockWorkflowRuntime,
  test,
} from '../fixtures/electron.fixture'

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

interface SurfaceSnapshotView {
  status: ReliabilitySurfaceState['status']
  signal: ReliabilitySignal | null
}

async function readReliabilitySurface(
  page: Page,
  sourceSurface: ReliabilitySourceSurface,
): Promise<SurfaceSnapshotView | null> {
  return page.evaluate(async (surface: ReliabilitySourceSurface) => {
    const response = await window.api.reliability.getStatus()
    const match = response.snapshot.surfaces.find((candidate) => candidate.sourceSurface === surface)

    if (!match) {
      return null
    }

    return {
      status: match.status,
      signal: match.signal,
    }
  }, sourceSurface)
}

async function requestRecovery(
  page: Page,
  sourceSurface: ReliabilitySourceSurface,
): Promise<ReliabilityRecoveryResult> {
  return page.evaluate(async (surface: ReliabilitySourceSurface) => {
    return window.api.reliability.requestRecoveryAction({ sourceSurface: surface })
  }, sourceSurface)
}

test.describe('recovery envelope', () => {
  test.use({
    symphonyMockMode: 'assembled_failure_recovery',
    chatRuntimeFaultMode: 'process_crash_once',
  })

  test('injects cross-boundary failures and preserves truthful recovery state', async ({
    readyWindow,
    mcpConfigPath,
  }) => {
    await startMockWorkflowRuntime(readyWindow)

    // Baseline: ensure workflow is healthy before injecting faults.
    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope('workspace:e2e::session:recovery::scenario:recovery')
      await window.api.workflow.refreshBoard()
    })

    // 1) Workflow backend transient fault (stale + last-known-good retention).
    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope('workspace:e2e::session:recovery::scenario:stale')
      await window.api.workflow.refreshBoard()
    })

    const workflowFault = await readReliabilitySurface(readyWindow, 'workflow_board')
    expect(workflowFault?.status).toBe('degraded')
    expect(workflowFault?.signal?.class).toBe('network')
    expect(workflowFault?.signal?.lastKnownGoodAt).toBeTruthy()

    await readyWindow.evaluate(async () => {
      await window.api.workflow.setScope('workspace:e2e::session:recovery::scenario:recovery')
    })

    const workflowRecovery = await requestRecovery(readyWindow, 'workflow_board')
    expect(workflowRecovery.success).toBe(true)
    expect(workflowRecovery.outcome).toBe('succeeded')

    await expect.poll(async () => (await readReliabilitySurface(readyWindow, 'workflow_board'))?.status).toBe(
      'healthy',
    )

    // 2) Symphony disconnect/restart fault.
    await readyWindow.evaluate(async () => {
      await window.api.symphony.refreshDashboardSnapshot()
    })

    const symphonyFault = await readReliabilitySurface(readyWindow, 'symphony')
    expect(symphonyFault?.status).toBe('degraded')
    expect(symphonyFault?.signal?.class).toBe('network')

    const symphonyRecovery = await requestRecovery(readyWindow, 'symphony')
    expect(symphonyRecovery.success).toBe(true)
    expect(symphonyRecovery.outcome).toBe('succeeded')

    await expect.poll(async () => (await readReliabilitySurface(readyWindow, 'symphony'))?.status).toBe('healthy')

    // 3) Malformed MCP config fault.
    writeFileSync(mcpConfigPath, '{bad-json', 'utf8')

    const mcpFaultResponse = await readyWindow.evaluate(async () => {
      return window.api.mcp.listServers()
    })

    expect(mcpFaultResponse.success).toBe(false)

    const mcpFault = await readReliabilitySurface(readyWindow, 'mcp')
    expect(mcpFault?.status).toBe('degraded')
    expect(mcpFault?.signal?.class).toBe('config')

    writeValidMcpConfig(mcpConfigPath)

    const mcpRecovery = await requestRecovery(readyWindow, 'mcp')
    expect(mcpRecovery.success).toBe(true)
    expect(mcpRecovery.outcome).toBe('succeeded')

    await expect.poll(async () => (await readReliabilitySurface(readyWindow, 'mcp'))?.status).toBe('healthy')

    // 4) Chat subprocess crash fault + recovery.
    await readyWindow.evaluate(async () => {
      await window.api.sendMessage('trigger reliability crash fault')
    })

    await expect.poll(async () => (await readReliabilitySurface(readyWindow, 'chat_runtime'))?.status).toBe(
      'degraded',
    )

    const chatFault = await readReliabilitySurface(readyWindow, 'chat_runtime')
    expect(chatFault?.signal?.class).toBe('process')
    expect(chatFault?.signal?.code).toContain('REL-CHAT-PROCESS')

    const chatRecovery = await requestRecovery(readyWindow, 'chat_runtime')
    expect(chatRecovery.success).toBe(true)
    expect(chatRecovery.outcome).toBe('succeeded')

    await expect.poll(async () => (await readReliabilitySurface(readyWindow, 'chat_runtime'))?.status).toBe(
      'healthy',
    )

    const finalReliability = await readyWindow.evaluate(async () => {
      return window.api.reliability.getStatus()
    })

    expect(finalReliability.snapshot.overallStatus).toBe('healthy')
    expect(finalReliability.snapshot.surfaces.every((surface) => surface.status === 'healthy')).toBe(true)
  })
})
