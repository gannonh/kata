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
})
