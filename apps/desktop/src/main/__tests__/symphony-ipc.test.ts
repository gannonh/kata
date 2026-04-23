import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
    getStabilityMetrics: vi.fn(() => ({
      eventLoopLagMs: 0,
      heapGrowthMb: 0,
      collectedAt: new Date().toISOString(),
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
      getStabilityMetrics: vi.fn(() => ({
        reconnectSuccessRate: 1,
        recoveryLatencyMs: 0,
        collectedAt: new Date().toISOString(),
      })),
      refreshBaseline: vi.fn(async () => dashboardSnapshot),
      respondToEscalation: vi.fn(async () => ({ success: true, snapshot: dashboardSnapshot })),
    } as any

    const agentActivitySnapshot = {
      generatedAt: new Date().toISOString(),
      events: [],
      verbose: [],
      pinnedEvents: [
        {
          eventId: 'evt-1',
          pinnedAt: new Date().toISOString(),
          automatic: true,
          timestamp: new Date().toISOString(),
          source: 'system',
          kind: 'system.error',
          message: 'Symphony service unavailable.',
          severity: 'error',
        },
      ],
    }

    const agentActivityJournal = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn(() => agentActivitySnapshot),
      setPinnedEvent: vi.fn((eventId: string, pinned: boolean) => ({
        ...agentActivitySnapshot,
        pinnedEvents: pinned
          ? agentActivitySnapshot.pinnedEvents
          : agentActivitySnapshot.pinnedEvents.filter((event) => event.eventId !== eventId),
      })),
      ingestRuntimeStatus: vi.fn(),
      ingestOperatorSnapshot: vi.fn(),
      ingestEscalationResponse: vi.fn(),
      ingestCliChatEvent: vi.fn(),
      recordSystemError: vi.fn(),
    }) as any
    const windowStub = createWindowStub()

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
      window: windowStub,
      symphonySupervisor: supervisor,
      symphonyOperatorService: operatorService,
      agentActivityJournal,
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
    const agentActivityResponse = await handlers.get(IPC_CHANNELS.agentActivityGetSnapshot)?.({})
    const setPinnedResponse = await handlers.get(IPC_CHANNELS.agentActivitySetPinnedEvent)?.(
      {},
      'evt-1',
      false,
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
    expect(agentActivityResponse.success).toBe(true)
    expect(agentActivityResponse.snapshot).toEqual(agentActivitySnapshot)
    expect(setPinnedResponse.success).toBe(true)
    expect(agentActivityJournal.setPinnedEvent).toHaveBeenCalledWith('evt-1', false)
    expect(Array.isArray(setPinnedResponse.snapshot.pinnedEvents)).toBe(true)
    expect(workflowRespondResult.success).toBe(true)
    expect(workflowRespondResult.code).toBe('SUBMITTED')

    expect((shell.openExternal as any)).toHaveBeenCalledWith(
      'https://linear.app/kata-sh/issue/KAT-2362/s01-kanban-interaction-closure',
    )
    expect(workflowOpenIssueResult.success).toBe(true)
    expect(workflowOpenIssueResult.code).toBe('OPENED')

    bridge.emit('rpc-event', {
      type: 'tool_execution_start',
      toolCallId: 'tool-1',
      toolName: 'bash',
      args: { command: 'echo hello' },
    })
    expect(agentActivityJournal.ingestCliChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_start',
        toolCallId: 'tool-1',
        toolName: 'bash',
      }),
    )

    agentActivityJournal.emit('update', {
      generatedAt: new Date().toISOString(),
      appendedEvents: [],
    })
    expect(windowStub.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.agentActivityUpdate,
      expect.objectContaining({ appendedEvents: [] }),
    )

    unregister()
  })

  test('ingests worker CLI activity from Symphony session logs', async () => {
    const bridge = createBridgeStub()
    const workerWorkspace = path.join(tmpdir(), 'kata-worker-workspace')
    bridge.getWorkspacePath.mockReturnValue(path.join(tmpdir(), 'kata-main-workspace'))

    const tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-worker-history-'))
    const sessionPath = path.join(tempDir, '2026-04-23_worker-session.jsonl')

    await fs.writeFile(
      sessionPath,
      `${JSON.stringify({ type: 'session', id: 'worker-session', cwd: workerWorkspace })}\n` +
        `${JSON.stringify({
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'echo hi' } }],
          },
        })}\n` +
        `${JSON.stringify({
          type: 'message',
          message: {
            role: 'toolResult',
            toolCallId: 'tool-1',
            toolName: 'bash',
            toolResult: 'hi\n',
            isError: false,
          },
        })}\n`,
      'utf8',
    )

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
    } as any

    const operatorService = Object.assign(new EventEmitter(), {
      on: EventEmitter.prototype.on,
      off: EventEmitter.prototype.off,
      syncRuntimeStatus: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => ({
        fetchedAt: new Date().toISOString(),
        queueCount: 0,
        completedCount: 0,
        workers: [],
        escalations: [],
        connection: { state: 'connected', updatedAt: new Date().toISOString() },
        freshness: { status: 'fresh' },
        response: {},
      })),
      getStabilityMetrics: vi.fn(() => ({
        reconnectSuccessRate: 1,
        recoveryLatencyMs: 0,
        collectedAt: new Date().toISOString(),
      })),
      refreshBaseline: vi.fn(async () => ({
        fetchedAt: new Date().toISOString(),
        queueCount: 0,
        completedCount: 0,
        workers: [],
        escalations: [],
        connection: { state: 'connected', updatedAt: new Date().toISOString() },
        freshness: { status: 'fresh' },
        response: {},
      })),
      respondToEscalation: vi.fn(async () => ({ success: true, snapshot: null })),
    }) as any

    const agentActivityJournal = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn(() => ({ generatedAt: new Date().toISOString(), events: [], verbose: [], pinnedEvents: [] })),
      setPinnedEvent: vi.fn(),
      ingestRuntimeStatus: vi.fn(),
      ingestOperatorSnapshot: vi.fn(),
      ingestEscalationResponse: vi.fn(),
      ingestCliChatEvent: vi.fn(),
      recordSystemError: vi.fn(),
    }) as any

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
        resolveSessionPathById: vi.fn(async (sessionId: string, cwd: string) => {
          if (sessionId === 'worker-session' && cwd === workerWorkspace) {
            return sessionPath
          }
          return null
        }),
      } as any,
      window: createWindowStub(),
      symphonySupervisor: supervisor,
      symphonyOperatorService: operatorService,
      agentActivityJournal,
    })

    operatorService.emit('snapshot', {
      fetchedAt: new Date().toISOString(),
      queueCount: 0,
      completedCount: 0,
      workers: [
        {
          issueId: 'issue-1',
          identifier: 'KAT-1',
          issueTitle: 'Test issue',
          state: 'in_progress',
          toolName: 'bash',
          model: 'test-model',
          sessionId: 'worker-session',
          workspacePath: workerWorkspace,
        },
      ],
      escalations: [],
      connection: { state: 'connected', updatedAt: new Date().toISOString() },
      freshness: { status: 'fresh' },
      response: {},
    })

    await vi.waitFor(() => {
      expect(agentActivityJournal.ingestCliChatEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_start',
          toolCallId: 'tool-1',
          toolName: 'bash',
        }),
        expect.objectContaining({
          issueId: 'issue-1',
          issueIdentifier: 'KAT-1',
        }),
      )
    })

    unregister()
    rmSync(tempDir, { recursive: true, force: true })
  })
})
