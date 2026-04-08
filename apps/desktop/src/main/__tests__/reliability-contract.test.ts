import { describe, expect, test } from 'vitest'
import type {
  BridgeStatusEvent,
  McpServerStatusResponse,
  SymphonyOperatorSnapshot,
  SymphonyRuntimeStatus,
  WorkflowBoardSnapshot,
} from '@shared/types'
import {
  buildReliabilityCode,
  mapChatBridgeStatusToReliability,
  mapChatSubprocessCrashToReliability,
  mapMcpConfigReadResponseToReliability,
  mapMcpStatusResponseToReliability,
  mapSymphonyOperatorSnapshotToReliability,
  mapSymphonyRuntimeStatusToReliability,
  mapWorkflowBoardSnapshotToReliability,
  pickPrimaryReliabilitySignal,
  redactReliabilityText,
} from '../reliability-contract'

describe('reliability-contract', () => {
  test('buildReliabilityCode normalizes deterministic fragments', () => {
    expect(buildReliabilityCode('workflow_board', 'network', 'network timeout')).toBe(
      'REL-WORKFLOW-NETWORK-NETWORK_TIMEOUT',
    )
    expect(buildReliabilityCode('workflow_board', 'network', 'network timeout')).toBe(
      'REL-WORKFLOW-NETWORK-NETWORK_TIMEOUT',
    )
    expect(buildReliabilityCode('mcp', 'config')).toBe('REL-MCP-CONFIG-GENERAL')
  })

  test('redactReliabilityText removes secrets and tokens', () => {
    const raw =
      'Authorization: bearer abcdef12345 api_key=super-secret sk-abc1234567890 token=tok-1234567890'

    expect(redactReliabilityText(raw)).toContain('Authorization: bearer ***')
    expect(redactReliabilityText(raw)).toContain('api_key=***')
    expect(redactReliabilityText(raw)).toContain('sk-abc***')
    expect(redactReliabilityText(raw)).toContain('token=***')

    const shortKeyRedaction = redactReliabilityText('sk-abc123')
    expect(shortKeyRedaction).toContain('***')
    expect(shortKeyRedaction).not.toContain('abc123')

    expect(redactReliabilityText('sk-a')).toBe('sk-a***')
    expect(redactReliabilityText('sk-ab')).toBe('sk-ab***')
  })

  test('maps workflow snapshot errors into canonical reliability signals', () => {
    const snapshot: WorkflowBoardSnapshot = {
      backend: 'linear',
      fetchedAt: '2026-04-07T20:00:00.000Z',
      status: 'stale',
      source: {
        projectId: 'proj-1',
      },
      activeMilestone: null,
      columns: [],
      poll: {
        status: 'error',
        backend: 'linear',
        lastAttemptAt: '2026-04-07T20:00:00.000Z',
        lastSuccessAt: '2026-04-07T19:58:00.000Z',
      },
      lastError: {
        code: 'NETWORK',
        message: 'Network timeout while loading workflow board',
      },
    }

    const signal = mapWorkflowBoardSnapshotToReliability(snapshot)
    expect(signal).toBeTruthy()
    expect(signal?.sourceSurface).toBe('workflow_board')
    expect(signal?.class).toBe('network')
    expect(signal?.recoveryAction).toBe('reconnect')
    expect(signal?.code).toBe('REL-WORKFLOW-NETWORK-NETWORK')
    expect(signal?.lastKnownGoodAt).toBe('2026-04-07T19:58:00.000Z')
  })

  test('maps symphony runtime status into canonical reliability signals', () => {
    const status: SymphonyRuntimeStatus = {
      phase: 'config_error',
      managedProcessRunning: false,
      pid: null,
      url: null,
      diagnostics: {
        stdout: [],
        stderr: [],
      },
      updatedAt: '2026-04-07T20:01:00.000Z',
      restartCount: 0,
      lastError: {
        code: 'WORKFLOW_PATH_MISSING',
        phase: 'config',
        message: 'WORKFLOW.md not found at /tmp/workflow',
      },
    }

    const signal = mapSymphonyRuntimeStatusToReliability(status)
    expect(signal).toBeTruthy()
    expect(signal?.sourceSurface).toBe('symphony')
    expect(signal?.class).toBe('config')
    expect(signal?.recoveryAction).toBe('fix_config')
    expect(signal?.code).toBe('REL-SYMPHONY-CONFIG-WORKFLOW_PATH_MISSING')
  })

  test('maps symphony operator staleness into canonical stale signal', () => {
    const snapshot: SymphonyOperatorSnapshot = {
      fetchedAt: '2026-04-07T20:02:00.000Z',
      queueCount: 0,
      completedCount: 0,
      workers: [],
      escalations: [],
      connection: {
        state: 'connected',
        updatedAt: '2026-04-07T20:02:00.000Z',
        lastBaselineRefreshAt: '2026-04-07T19:59:00.000Z',
      },
      freshness: {
        status: 'stale',
        staleReason: 'No baseline refresh in 180s',
      },
      response: {},
    }

    const signal = mapSymphonyOperatorSnapshotToReliability(snapshot)
    expect(signal).toBeTruthy()
    expect(signal?.class).toBe('stale')
    expect(signal?.recoveryAction).toBe('refresh_state')
    expect(signal?.code).toBe('REL-SYMPHONY-STALE-STALE')
    expect(signal?.staleSince).toBe('2026-04-07T19:59:00.000Z')
  })

  test('maps MCP server status failures to canonical classes', () => {
    const response: McpServerStatusResponse = {
      success: false,
      status: {
        serverName: 'linear',
        phase: 'error',
        checkedAt: '2026-04-07T20:03:00.000Z',
        toolNames: [],
        toolCount: 0,
        error: {
          code: 'MISSING_BEARER_TOKEN',
          message: 'Bearer token missing for linear mcp server',
        },
      },
      error: {
        code: 'MISSING_BEARER_TOKEN',
        message: 'Bearer token missing for linear mcp server',
      },
    }

    const signal = mapMcpStatusResponseToReliability(response)
    expect(signal).toBeTruthy()
    expect(signal?.sourceSurface).toBe('mcp')
    expect(signal?.class).toBe('auth')
    expect(signal?.recoveryAction).toBe('reauthenticate')
    expect(signal?.code).toBe('REL-MCP-AUTH-MISSING_BEARER_TOKEN')
  })

  test('maps chat bridge failures with secret-safe diagnostics', () => {
    const bridgeStatus: BridgeStatusEvent = {
      state: 'crashed',
      pid: 123,
      message: 'Subprocess crashed: api_key=top-secret',
      exitCode: 1,
      signal: null,
      updatedAt: Date.parse('2026-04-07T20:04:00.000Z'),
    }

    const bridgeSignal = mapChatBridgeStatusToReliability(bridgeStatus)
    expect(bridgeSignal).toBeTruthy()
    expect(bridgeSignal?.sourceSurface).toBe('chat_runtime')
    expect(bridgeSignal?.code).toBe('REL-CHAT-PROCESS-EXIT_1')
    expect(bridgeSignal?.message).toContain('api_key=***')

    const crashSignal = mapChatSubprocessCrashToReliability({
      message: 'fatal crash',
      exitCode: null,
      signal: 'SIGKILL',
      stderrLines: [
        'Authorization: bearer super-secret-token',
        'Process exited unexpectedly',
      ],
      timestamp: '2026-04-07T20:05:00.000Z',
    })

    expect(crashSignal.code).toBe('REL-CHAT-PROCESS-SIGNAL_SIGKILL')
    expect(crashSignal.diagnostics?.detail).toContain('bearer ***')
    expect(crashSignal.message).toBe('Process exited unexpectedly')
  })

  test('covers fallback reliability branches for mcp/chat code paths', () => {
    const mcpConfigSignal = mapMcpConfigReadResponseToReliability({
      success: false,
      provenance: {
        mode: 'global_only',
        globalConfigPath: '/tmp/mcp.json',
      },
      servers: [],
      error: {
        code: 'VALIDATION_FAILED',
        message: 'mcp.json config failed schema validation',
      },
    })
    expect(mcpConfigSignal?.class).toBe('config')

    const mcpResponseSignal = mapMcpStatusResponseToReliability({
      success: false,
      error: {
        code: 'UNKNOWN',
        message: 'generic MCP status failure',
      },
    })
    expect(mcpResponseSignal?.code).toBe('REL-MCP-UNKNOWN-UNKNOWN')

    const crashedWithoutExit = mapChatBridgeStatusToReliability({
      state: 'crashed',
      pid: null,
      message: 'network timeout while contacting runtime bridge',
      exitCode: null,
      signal: null,
      updatedAt: Date.parse('2026-04-07T20:06:00.000Z'),
    })
    expect(crashedWithoutExit?.class).toBe('network')
    expect(crashedWithoutExit?.code).toBe('REL-CHAT-NETWORK-CRASHED')

    const crashFallback = mapChatSubprocessCrashToReliability({
      message: 'configuration missing for subprocess runtime',
      exitCode: null,
      signal: null,
      stderrLines: [],
      timestamp: '2026-04-07T20:07:00.000Z',
    })
    expect(crashFallback.class).toBe('config')
  })

  test('pickPrimaryReliabilitySignal selects highest severity then newest timestamp', () => {
    const selected = pickPrimaryReliabilitySignal([
      {
        code: 'REL-MCP-CONFIG-GENERAL',
        class: 'config',
        severity: 'warning',
        sourceSurface: 'mcp',
        recoveryAction: 'fix_config',
        outcome: 'pending',
        message: 'Needs config fix',
        timestamp: '2026-04-07T20:00:00.000Z',
      },
      {
        code: 'REL-CHAT-PROCESS-EXIT_1',
        class: 'process',
        severity: 'critical',
        sourceSurface: 'chat_runtime',
        recoveryAction: 'restart_process',
        outcome: 'failed',
        message: 'Runtime crashed',
        timestamp: '2026-04-07T19:59:00.000Z',
      },
      {
        code: 'REL-WORKFLOW-NETWORK-TIMEOUT',
        class: 'network',
        severity: 'critical',
        sourceSurface: 'workflow_board',
        recoveryAction: 'reconnect',
        outcome: 'failed',
        message: 'Timeout',
        timestamp: '2026-04-07T20:01:00.000Z',
      },
      null,
      undefined,
    ])

    expect(selected?.code).toBe('REL-WORKFLOW-NETWORK-TIMEOUT')
    expect(pickPrimaryReliabilitySignal([null, undefined])).toBeNull()
  })

  test('buildReliabilityCode truncates long source fragments to stable length', () => {
    const code = buildReliabilityCode(
      'symphony',
      'unknown',
      'This message has a lot of punctuation !!! and details that should truncate',
    )

    expect(code).toMatch(/^REL-SYMPHONY-UNKNOWN-/)
    const suffix = code.split('-').slice(3).join('-')
    expect(suffix.length).toBeLessThanOrEqual(32)
  })
})
