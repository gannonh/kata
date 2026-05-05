import { describe, expect, test, vi } from 'vitest'
import type {
  BridgeStatusEvent,
  McpConfigReadResponse,
  ReliabilitySnapshot,
  SymphonyOperatorSnapshot,
  SymphonyRuntimeStatus,
  WorkflowBoardSnapshot,
} from '@shared/types'
import { RuntimeHealthAggregator } from '../runtime-health-aggregator'

function createWorkflowSnapshot(
  partial: Partial<WorkflowBoardSnapshot> = {},
): WorkflowBoardSnapshot {
  return {
    backend: 'linear',
    fetchedAt: '2026-04-07T20:00:00.000Z',
    status: 'fresh',
    source: {
      projectId: 'proj-1',
    },
    activeMilestone: null,
    columns: [],
    poll: {
      status: 'success',
      backend: 'linear',
      lastAttemptAt: '2026-04-07T20:00:00.000Z',
      lastSuccessAt: '2026-04-07T20:00:00.000Z',
    },
    ...partial,
  }
}

function createSymphonyStatus(partial: Partial<SymphonyRuntimeStatus> = {}): SymphonyRuntimeStatus {
  return {
    phase: 'ready',
    managedProcessRunning: true,
    pid: 42,
    url: 'http://127.0.0.1:8080',
    diagnostics: {
      stdout: [],
      stderr: [],
    },
    updatedAt: '2026-04-07T20:01:00.000Z',
    restartCount: 0,
    ...partial,
  }
}

function createSymphonySnapshot(
  partial: Partial<SymphonyOperatorSnapshot> = {},
): SymphonyOperatorSnapshot {
  return {
    fetchedAt: '2026-04-07T20:01:00.000Z',
    queueCount: 0,
    completedCount: 0,
    workers: [],
    escalations: [],
    connection: {
      state: 'connected',
      updatedAt: '2026-04-07T20:01:00.000Z',
    },
    freshness: {
      status: 'fresh',
    },
    response: {},
    ...partial,
  }
}

function getSurface(snapshot: ReliabilitySnapshot, sourceSurface: string) {
  return snapshot.surfaces.find((surface) => surface.sourceSurface === sourceSurface)
}

function createProviderStatuses(statusByProvider: Partial<Record<string, 'valid' | 'missing' | 'invalid' | 'expired'>> = {}) {
  return {
    anthropic: { provider: 'anthropic' as const, status: statusByProvider.anthropic ?? 'missing', authType: 'api_key' as const },
    openai: { provider: 'openai' as const, status: statusByProvider.openai ?? 'missing', authType: 'api_key' as const },
    google: { provider: 'google' as const, status: statusByProvider.google ?? 'missing', authType: 'api_key' as const },
    mistral: { provider: 'mistral' as const, status: statusByProvider.mistral ?? 'missing', authType: 'api_key' as const },
    bedrock: { provider: 'bedrock' as const, status: statusByProvider.bedrock ?? 'missing', authType: 'api_key' as const },
    azure: { provider: 'azure' as const, status: statusByProvider.azure ?? 'missing', authType: 'api_key' as const },
    'github-copilot': { provider: 'github-copilot' as const, status: statusByProvider['github-copilot'] ?? 'missing', authType: 'oauth' as const },
  }
}

describe('RuntimeHealthAggregator', () => {
  test('starts healthy across all reliability surfaces', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })
    const snapshot = aggregator.getSnapshot()

    expect(snapshot.overallStatus).toBe('healthy')
    expect(snapshot.surfaces).toHaveLength(4)
    for (const surface of snapshot.surfaces) {
      expect(surface.status).toBe('healthy')
      expect(surface.signal).toBeNull()
    }

    const stability = aggregator.getStabilitySnapshot()
    expect(stability.status).toBe('healthy')
    expect(stability.breaches).toHaveLength(0)
    expect(snapshot.firstRunReadiness?.checkpoints.auth.status).toBe('fail')
    expect(snapshot.firstRunReadiness?.checkpoints.startup.status).toBe('fail')
  })

  test('evaluates long-run stability thresholds with deterministic breach mapping', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestStabilityMetrics('chat_runtime', {
      eventLoopLagMs: 220,
      heapGrowthMb: 340,
    })
    aggregator.ingestStabilityMetrics('workflow_board', {
      staleAgeMs: 190_000,
    })
    aggregator.ingestStabilityMetrics('symphony', {
      reconnectSuccessRate: 0.62,
      recoveryLatencyMs: 42_000,
    })
    aggregator.ingestStabilityMetrics('mcp', {
      a11yViolationCounts: {
        serious: 2,
        critical: 1,
      },
    })

    const stability = aggregator.getStabilitySnapshot()

    expect(stability.status).toBe('breached')
    expect(stability.breaches.length).toBeGreaterThanOrEqual(6)

    const eventLoopBreach = stability.breaches.find((breach) => breach.metric === 'eventLoopLagMs')
    expect(eventLoopBreach?.sourceSurface).toBe('chat_runtime')
    expect(eventLoopBreach?.failureClass).toBe('process')
    expect(eventLoopBreach?.recoveryAction).toBe('restart_process')
    expect(eventLoopBreach?.code).toContain('EVENT_LOOP_LAG_MS')

    const reconnectBreach = stability.breaches.find((breach) => breach.metric === 'reconnectSuccessRate')
    expect(reconnectBreach?.sourceSurface).toBe('symphony')
    expect(reconnectBreach?.failureClass).toBe('network')
    expect(reconnectBreach?.recoveryAction).toBe('reconnect')

    expect(stability.breaches.some((breach) => breach.metric === 'a11yViolationCounts')).toBe(true)
  })

  test('clears stability breaches only after metrics recover in-bounds', () => {
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce('2026-04-07T20:00:00.000Z')
      .mockReturnValueOnce('2026-04-07T20:00:05.000Z')
      .mockReturnValueOnce('2026-04-07T20:00:10.000Z')
      .mockReturnValue('2026-04-07T20:00:15.000Z')

    const aggregator = new RuntimeHealthAggregator({ now })

    aggregator.ingestStabilityMetrics('workflow_board', { staleAgeMs: 200_000 })
    expect(aggregator.getStabilitySnapshot().status).toBe('breached')

    aggregator.ingestStabilityMetrics('workflow_board', { staleAgeMs: 20_000 })

    const recovered = aggregator.getStabilitySnapshot()
    expect(recovered.status).toBe('healthy')
    expect(recovered.breaches).toHaveLength(0)
    expect(recovered.lastKnownGoodAt).toBeTruthy()
  })

  test('never reports contradictory healthy stability state when breaches exist', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestStabilityMetrics('chat_runtime', {
      eventLoopLagMs: 300,
    })

    const stability = aggregator.getStabilitySnapshot()
    expect(stability.status).not.toBe('healthy')
    expect(stability.breaches.length).toBeGreaterThan(0)
    expect(stability.status === 'healthy' && stability.breaches.length > 0).toBe(false)
  })

  test('composes first-run readiness checkpoints from auth/model/startup inputs', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestFirstRunAuthState({
      providers: createProviderStatuses({ openai: 'valid' }),
      selectedProvider: 'openai',
    })

    aggregator.ingestFirstRunModelState({
      selectedModel: 'openai/gpt-4.1',
      availableModels: [{ provider: 'openai', id: 'gpt-4.1' }],
      selectedProvider: 'openai',
    })

    aggregator.ingestFirstRunBridgeStatus({
      state: 'running',
      pid: 99,
      updatedAt: Date.parse('2026-04-07T20:00:00.000Z'),
    })

    const readiness = aggregator.getFirstRunReadinessSnapshot()

    expect(readiness.checkpoints.auth.status).toBe('pass')
    expect(readiness.checkpoints.model.status).toBe('pass')
    expect(readiness.checkpoints.startup.status).toBe('pass')
    expect(readiness.checkpoints.first_turn.status).toBe('fail')

    aggregator.ingestFirstTurnCompletion(true)

    expect(aggregator.getFirstRunReadinessSnapshot().checkpoints.first_turn.status).toBe('pass')
  })

  test('keeps first-run readiness blocked when selected model provider is not configured', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestFirstRunAuthState({
      providers: createProviderStatuses({ google: 'valid' }),
      selectedProvider: 'google',
    })

    aggregator.ingestFirstRunModelState({
      selectedModel: 'openai/gpt-4.1',
      availableModels: [{ provider: 'openai', id: 'gpt-4.1' }],
      selectedProvider: 'google',
    })

    const readiness = aggregator.getFirstRunReadinessSnapshot()
    expect(readiness.checkpoints.model.status).toBe('fail')
    expect(readiness.checkpoints.model.failure?.code).toBe('MODEL_PROVIDER_NOT_CONFIGURED')
  })

  test('tracks workflow degradation without dropping last-known-good timestamp', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestWorkflowSnapshot(createWorkflowSnapshot())

    aggregator.ingestWorkflowSnapshot(
      createWorkflowSnapshot({
        status: 'stale',
        poll: {
          status: 'error',
          backend: 'linear',
          lastAttemptAt: '2026-04-07T20:03:00.000Z',
          lastSuccessAt: '2026-04-07T19:58:00.000Z',
        },
        lastError: {
          code: 'NETWORK',
          message: 'Network timeout while refreshing workflow board',
        },
      }),
    )

    const workflowSurface = getSurface(aggregator.getSnapshot(), 'workflow_board')
    expect(workflowSurface?.status).toBe('degraded')
    expect(workflowSurface?.signal?.class).toBe('network')
    expect(workflowSurface?.signal?.lastKnownGoodAt).toBe('2026-04-07T19:58:00.000Z')
    expect(workflowSurface?.signal?.recoveryAction).toBe('reconnect')
  })

  test('prioritizes critical symphony runtime failures over stale operator signals', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestSymphonyOperatorSnapshot(
      createSymphonySnapshot({
        freshness: {
          status: 'stale',
          staleReason: 'No baseline refresh in 120s',
        },
      }),
    )

    aggregator.ingestSymphonyRuntimeStatus(
      createSymphonyStatus({
        phase: 'failed',
        managedProcessRunning: false,
        pid: null,
        url: null,
        lastError: {
          code: 'PROCESS_EXITED',
          phase: 'process',
          message: 'Symphony subprocess exited unexpectedly.',
        },
      }),
    )

    const symphonySurface = getSurface(aggregator.getSnapshot(), 'symphony')
    expect(symphonySurface?.status).toBe('degraded')
    expect(symphonySurface?.signal?.class).toBe('process')
    expect(symphonySurface?.signal?.code).toBe('REL-SYMPHONY-PROCESS-PROCESS_EXITED')
  })

  test('suppresses all reliability signals during normal symphony startup transition', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    // Supervisor reports starting phase
    aggregator.ingestSymphonyRuntimeStatus(
      createSymphonyStatus({
        phase: 'starting',
        managedProcessRunning: false,
        pid: null,
        url: null,
      }),
    )

    // Operator sees reconnecting because Symphony isn't ready yet
    aggregator.ingestSymphonyOperatorSnapshot(
      createSymphonySnapshot({
        connection: {
          state: 'reconnecting',
          lastError: 'Symphony operator is reconnecting.',
          updatedAt: '2026-04-07T20:00:01.000Z',
        },
      }),
    )

    // Normal startup is not a reliability issue — no banner should appear.
    // The header bar already shows "Symphony: Starting".
    const symphonySurface = getSurface(aggregator.getSnapshot(), 'symphony')
    expect(symphonySurface?.status).toBe('healthy')
    expect(symphonySurface?.signal).toBeNull()
  })

  test('suppresses all reliability signals during symphony restart transition', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestSymphonyRuntimeStatus(
      createSymphonyStatus({
        phase: 'restarting',
        managedProcessRunning: false,
        pid: null,
        url: null,
      }),
    )

    aggregator.ingestSymphonyOperatorSnapshot(
      createSymphonySnapshot({
        connection: {
          state: 'reconnecting',
          lastError: 'Symphony operator is reconnecting.',
          updatedAt: '2026-04-07T20:00:01.000Z',
        },
      }),
    )

    const symphonySurface = getSurface(aggregator.getSnapshot(), 'symphony')
    expect(symphonySurface?.status).toBe('healthy')
    expect(symphonySurface?.signal).toBeNull()
  })

  test('suppresses all reliability signals during normal symphony stop transition', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    // Supervisor reports stopping phase (user clicked stop)
    aggregator.ingestSymphonyRuntimeStatus(
      createSymphonyStatus({
        phase: 'stopping',
        managedProcessRunning: true,
        pid: 123,
        url: 'http://localhost:8080',
      }),
    )

    // Operator sees disconnected because Symphony is shutting down
    aggregator.ingestSymphonyOperatorSnapshot(
      createSymphonySnapshot({
        connection: {
          state: 'disconnected',
          lastError: 'Symphony operator is disconnected.',
          updatedAt: '2026-04-07T20:00:01.000Z',
        },
      }),
    )

    // Normal stop is not a reliability issue — no banner should appear.
    // The header bar already shows "Symphony: Stopping".
    const symphonySurface = getSurface(aggregator.getSnapshot(), 'symphony')
    expect(symphonySurface?.status).toBe('healthy')
    expect(symphonySurface?.signal).toBeNull()
  })

  test('supports recovery-action execution and records recovery outcome', async () => {
    const requestRecovery = vi.fn(async () => ({
      success: true,
      outcome: 'succeeded' as const,
      code: 'WORKFLOW_REFRESHED',
      message: 'Workflow board refreshed.',
    }))

    const aggregator = new RuntimeHealthAggregator({
      now: () => '2026-04-07T20:00:00.000Z',
      requestRecovery,
    })

    aggregator.ingestWorkflowSnapshot(
      createWorkflowSnapshot({
        status: 'error',
        lastError: {
          code: 'NOT_CONFIGURED',
          message: 'Workflow board tracker is not configured.',
        },
      }),
    )

    const result = await aggregator.requestRecoveryAction({
      sourceSurface: 'workflow_board',
    })

    expect(result.success).toBe(true)
    expect(result.code).toBe('WORKFLOW_REFRESHED')
    expect(requestRecovery).toHaveBeenCalledWith({
      sourceSurface: 'workflow_board',
      action: 'fix_config',
    })

    const workflowSurface = getSurface(aggregator.getSnapshot(), 'workflow_board')
    expect(workflowSurface?.signal?.outcome).toBe('succeeded')
  })

  test('preserves failed recovery outcome when callback clears the surface signal', async () => {
    let aggregator!: RuntimeHealthAggregator

    const requestRecovery = vi.fn(async () => {
      aggregator.ingestWorkflowSnapshot(createWorkflowSnapshot())
      return {
        success: false,
        outcome: 'failed' as const,
        code: 'WORKFLOW_REFRESH_FAILED',
        message: 'Workflow board is still degraded.',
      }
    })

    aggregator = new RuntimeHealthAggregator({
      now: () => '2026-04-07T20:00:00.000Z',
      requestRecovery,
    })

    aggregator.ingestWorkflowSnapshot(
      createWorkflowSnapshot({
        status: 'error',
        lastError: {
          code: 'NETWORK',
          message: 'Network timeout while refreshing workflow board',
        },
      }),
    )

    const result = await aggregator.requestRecoveryAction({
      sourceSurface: 'workflow_board',
      action: 'reconnect',
    })

    expect(result.success).toBe(false)
    expect(result.outcome).toBe('failed')

    const workflowSurface = getSurface(aggregator.getSnapshot(), 'workflow_board')
    expect(workflowSurface?.status).toBe('degraded')
    expect(workflowSurface?.signal?.outcome).toBe('failed')
    expect(workflowSurface?.signal?.recoveryAction).toBe('reconnect')
  })

  test('maps chat crashes into process reliability signals with redacted diagnostics', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    const status: BridgeStatusEvent = {
      state: 'crashed',
      pid: 7,
      message: 'Subprocess crashed: api_key=secret',
      exitCode: 1,
      signal: null,
      updatedAt: Date.parse('2026-04-07T20:00:00.000Z'),
    }

    aggregator.ingestChatBridgeStatus(status)
    aggregator.ingestChatSubprocessCrash({
      message: 'fatal',
      exitCode: 1,
      signal: null,
      stderrLines: ['Authorization: bearer secret-token', 'Process exited unexpectedly'],
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    const chatSurface = getSurface(aggregator.getSnapshot(), 'chat_runtime')
    expect(chatSurface?.signal?.class).toBe('process')
    expect(chatSurface?.signal?.message).toContain('Process exited unexpectedly')
    expect(chatSurface?.signal?.diagnostics?.detail).toContain('bearer ***')
  })

  test('clears chat crash reliability state once bridge reports running again', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    aggregator.ingestChatSubprocessCrash({
      message: 'fatal',
      exitCode: 137,
      signal: 'SIGKILL',
      stderrLines: ['Process exited unexpectedly'],
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    expect(getSurface(aggregator.getSnapshot(), 'chat_runtime')?.status).toBe('degraded')

    aggregator.ingestChatBridgeStatus({
      state: 'running',
      pid: 42,
      updatedAt: Date.parse('2026-04-07T20:00:02.000Z'),
    })

    const recoveredSurface = getSurface(aggregator.getSnapshot(), 'chat_runtime')
    expect(recoveredSurface?.status).toBe('healthy')
    expect(recoveredSurface?.signal).toBeNull()
  })

  test('tracks MCP config failures and returns to healthy after successful refresh', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' })

    const failedResponse: McpConfigReadResponse = {
      success: false,
      provenance: {
        mode: 'global_only',
        globalConfigPath: '/tmp/mcp.json',
      },
      servers: [],
      error: {
        code: 'MALFORMED_CONFIG',
        message: 'Invalid JSON in mcp.json',
      },
    }

    aggregator.ingestMcpConfigResponse(failedResponse)
    expect(getSurface(aggregator.getSnapshot(), 'mcp')?.status).toBe('degraded')

    aggregator.ingestMcpConfigResponse({
      success: true,
      provenance: {
        mode: 'global_only',
        globalConfigPath: '/tmp/mcp.json',
      },
      servers: [],
    })

    const mcpSurface = getSurface(aggregator.getSnapshot(), 'mcp')
    expect(mcpSurface?.status).toBe('healthy')
    expect(mcpSurface?.signal).toBeNull()
  })

  test('handles listener lifecycle and unknown/internal surface fallbacks safely', () => {
    const aggregator = new RuntimeHealthAggregator({ now: () => '2026-04-07T20:00:00.000Z' }) as any
    const listener = vi.fn()

    aggregator.on('snapshot', listener)
    aggregator.off('snapshot', listener)

    aggregator.updateSurface('not_a_surface', null)
    expect(listener).not.toHaveBeenCalled()

    aggregator.surfaces.delete('mcp')
    const snapshot = aggregator.getSnapshot()
    const mcpSurface = snapshot.surfaces.find((surface: { sourceSurface: string }) => surface.sourceSurface === 'mcp')

    expect(mcpSurface?.status).toBe('healthy')
    expect(mcpSurface?.signal).toBeNull()
  })
})
