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

describe('symphony ipc handlers', () => {
  beforeEach(() => {
    handlers.clear()
  })

  test('routes symphony start/stop/restart through supervisor', async () => {
    const bridge = createBridgeStub()

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
    })

    const startHandler = handlers.get(IPC_CHANNELS.symphonyStart)
    const stopHandler = handlers.get(IPC_CHANNELS.symphonyStop)
    const restartHandler = handlers.get(IPC_CHANNELS.symphonyRestart)

    expect(startHandler).toBeTypeOf('function')
    expect(stopHandler).toBeTypeOf('function')
    expect(restartHandler).toBeTypeOf('function')

    await startHandler?.({})
    await stopHandler?.({})
    await restartHandler?.({})

    expect(supervisor.start).toHaveBeenCalledTimes(1)
    expect(supervisor.stop).toHaveBeenCalledTimes(1)
    expect(supervisor.restart).toHaveBeenCalledTimes(1)

    unregister()
  })
})
