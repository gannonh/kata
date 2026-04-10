import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { IPC_CHANNELS, type SymphonyOperatorSnapshot } from '@shared/types'

const handlers = new Map<string, (...args: any[]) => any>()
const originalTestMode = process.env.KATA_TEST_MODE

vi.mock('electron', () => {
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel)
      }),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    },
    shell: {
      openExternal: vi.fn(async () => undefined),
    },
  }
})

import { registerSessionIpc } from '../ipc'

function createBridgeStub() {
  const emitter = new EventEmitter()

  return Object.assign(emitter, {
    getState: vi.fn(() => ({ status: 'running', pid: 1, running: true })),
    getWorkspacePath: vi.fn(() => process.cwd()),
    getStabilityMetrics: vi.fn(() => ({
      eventLoopLagMs: 0,
      heapGrowthMb: 0,
    })),
    prompt: vi.fn(),
    abort: vi.fn(),
    restart: vi.fn(),
    sendExtensionUIResponse: vi.fn(),
    setPermissionMode: vi.fn(),
    getAvailableModels: vi.fn(async () => []),
    setModel: vi.fn(),
    setThinkingLevel: vi.fn(),
    send: vi.fn(async () => ({ data: {} })),
    switchSession: vi.fn(async () => true),
    switchWorkspace: vi.fn(async () => undefined),
  }) as any
}

function createWindowStub() {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(),
    },
  } as any
}

function createSymphonySnapshot(
  partial: Partial<SymphonyOperatorSnapshot> = {},
): SymphonyOperatorSnapshot {
  return {
    fetchedAt: '2026-04-07T21:00:00.000Z',
    queueCount: 0,
    completedCount: 0,
    workers: [],
    escalations: [],
    connection: {
      state: 'connected',
      updatedAt: '2026-04-07T21:00:00.000Z',
    },
    freshness: {
      status: 'fresh',
    },
    response: {},
    ...partial,
  }
}

function createCommonOptions() {
  return {
    bridge: createBridgeStub(),
    authBridge: {
      getProviders: vi.fn(async () => ({ success: true, providers: {} })),
      setProviderKey: vi.fn(),
      removeProviderKey: vi.fn(),
      validateKey: vi.fn(),
    } as any,
    sessionManager: {
      listSessions: vi.fn(async () => ({ sessions: [], warnings: [], directory: process.cwd() })),
      getSessionInfo: vi.fn(),
      resolveSessionPathById: vi.fn(async () => null),
    } as any,
    window: createWindowStub(),
  }
}

describe('reliability recovery IPC handler', () => {
  beforeEach(() => {
    handlers.clear()
    process.env.KATA_TEST_MODE = '1'
  })

  afterEach(() => {
    process.env.KATA_TEST_MODE = originalTestMode
  })

  test('returns failed workflow recovery when board remains stale after refresh', async () => {
    const unregister = registerSessionIpc(createCommonOptions())

    await handlers.get(IPC_CHANNELS.workflowSetScope)?.({}, {
      scopeKey: 'workspace:none::session:none::scenario:stale',
      requestedScope: 'project',
    })

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'workflow_board',
      action: 'refresh_state',
    })

    expect(result.success).toBe(false)
    expect(result.outcome).toBe('failed')
    expect(result.code).toBe('WORKFLOW_REFRESH_UNHEALTHY')
    expect(result.message).toContain('Network error while refreshing workflow board')

    unregister()
  })

  test('returns failed chat runtime recovery when restart does not restore running bridge state', async () => {
    const options = createCommonOptions()
    const bridge = options.bridge

    bridge.restart = vi.fn(async () => undefined)
    bridge.getState = vi.fn(() => ({
      status: 'crashed',
      pid: null,
      running: false,
      message: 'spawn failed',
    }))

    const unregister = registerSessionIpc({
      ...options,
      bridge,
    })

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'chat_runtime',
      action: 'restart_process',
    })

    expect(bridge.restart).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(result.outcome).toBe('failed')
    expect(result.code).toBe('CHAT_RUNTIME_NOT_RUNNING')

    unregister()
  })

  test('uses symphony dashboard reconnect recovery before process restart when reconnect is requested', async () => {
    const supervisor = {
      on: vi.fn(),
      off: vi.fn(),
      getStatus: vi.fn(() => ({
        phase: 'ready',
        managedProcessRunning: true,
        pid: 123,
        url: 'http://127.0.0.1:8080',
        diagnostics: { stdout: [], stderr: [] },
        updatedAt: '2026-04-07T21:00:00.000Z',
        restartCount: 0,
      })),
      restart: vi.fn(async () => ({ success: true })),
      start: vi.fn(async () => ({ success: true })),
      stop: vi.fn(async () => ({ success: true })),
      setWorkspacePath: vi.fn(async () => undefined),
    } as any

    const refreshBaseline = vi.fn(async () =>
      createSymphonySnapshot({
        connection: {
          state: 'connected',
          updatedAt: '2026-04-07T21:02:00.000Z',
        },
        freshness: {
          status: 'fresh',
        },
      }),
    )

    const operatorService = {
      on: vi.fn(),
      off: vi.fn(),
      syncRuntimeStatus: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => createSymphonySnapshot()),
      getStabilityMetrics: vi.fn(() => ({
        reconnectSuccessRate: 1,
        recoveryLatencyMs: 0,
      })),
      refreshBaseline,
      respondToEscalation: vi.fn(),
    } as any

    const unregister = registerSessionIpc({
      ...createCommonOptions(),
      symphonySupervisor: supervisor,
      symphonyOperatorService: operatorService,
    })

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'symphony',
      action: 'reconnect',
    })

    expect(refreshBaseline).toHaveBeenCalledTimes(1)
    expect(supervisor.restart).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.code).toBe('SYMPHONY_DASHBOARD_REFRESHED')

    unregister()
  })

  test('uses supervisor restart for explicit symphony restart_process recovery actions', async () => {
    const supervisor = {
      on: vi.fn(),
      off: vi.fn(),
      getStatus: vi.fn(() => ({
        phase: 'ready',
        managedProcessRunning: true,
        pid: 123,
        url: 'http://127.0.0.1:8080',
        diagnostics: { stdout: [], stderr: [] },
        updatedAt: '2026-04-07T21:00:00.000Z',
        restartCount: 0,
      })),
      restart: vi.fn(async () => ({ success: true, error: null })),
      start: vi.fn(async () => ({ success: true })),
      stop: vi.fn(async () => ({ success: true })),
      setWorkspacePath: vi.fn(async () => undefined),
    } as any

    const refreshBaseline = vi.fn(async () => createSymphonySnapshot())

    const operatorService = {
      on: vi.fn(),
      off: vi.fn(),
      syncRuntimeStatus: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => createSymphonySnapshot()),
      getStabilityMetrics: vi.fn(() => ({
        reconnectSuccessRate: 1,
        recoveryLatencyMs: 0,
      })),
      refreshBaseline,
      respondToEscalation: vi.fn(),
    } as any

    const unregister = registerSessionIpc({
      ...createCommonOptions(),
      symphonySupervisor: supervisor,
      symphonyOperatorService: operatorService,
    })

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'symphony',
      action: 'restart_process',
    })

    expect(supervisor.restart).toHaveBeenCalledTimes(1)
    expect(refreshBaseline).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.code).toBe('SYMPHONY_RESTARTED')

    unregister()
  })

  test('returns unsupported outcome for mcp reconnect action without server-specific context', async () => {
    const unregister = registerSessionIpc(createCommonOptions())

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'mcp',
      action: 'reconnect',
    })

    expect(result.success).toBe(false)
    expect(result.outcome).toBe('failed')
    expect(result.code).toBe('MCP_RECOVERY_ACTION_UNSUPPORTED')

    unregister()
  })

  test('server-scoped MCP error propagates serverName through aggregator to reliability snapshot', async () => {
    const mcpService = {
      refreshStatus: vi.fn(async () => ({
        success: false,
        status: {
          serverName: 'my-failing-server',
          phase: 'error' as const,
          checkedAt: '2026-04-10T12:00:00.000Z',
          toolNames: [],
          toolCount: 0,
          error: {
            code: 'CONNECTION_FAILED' as const,
            message: 'Unable to connect to my-failing-server',
          },
        },
        error: {
          code: 'CONNECTION_FAILED' as const,
          message: 'Unable to connect to my-failing-server',
        },
      })),
      reconnectServer: vi.fn(),
      getStabilityMetrics: vi.fn(() => ({
        a11yViolationCounts: { minor: 0, moderate: 0, serious: 0, critical: 0 },
      })),
    } as any

    const unregister = registerSessionIpc({
      ...createCommonOptions(),
      mcpService,
    })

    // Trigger a server-scoped error through the refresh status handler
    await handlers.get(IPC_CHANNELS.mcpRefreshStatus)?.({}, 'my-failing-server')

    // Verify the reliability snapshot propagates serverName
    const statusResult = await handlers.get(IPC_CHANNELS.reliabilityGetStatus)?.({})
    expect(statusResult.success).toBe(true)

    const mcpSurface = statusResult.snapshot.surfaces.find(
      (s: any) => s.sourceSurface === 'mcp',
    )
    expect(mcpSurface).toBeTruthy()
    expect(mcpSurface?.status).toBe('degraded')
    expect(mcpSurface?.signal).toBeTruthy()
    expect(mcpSurface?.signal?.diagnostics?.serverName).toBe('my-failing-server')
    expect(mcpSurface?.signal?.recoveryAction).toBe('reconnect')

    unregister()
  })

  test('config-read error produces gated fix_config action in reliability snapshot, not reconnect', async () => {
    const mcpConfigBridge = {
      listServers: vi.fn(async () => ({
        success: false,
        provenance: {
          mode: 'global_only' as const,
          globalConfigPath: '/tmp/mcp.json',
        },
        servers: [],
        error: {
          code: 'MALFORMED_CONFIG' as const,
          message: 'Invalid JSON in mcp.json',
        },
      })),
      getServer: vi.fn(),
      saveServer: vi.fn(),
      deleteServer: vi.fn(),
    } as any

    const mcpService = {
      refreshStatus: vi.fn(),
      reconnectServer: vi.fn(),
      getStabilityMetrics: vi.fn(() => ({
        a11yViolationCounts: { minor: 0, moderate: 0, serious: 0, critical: 0 },
      })),
    } as any

    const unregister = registerSessionIpc({
      ...createCommonOptions(),
      mcpConfigBridge,
      mcpService,
    })

    // Trigger config read error
    await handlers.get(IPC_CHANNELS.mcpListServers)?.({})

    // Verify the reliability snapshot has a gated action
    const statusResult = await handlers.get(IPC_CHANNELS.reliabilityGetStatus)?.({})
    const mcpSurface = statusResult.snapshot.surfaces.find(
      (s: any) => s.sourceSurface === 'mcp',
    )
    expect(mcpSurface?.signal).toBeTruthy()
    expect(mcpSurface?.signal?.recoveryAction).toBe('fix_config')
    expect(mcpSurface?.signal?.recoveryAction).not.toBe('reconnect')
    expect(mcpSurface?.signal?.diagnostics?.serverName).toBeUndefined()

    unregister()
  })

  test('redacts thrown recovery errors before returning them over reliability IPC', async () => {
    const mcpConfigBridge = {
      listServers: vi.fn(async () => {
        throw new Error('Authorization: bearer secret-token api_key=secret sk-abc123')
      }),
      getServer: vi.fn(),
      saveServer: vi.fn(),
      deleteServer: vi.fn(),
      getRuntimeServer: vi.fn(),
    } as any

    const unregister = registerSessionIpc({
      ...createCommonOptions(),
      mcpConfigBridge,
    })

    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'mcp',
      action: 'refresh_state',
    })

    expect(result.success).toBe(false)
    expect(result.code).toBe('RECOVERY_ACTION_THROW')
    expect(result.message).toContain('bearer ***')
    expect(result.message).toContain('api_key=***')
    expect(result.message).toContain('sk-abc***')
    expect(result.message).not.toContain('secret-token')
    expect(result.message).not.toContain('abc123')

    unregister()
  })
})
