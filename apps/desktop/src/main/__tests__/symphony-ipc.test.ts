import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IPC_CHANNELS } from '@shared/types'

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
    shell: {
      openExternal: vi.fn(async () => undefined),
    },
  }
})

import { shell } from 'electron'
import { registerSessionIpc } from '../ipc'

function createBridgeStub() {
  const emitter = new EventEmitter()

  return Object.assign(emitter, {
    getState: vi.fn(() => ({ status: 'running', pid: 1, running: true })),
    getWorkspacePath: vi.fn(() => process.cwd()),
    getKnownSessionIds: vi.fn(() => new Set<string>()),
    trackSessionId: vi.fn(),
    captureCurrentSessionId: vi.fn(async () => null),
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

describe('symphony ipc handlers', () => {
  beforeEach(() => {
    handlers.clear()
  })

  test('routes runtime commands and dashboard methods through symphony services', async () => {
    const bridge = createBridgeStub()
    const dashboardSnapshot = {
      fetchedAt: new Date().toISOString(),
      queueCount: 1,
      completedCount: 2,
      workers: [],
      escalations: [],
      connection: { state: 'connected', updatedAt: new Date().toISOString() },
      freshness: { status: 'fresh' },
      response: {},
    }

    const supervisor = {
      on: vi.fn(),
      off: vi.fn(),
      getStatus: vi.fn(() => ({
        phase: 'idle',
        managedProcessRunning: false,
        pid: null,
        url: null,
        diagnostics: { stdout: [], stderr: [] },
        updatedAt: new Date().toISOString(),
        restartCount: 0,
      })),
      start: vi.fn(async () => ({ success: true, status: { phase: 'starting' } })),
      stop: vi.fn(async () => ({ success: true, status: { phase: 'stopped' } })),
      restart: vi.fn(async () => ({ success: true, status: { phase: 'restarting' } })),
      setWorkspacePath: vi.fn(async () => undefined),
    } as any

    const operatorService = {
      on: vi.fn(),
      off: vi.fn(),
      syncRuntimeStatus: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => dashboardSnapshot),
      refreshBaseline: vi.fn(async () => dashboardSnapshot),
      respondToEscalation: vi.fn(async () => ({ success: true, snapshot: dashboardSnapshot })),
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
      symphonySupervisor: supervisor,
      symphonyOperatorService: operatorService,
    })

    await handlers.get(IPC_CHANNELS.symphonyStart)?.({})
    await handlers.get(IPC_CHANNELS.symphonyStop)?.({})
    await handlers.get(IPC_CHANNELS.symphonyRestart)?.({})

    const getDashboardResponse = await handlers.get(IPC_CHANNELS.symphonyGetDashboard)?.({})
    const refreshDashboardResponse = await handlers.get(IPC_CHANNELS.symphonyRefreshDashboard)?.({})
    const respondResult = await handlers.get(IPC_CHANNELS.symphonyRespondEscalation)?.(
      {},
      'req-1',
      'Proceed',
    )
    const workflowRespondResult = await handlers.get(IPC_CHANNELS.workflowRespondEscalation)?.({}, {
      cardId: 'slice-1',
      requestId: 'req-1',
      responseText: 'Proceed',
    })
    const workflowOpenIssueResult = await handlers.get(IPC_CHANNELS.workflowOpenIssue)?.({}, {
      cardId: 'slice-1',
      url: 'https://linear.app/kata-sh/issue/KAT-2362/s01-kanban-interaction-closure',
      identifier: 'KAT-2362',
    })

    expect(supervisor.start).toHaveBeenCalledTimes(1)
    expect(supervisor.stop).toHaveBeenCalledTimes(1)
    expect(supervisor.restart).toHaveBeenCalledTimes(1)

    expect(getDashboardResponse.snapshot).toEqual(dashboardSnapshot)
    expect(refreshDashboardResponse.snapshot).toEqual(dashboardSnapshot)
    expect(operatorService.refreshBaseline).toHaveBeenCalledTimes(1)
    expect(operatorService.respondToEscalation).toHaveBeenCalledWith('req-1', 'Proceed')
    expect(respondResult.success).toBe(true)
    expect(workflowRespondResult.success).toBe(true)
    expect(workflowRespondResult.code).toBe('SUBMITTED')

    expect((shell.openExternal as any)).toHaveBeenCalledWith(
      'https://linear.app/kata-sh/issue/KAT-2362/s01-kanban-interaction-closure',
    )
    expect(workflowOpenIssueResult.success).toBe(true)
    expect(workflowOpenIssueResult.code).toBe('OPENED')

    unregister()
  })
})
