import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IPC_CHANNELS, type McpConfigReadResponse } from '@shared/types'

const handlers = new Map<string, (...args: any[]) => any>()

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

describe('mcp ipc handlers', () => {
  beforeEach(() => {
    handlers.clear()
  })

  test('routes mcp config CRUD handlers through the config bridge', async () => {
    const bridge = createBridgeStub()

    const mcpConfigBridge = {
      listServers: vi.fn(async () => ({
        success: true,
        provenance: {
          mode: 'global_only',
          globalConfigPath: '/tmp/mcp.json',
        },
        servers: [],
      })),
      getServer: vi.fn(async (name: string) => ({
        success: true,
        provenance: {
          mode: 'global_only',
          globalConfigPath: '/tmp/mcp.json',
        },
        server: {
          name,
          transport: 'stdio',
          enabled: true,
          summary: {
            transport: 'stdio',
            command: 'node',
            args: [],
            envKeys: [],
          },
        },
      })),
      saveServer: vi.fn(async (input: unknown) => ({
        success: true,
        provenance: {
          mode: 'global_only',
          globalConfigPath: '/tmp/mcp.json',
        },
        server: input,
      })),
      deleteServer: vi.fn(async (name: string) => ({
        success: true,
        provenance: {
          mode: 'global_only',
          globalConfigPath: '/tmp/mcp.json',
        },
        deletedServerName: name,
      })),
    } as any

    const mcpService = {
      refreshStatus: vi.fn(async () => ({ success: true, status: { serverName: 'local', phase: 'connected', checkedAt: new Date().toISOString(), toolNames: ['read'], toolCount: 1 } })),
      reconnectServer: vi.fn(async () => ({ success: true, status: { serverName: 'local', phase: 'connected', checkedAt: new Date().toISOString(), toolNames: ['read'], toolCount: 1 } })),
      getStabilityMetrics: vi.fn(() => ({
        a11yViolationCounts: { minor: 0, moderate: 0, serious: 0, critical: 0 },
      })),
    } as any

    const unregister = registerSessionIpc({
      bridge,
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
      mcpConfigBridge,
      mcpService,
    })

    await handlers.get(IPC_CHANNELS.mcpListServers)?.({})
    await handlers.get(IPC_CHANNELS.mcpGetServer)?.({}, 'local')
    await handlers.get(IPC_CHANNELS.mcpSaveServer)?.({}, { name: 'local', transport: 'stdio' })
    const deleteResponse = await handlers.get(IPC_CHANNELS.mcpDeleteServer)?.({}, 'local')

    expect(mcpConfigBridge.listServers).toHaveBeenCalledTimes(1)
    expect(mcpConfigBridge.getServer).toHaveBeenCalledWith('local')
    expect(mcpConfigBridge.saveServer).toHaveBeenCalledWith({ name: 'local', transport: 'stdio' })
    expect(deleteResponse.deletedServerName).toBe('local')

    unregister()
  })

  test('routes mcp refresh/reconnect handlers through mcp service', async () => {
    const mcpService = {
      refreshStatus: vi.fn(async () => ({
        success: true,
        status: {
          serverName: 'server-a',
          phase: 'connected',
          checkedAt: new Date().toISOString(),
          toolNames: ['tool-a'],
          toolCount: 1,
        },
      })),
      reconnectServer: vi.fn(async () => ({
        success: false,
        status: {
          serverName: 'server-a',
          phase: 'error',
          checkedAt: new Date().toISOString(),
          toolNames: [],
          toolCount: 0,
          error: {
            code: 'CONNECTION_FAILED',
            message: 'unable to connect',
          },
        },
        error: {
          code: 'CONNECTION_FAILED',
          message: 'unable to connect',
        },
      })),
      getStabilityMetrics: vi.fn(() => ({
        a11yViolationCounts: { minor: 0, moderate: 0, serious: 0, critical: 0 },
      })),
    } as any

    const unregister = registerSessionIpc({
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
      mcpConfigBridge: {
        listServers: vi.fn(async () => ({ success: true, provenance: { mode: 'global_only', globalConfigPath: '/tmp/mcp.json' }, servers: [] })),
        getServer: vi.fn(),
        saveServer: vi.fn(),
        deleteServer: vi.fn(),
      } as any,
      mcpService,
    })

    const refreshResult = await handlers.get(IPC_CHANNELS.mcpRefreshStatus)?.({}, 'server-a')
    const reconnectResult = await handlers.get(IPC_CHANNELS.mcpReconnectServer)?.({}, 'server-a')

    expect(mcpService.refreshStatus).toHaveBeenCalledWith('server-a')
    expect(mcpService.reconnectServer).toHaveBeenCalledWith('server-a')
    expect(refreshResult.success).toBe(true)
    expect(reconnectResult.success).toBe(false)

    unregister()
  })

  test('malformed config error flows through recovery handler with gated action (fix_config succeeds)', async () => {
    // Simulate: config is malformed on first read → listServers returns error
    // Then recovery action fix_config re-reads → succeeds the second time
    let callCount = 0
    const mcpConfigBridge = {
      listServers: vi.fn(async (): Promise<McpConfigReadResponse> => {
        callCount++
        if (callCount === 1) {
          // First call: malformed config
          return {
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
        }
        // Second call (recovery): config is fixed
        return {
          success: true,
          provenance: {
            mode: 'global_only',
            globalConfigPath: '/tmp/mcp.json',
          },
          servers: [],
        }
      }),
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
      mcpConfigBridge,
      mcpService,
    })

    // First: trigger the error by listing servers (populates aggregator with config error signal)
    await handlers.get(IPC_CHANNELS.mcpListServers)?.({})

    // The gated action for a config error should be fix_config, which the handler supports
    const recoveryResult = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'mcp',
      action: 'fix_config',
    })

    // fix_config is a supported action → should succeed (no MCP_RECOVERY_ACTION_UNSUPPORTED)
    expect(recoveryResult.success).toBe(true)
    expect(recoveryResult.code).toBe('MCP_CONFIG_REFRESHED')
    expect(recoveryResult.code).not.toBe('MCP_RECOVERY_ACTION_UNSUPPORTED')

    unregister()
  })

  test('defense-in-depth: reconnect without server context returns graceful failure, not crash', async () => {
    const mcpConfigBridge = {
      listServers: vi.fn(async () => ({
        success: true,
        provenance: { mode: 'global_only', globalConfigPath: '/tmp/mcp.json' },
        servers: [],
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
      mcpConfigBridge,
      mcpService,
    })

    // Bypass gating: directly send 'reconnect' action without server context
    // The handler should return a graceful failure (existing MCP_RECOVERY_ACTION_UNSUPPORTED guard)
    const result = await handlers.get(IPC_CHANNELS.reliabilityRequestRecoveryAction)?.({}, {
      sourceSurface: 'mcp',
      action: 'reconnect',
    })

    expect(result.success).toBe(false)
    expect(result.outcome).toBe('failed')
    expect(result.code).toBe('MCP_RECOVERY_ACTION_UNSUPPORTED')
    // Verify it didn't throw/crash — the result is a structured failure
    expect(result.message).toBeTruthy()

    unregister()
  })
})
