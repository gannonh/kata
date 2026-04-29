import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { CommandResult, ProviderStatusMap } from '@shared/types'
import {
  PiAgentBridge,
  normalizeFirstRunModelReadiness,
  normalizeFirstRunStartupReadiness,
} from '../pi-agent-bridge'

async function waitFor(condition: () => boolean, timeoutMs = 1_500): Promise<void> {
  const startedAt = Date.now()

  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`)
    }

    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('PiAgentBridge', () => {
  test('marks bridge as crashed and allows restart attempts after spawn error', async () => {
    const savedPiBinPath = process.env.KATA_PI_BIN_PATH
    delete process.env.KATA_PI_BIN_PATH
    const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist')
    const statusHistory: string[] = []

    bridge.on('status', (status) => {
      statusHistory.push(status.state)
    })

    await bridge.start()
    await waitFor(() => statusHistory.includes('crashed'))

    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')

    const crashedCount = statusHistory.filter((state) => state === 'crashed').length

    await bridge.start()
    await waitFor(() => statusHistory.filter((state) => state === 'crashed').length > crashedCount)

    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')
    if (savedPiBinPath !== undefined) process.env.KATA_PI_BIN_PATH = savedPiBinPath
  })

  test('coalesces concurrent start calls into a single spawn attempt', async () => {
    const savedPiBinPath = process.env.KATA_PI_BIN_PATH
    delete process.env.KATA_PI_BIN_PATH
    const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist')
    const statusHistory: string[] = []

    bridge.on('status', (status) => {
      statusHistory.push(status.state)
    })

    await Promise.all([bridge.start(), bridge.start(), bridge.start()])
    await waitFor(() => statusHistory.includes('crashed'))

    expect(statusHistory.filter((state) => state === 'crashed').length).toBe(1)
    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')
    if (savedPiBinPath !== undefined) process.env.KATA_PI_BIN_PATH = savedPiBinPath
  })

  test('resolves oldest pending command when response id is omitted', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    let resolved: CommandResult | undefined
    bridge.pending.set('cmd-1', {
      command: 'abort',
      resolve: (result: CommandResult) => {
        resolved = result
      },
      reject: () => {},
    })

    bridge.resolvePending({
      type: 'response',
      command: 'abort',
      success: true,
      data: { ok: true },
    })

    expect(bridge.pending.size).toBe(0)
    expect(resolved?.id).toBe('cmd-1')
    expect(resolved?.command).toBe('abort')
    expect(resolved?.success).toBe(true)
    expect(resolved?.data).toEqual({ ok: true })
  })

  test('rejects oldest pending command when id is omitted and response is a failure', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    let rejectedMessage: string | undefined
    bridge.pending.set('cmd-1', {
      command: 'shutdown',
      resolve: () => {},
      reject: (error: Error) => {
        rejectedMessage = error.message
      },
    })

    bridge.resolvePending({
      type: 'response',
      command: 'shutdown',
      success: false,
      error: 'shutdown not allowed',
    })

    expect(bridge.pending.size).toBe(0)
    expect(rejectedMessage).toBe('shutdown not allowed')
  })
})

interface MockChildOptions {
  writable?: boolean
  writeError?: Error | null
}

function createMockChild(options: MockChildOptions = {}) {
  const write = vi.fn((line: string, cb?: (error?: Error | null) => void) => {
    cb?.(options.writeError ?? null)
    return true
  })

  const child = new EventEmitter() as any
  child.killed = false
  child.pid = 4242
  child.exitCode = null
  child.stdin = {
    writable: options.writable ?? true,
    write,
  }
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)

  return child
}

function createTempExecutable(scriptContents: string): { executablePath: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pi-agent-bridge-'))
  const executablePath = path.join(dir, 'kata-mock')

  writeFileSync(executablePath, scriptContents)
  chmodSync(executablePath, 0o755)

  return {
    executablePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

describe('PiAgentBridge additional coverage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('send writes JSON command to stdin and resolves when response arrives', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child
    vi.spyOn(bridge, 'start').mockResolvedValue(undefined)

    const resultPromise = bridge.send({ type: 'prompt', message: 'hello' })
    await Promise.resolve()

    expect(child.stdin.write).toHaveBeenCalledTimes(1)
    const writtenLine = child.stdin.write.mock.calls[0][0] as string
    const payload = JSON.parse(writtenLine)

    expect(payload.type).toBe('prompt')
    expect(payload.message).toBe('hello')
    expect(typeof payload.id).toBe('string')

    bridge.resolvePending({
      type: 'response',
      id: payload.id,
      command: 'prompt',
      success: true,
      data: { ok: true },
    })

    await expect(resultPromise).resolves.toEqual({
      id: payload.id,
      command: 'prompt',
      success: true,
      data: { ok: true },
      error: undefined,
    })
  })

  test('send rejects on timeout and clears pending command', async () => {
    vi.useFakeTimers()

    const bridge = new PiAgentBridge(process.cwd(), 'kata', 20) as any
    const child = createMockChild()
    bridge.child = child
    vi.spyOn(bridge, 'start').mockResolvedValue(undefined)

    const pendingPromise = bridge.send({ type: 'abort' })
    const rejectionExpectation = expect(pendingPromise).rejects.toThrow('RPC command timed out: abort')

    await vi.advanceTimersByTimeAsync(25)

    await rejectionExpectation
    expect(bridge.pending.size).toBe(0)
  })

  test('send rejects when subprocess stdin is not writable', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild({ writable: false })
    bridge.child = child
    vi.spyOn(bridge, 'start').mockResolvedValue(undefined)

    await expect(bridge.send({ type: 'abort' })).rejects.toThrow('RPC subprocess is not writable')
  })

  test('setPermissionMode updates state and emits debug event', () => {
    const bridge = new PiAgentBridge(process.cwd())
    const debugEvents: Array<Record<string, unknown>> = []

    bridge.on('debug', (event) => {
      debugEvents.push(event)
    })

    bridge.setPermissionMode('auto')

    expect(bridge.getState().permissionMode).toBe('auto')
    expect(debugEvents).toContainEqual({
      type: 'bridge:permission-mode',
      mode: 'auto',
    })
  })

  test('sendExtensionUIResponse writes extension_ui_response payload to stdin', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child
    vi.spyOn(bridge, 'start').mockResolvedValue(undefined)

    await bridge.sendExtensionUIResponse('ui-1', {
      confirmed: true,
      value: 'allow',
    })

    expect(child.stdin.write).toHaveBeenCalledTimes(1)
    const writtenLine = child.stdin.write.mock.calls[0][0] as string
    expect(JSON.parse(writtenLine)).toEqual({
      type: 'extension_ui_response',
      id: 'ui-1',
      confirmed: true,
      value: 'allow',
    })
  })

  test('prompt and abort forward to send()', async () => {
    const bridge = new PiAgentBridge(process.cwd())
    const sendSpy = vi
      .spyOn(bridge, 'send')
      .mockResolvedValue({ command: 'prompt', success: true } as CommandResult)

    await bridge.prompt('ship it')
    await bridge.abort()

    expect(sendSpy).toHaveBeenNthCalledWith(1, { type: 'prompt', message: 'ship it' })
    expect(sendSpy).toHaveBeenNthCalledWith(2, { type: 'abort' })
  })

  test('emits stability metrics for event-loop lag and heap growth budgets', () => {
    const previousFaultMode = process.env.KATA_DESKTOP_STABILITY_CHAT_FAULT

    process.env.KATA_DESKTOP_STABILITY_CHAT_FAULT = 'lag_spike'
    try {
      const bridge = new PiAgentBridge(process.cwd())
      const lagFaultMetrics = bridge.getStabilityMetrics()
      expect(lagFaultMetrics.eventLoopLagMs).toBe(220)
      expect((lagFaultMetrics.heapGrowthMb ?? 0) >= 0).toBe(true)
      expect(Number.isNaN(Date.parse(String(lagFaultMetrics.collectedAt)))).toBe(false)
    } finally {
      if (previousFaultMode === undefined) {
        delete process.env.KATA_DESKTOP_STABILITY_CHAT_FAULT
      } else {
        process.env.KATA_DESKTOP_STABILITY_CHAT_FAULT = previousFaultMode
      }
    }

    const bridge = new PiAgentBridge(process.cwd())
    const baselineMetrics = bridge.getStabilityMetrics()
    expect((baselineMetrics.eventLoopLagMs ?? 0) >= 0).toBe(true)
    expect((baselineMetrics.heapGrowthMb ?? 0) >= 0).toBe(true)
    expect(Number.isNaN(Date.parse(String(baselineMetrics.collectedAt)))).toBe(false)
  })

  test('injects one-time reliability crash fault for prompt in test mode', async () => {
    const previousTestMode = process.env.KATA_TEST_MODE
    const previousFaultMode = process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT

    process.env.KATA_TEST_MODE = '1'
    process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT = 'process_crash_once'

    try {
      const bridge = new PiAgentBridge(process.cwd())
      const sendSpy = vi
        .spyOn(bridge, 'send')
        .mockResolvedValue({ command: 'prompt', success: true } as CommandResult)
      const crashes: Array<{ exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }> = []
      const statuses: string[] = []

      bridge.on('crash', (payload) => {
        crashes.push(payload)
      })

      bridge.on('status', (status) => {
        statuses.push(status.state)
      })

      await expect(bridge.prompt('trigger injected crash')).rejects.toThrow('Injected test subprocess crash fault.')
      expect(crashes).toHaveLength(1)
      expect(crashes[0]?.exitCode).toBe(137)
      expect(statuses.at(-1)).toBe('crashed')
      expect(sendSpy).not.toHaveBeenCalled()

      await bridge.prompt('second prompt should proceed')
      expect(sendSpy).toHaveBeenCalledWith({ type: 'prompt', message: 'second prompt should proceed' })
    } finally {
      if (previousTestMode === undefined) {
        delete process.env.KATA_TEST_MODE
      } else {
        process.env.KATA_TEST_MODE = previousTestMode
      }

      if (previousFaultMode === undefined) {
        delete process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT
      } else {
        process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT = previousFaultMode
      }
    }
  })

  test('injectPromptCrashFault tears down active subprocess state before reporting crash', () => {
    const previousTestMode = process.env.KATA_TEST_MODE
    const previousFaultMode = process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT

    process.env.KATA_TEST_MODE = '1'
    process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT = 'process_crash_once'

    try {
      const bridge = new PiAgentBridge(process.cwd()) as any
      const child = createMockChild()
      const closeReader = vi.fn()
      bridge.child = child
      bridge.status = 'running'
      bridge.stdoutReader = {
        removeAllListeners: vi.fn(),
        close: closeReader,
      }

      let rejectedMessage: string | undefined
      bridge.pending.set('cmd-1', {
        command: 'prompt',
        resolve: () => {},
        reject: (error: Error) => {
          rejectedMessage = error.message
        },
      })

      const crashes: Array<{ exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }> = []
      bridge.on('crash', (payload: { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }) => {
        crashes.push(payload)
      })

      const error = bridge.injectPromptCrashFault()

      expect(error.message).toBe('Injected test subprocess crash fault.')
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
      expect(closeReader).toHaveBeenCalledTimes(1)
      expect(bridge.child).toBeNull()
      expect(bridge.pending.size).toBe(0)
      expect(rejectedMessage).toBe('Injected test subprocess crash fault.')
      expect(crashes).toHaveLength(1)
      expect(crashes[0]?.stderrLines[0]).toBe('Injected test subprocess crash fault.')
    } finally {
      if (previousTestMode === undefined) {
        delete process.env.KATA_TEST_MODE
      } else {
        process.env.KATA_TEST_MODE = previousTestMode
      }

      if (previousFaultMode === undefined) {
        delete process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT
      } else {
        process.env.KATA_DESKTOP_RELIABILITY_CHAT_FAULT = previousFaultMode
      }
    }
  })

  test('getAvailableModels returns only valid model entries and syncs selected model from runtime state', async () => {
    const bridge = new PiAgentBridge(process.cwd())

    const sendSpy = vi.spyOn(bridge, 'send')
    sendSpy
      .mockResolvedValueOnce({
        command: 'get_available_models',
        success: true,
        data: [
          { provider: 'anthropic', id: 'claude-sonnet', contextWindow: 200000, reasoning: true },
          { provider: 'openai', id: 'gpt-4.1' },
          { provider: 'missing-id' },
          { id: 'missing-provider' },
          'not-an-object',
        ],
      } as CommandResult)
      .mockResolvedValueOnce({
        command: 'get_state',
        success: true,
        data: {
          model: { provider: 'anthropic', id: 'claude-sonnet' },
        },
      } as CommandResult)

    await expect(bridge.getAvailableModels()).resolves.toEqual([
      { provider: 'anthropic', id: 'claude-sonnet', contextWindow: 200000, reasoning: true, supportsXhigh: false },
      { provider: 'openai', id: 'gpt-4.1', contextWindow: undefined, reasoning: undefined, supportsXhigh: false },
    ])
    expect(bridge.getSelectedModel()).toBe('anthropic/claude-sonnet')
  })

  test('getAvailableModels returns [] for non-array and empty-array payloads', async () => {
    const bridge = new PiAgentBridge(process.cwd())
    const sendSpy = vi.spyOn(bridge, 'send')

    sendSpy
      .mockResolvedValueOnce({
        command: 'get_available_models',
        success: true,
        data: { models: [] },
      } as CommandResult)
      .mockResolvedValueOnce({
        command: 'get_state',
        success: true,
        data: {
          model: { provider: 'openai', id: 'gpt-4.1' },
        },
      } as CommandResult)

    await expect(bridge.getAvailableModels()).resolves.toEqual([])
    expect(bridge.getSelectedModel()).toBe('openai/gpt-4.1')

    sendSpy
      .mockResolvedValueOnce({
        command: 'get_available_models',
        success: true,
        data: [],
      } as CommandResult)

    await expect(bridge.getAvailableModels()).resolves.toEqual([])
  })

  test('setModel validates input and updates selected model', async () => {
    const bridge = new PiAgentBridge(process.cwd())

    await expect(bridge.setModel('', '   ')).rejects.toThrow('Provider and model ID are required')
    await expect(bridge.setModel('   ', '')).rejects.toThrow('Provider and model ID are required')

    const sendSpy = vi
      .spyOn(bridge, 'send')
      .mockResolvedValue({ command: 'set_model', success: true } as CommandResult)

    await bridge.setModel('  anthropic  ', '  claude-sonnet-4-5  ')

    expect(sendSpy).toHaveBeenCalledWith({ type: 'set_model', provider: 'anthropic', modelId: 'claude-sonnet-4-5' })
    expect(bridge.getSelectedModel()).toBe('anthropic/claude-sonnet-4-5')
  })

  test('switchSession sends switch_session command and maps cancelled payload', async () => {
    const bridge = new PiAgentBridge(process.cwd())
    const sendSpy = vi.spyOn(bridge, 'send')

    await expect(bridge.switchSession('   ')).rejects.toThrow('Session path is required')

    sendSpy.mockResolvedValueOnce({
      command: 'switch_session',
      success: true,
      data: { cancelled: false },
    } as CommandResult)

    await expect(bridge.switchSession('/tmp/session-a.jsonl')).resolves.toBe(true)
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'switch_session',
      sessionPath: '/tmp/session-a.jsonl',
    })

    sendSpy.mockResolvedValueOnce({
      command: 'switch_session',
      success: true,
      data: { cancelled: true },
    } as CommandResult)

    await expect(bridge.switchSession('/tmp/session-b.jsonl')).resolves.toBe(false)
  })

  test('getSelectedModel and getWorkspacePath return constructor values', () => {
    const bridge = new PiAgentBridge('/tmp/my-workspace', 'kata', 30_000, '  provider/model  ')

    expect(bridge.getWorkspacePath()).toBe('/tmp/my-workspace')
    expect(bridge.getSelectedModel()).toBe('provider/model')
  })

  test('switchWorkspace validates input, no-ops for same path, and restarts on change', async () => {
    const bridge = new PiAgentBridge('/tmp/workspace-a')
    const restartSpy = vi.spyOn(bridge, 'restart').mockResolvedValue(undefined)

    await expect(bridge.switchWorkspace('   ')).rejects.toThrow('Workspace path is required')

    await bridge.switchWorkspace('/tmp/workspace-a')
    expect(restartSpy).not.toHaveBeenCalled()

    await bridge.switchWorkspace('/tmp/workspace-b')
    expect(restartSpy).toHaveBeenCalledTimes(1)
    expect(bridge.getWorkspacePath()).toBe('/tmp/workspace-b')
  })

  test('handleStdoutLine handles empty, non-JSON, envelope, event, response, and unknown payloads', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const rpcEvents: Array<Record<string, unknown>> = []

    bridge.on('rpc-event', (event: Record<string, unknown>) => {
      rpcEvents.push(event)
    })

    let resolved: CommandResult | undefined
    bridge.pending.set('cmd-42', {
      command: 'abort',
      resolve: (result: CommandResult) => {
        resolved = result
      },
      reject: () => {},
    })

    bridge.handleStdoutLine('   ')
    expect(rpcEvents).toHaveLength(0)

    bridge.handleStdoutLine('not-json')
    expect(rpcEvents.at(-1)).toEqual({
      type: 'agent_error',
      message: 'Received non-JSON line from kata RPC subprocess',
    })

    bridge.handleStdoutLine(JSON.stringify({ type: 'event', event: { type: 'foo', value: 1 } }))
    expect(rpcEvents.at(-1)).toEqual({ type: 'foo', value: 1 })

    bridge.handleStdoutLine(JSON.stringify({ type: 'bar', payload: true }))
    expect(rpcEvents.at(-1)).toEqual({ type: 'bar', payload: true })

    bridge.handleStdoutLine(
      JSON.stringify({ type: 'response', id: 'cmd-42', command: 'abort', success: true, data: { ok: true } }),
    )
    expect(resolved?.data).toEqual({ ok: true })

    bridge.handleStdoutLine(JSON.stringify({ unknown: 'shape' }))
    expect(rpcEvents.at(-1)).toEqual({
      type: 'agent_error',
      message: 'Received unrecognized RPC payload shape',
    })
  })

  test('dispatchRpcEvent routes extension_ui_request and normal events', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const rpcEvents: Array<Record<string, unknown>> = []
    const uiRequests: Array<Record<string, unknown>> = []

    bridge.on('rpc-event', (event: Record<string, unknown>) => {
      rpcEvents.push(event)
    })

    bridge.on('extension-ui-request', (event: Record<string, unknown>) => {
      uiRequests.push(event)
    })

    bridge.dispatchRpcEvent({
      type: 'extension_ui_request',
      id: 'req-1',
      method: 'confirm',
      message: 'Approve?',
    })

    expect(uiRequests).toEqual([
      {
        type: 'extension_ui_request',
        id: 'req-1',
        method: 'confirm',
        message: 'Approve?',
      },
    ])

    bridge.dispatchRpcEvent({
      type: 'extension_ui_request',
      id: '',
      method: 'confirm',
    })

    expect(rpcEvents.at(-1)).toEqual({
      type: 'agent_error',
      message: 'Received malformed extension_ui_request payload',
    })

    bridge.dispatchRpcEvent({ type: 'agent_start' })
    expect(rpcEvents.at(-1)).toEqual({ type: 'agent_start' })
  })

  test('extractExtensionUIRequest validates id and method', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    expect(
      bridge.extractExtensionUIRequest({ type: 'extension_ui_request', id: 'ok', method: 'input' }),
    ).toEqual({ type: 'extension_ui_request', id: 'ok', method: 'input' })

    expect(
      bridge.extractExtensionUIRequest({ type: 'extension_ui_request', id: '', method: 'input' }),
    ).toBeNull()
    expect(
      bridge.extractExtensionUIRequest({ type: 'extension_ui_request', id: 'ok', method: '' }),
    ).toBeNull()
  })

  test('rejectPending rejects all pending commands and clears the map', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const rejectA = vi.fn()
    const rejectB = vi.fn()

    bridge.pending.set('a', { command: 'prompt', resolve: vi.fn(), reject: rejectA })
    bridge.pending.set('b', { command: 'abort', resolve: vi.fn(), reject: rejectB })

    bridge.rejectPending(new Error('boom'))

    expect(rejectA).toHaveBeenCalled()
    expect(rejectA.mock.calls[0]![0].message).toBe('boom')
    expect(rejectB).toHaveBeenCalled()
    expect(bridge.pending.size).toBe(0)
  })

  test('pushStderr keeps only the last 5 lines and redacts sensitive tokens', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    bridge.pushStderr('line-1')
    bridge.pushStderr('line-2')
    bridge.pushStderr('line-3')
    bridge.pushStderr('line-4')
    bridge.pushStderr('line-5')
    bridge.pushStderr('token=secret-value')

    expect(bridge.stderrLines).toEqual([
      'line-2',
      'line-3',
      'line-4',
      'line-5',
      'token=***',
    ])
  })

  test('redactSensitiveTokens redacts sk- keys, api keys, and tokens', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    const redacted = bridge.redactSensitiveTokens(
      'sk-abcdefghijklmnop api_key=abc123 api-key: xyz token = super-secret',
    )

    expect(redacted).toContain('sk-***')
    expect(redacted).toContain('api_key=***')
    expect(redacted).toContain('api-key: ***')
    expect(redacted).toContain('token = ***')
  })

  test('RPC type guards correctly identify response, envelope, and event payloads', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    expect(bridge.isRpcResponse({ type: 'response', command: 'prompt', success: true })).toBe(true)
    expect(bridge.isRpcResponse({ type: 'response' })).toBe(false)

    expect(bridge.isRpcEnvelope({ type: 'event', event: { type: 'x' } })).toBe(true)
    expect(bridge.isRpcEnvelope({ type: 'event', event: null })).toBe(false)

    expect(bridge.isRpcEvent({ type: 'agent_start' })).toBe(true)
    expect(bridge.isRpcEvent({})).toBe(false)
  })

  test('shutdown emits shutdown status immediately when no child exists', async () => {
    const bridge = new PiAgentBridge(process.cwd())
    const statuses: string[] = []

    bridge.on('status', (status) => {
      statuses.push(status.state)
    })

    await bridge.shutdown()

    expect(statuses.at(-1)).toBe('shutdown')
  })

  test('shutdown sends command and exits cleanly without signals when process exits', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child

    const sendSpy = vi
      .spyOn(bridge, 'send')
      .mockResolvedValue({ command: 'shutdown', success: true } as CommandResult)
    vi.spyOn(bridge, 'waitForExit').mockResolvedValue(true)

    await bridge.shutdown(10)

    expect(sendSpy).toHaveBeenCalledWith({ type: 'shutdown' })
    expect(child.kill).not.toHaveBeenCalled()
  })

  test('shutdown sends SIGTERM when process does not exit initially', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child

    vi.spyOn(bridge, 'send').mockResolvedValue({ command: 'shutdown', success: true } as CommandResult)
    vi.spyOn(bridge, 'waitForExit').mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await bridge.shutdown(10)

    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  test('shutdown escalates to SIGKILL when SIGTERM is ignored', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child

    vi.spyOn(bridge, 'send').mockResolvedValue({ command: 'shutdown', success: true } as CommandResult)
    vi.spyOn(bridge, 'waitForExit')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    await bridge.shutdown(10)

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
  })

  test('writeJsonLine writes newline-delimited JSON and rejects for unwritable stdin', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const child = createMockChild()
    bridge.child = child

    await expect(bridge.writeJsonLine({ type: 'ping' })).resolves.toBeUndefined()
    expect(child.stdin.write).toHaveBeenCalledWith('{"type":"ping"}\n', expect.any(Function))

    bridge.child = createMockChild({ writable: false })
    await expect(bridge.writeJsonLine({ type: 'ping' })).rejects.toThrow('RPC subprocess is not writable')

    bridge.child = createMockChild({ writeError: new Error('write failed') })
    await expect(bridge.writeJsonLine({ type: 'ping' })).rejects.toThrow('write failed')
  })

  test('start, prompt, and shutdown work end-to-end with a real subprocess', async () => {
    const { executablePath, cleanup } = createTempExecutable(`#!/usr/bin/env node
const readline = require('node:readline')
process.stderr.write('boot token=super-secret\\n\\n')
process.stdout.write(JSON.stringify({ type: 'event', event: { type: 'agent_ready' } }) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'prompt') {
    process.stdout.write(JSON.stringify({ type: 'response', id: message.id, command: 'prompt', success: true, data: { echo: message.message } }) + '\\n')
    return
  }

  if (message.type === 'shutdown') {
    process.stdout.write(JSON.stringify({ type: 'response', id: message.id, command: 'shutdown', success: true }) + '\\n')
    setTimeout(() => process.exit(0), 10)
  }
})
`)

    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    process.env.KATA_PI_BIN_PATH = executablePath

    try {
      const bridge = new PiAgentBridge(process.cwd(), 'kata', 1_000, 'provider/model') as any
      const statuses: string[] = []
      const rpcEvents: Array<Record<string, unknown>> = []

      bridge.on('status', (event: { state: string }) => {
        statuses.push(event.state)
      })

      bridge.on('rpc-event', (event: Record<string, unknown>) => {
        rpcEvents.push(event)
      })

      await bridge.start()
      await waitFor(() => statuses.includes('running'))

      await expect(bridge.prompt('hello')).resolves.toMatchObject({
        command: 'prompt',
        success: true,
        data: { echo: 'hello' },
      })

      await bridge.shutdown(250)
      await waitFor(() => statuses.includes('shutdown'))

      expect(rpcEvents).toContainEqual({ type: 'agent_ready' })
      expect(bridge.stderrLines[0]).toBe('boot token=***')
      expect(bridge.getState().status).toBe('shutdown')
      expect(bridge.getState().running).toBe(false)
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }
      cleanup()
    }
  })

  test('unexpected subprocess exit crashes bridge and rejects pending commands', async () => {
    const { executablePath, cleanup } = createTempExecutable(`#!/usr/bin/env node
process.stderr.write('api_key=super-secret\\n')
process.stdin.resume()
setTimeout(() => {
  process.stderr.write('token=really-secret\\n')
  process.exit(9)
}, 200)
`)

    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    process.env.KATA_PI_BIN_PATH = executablePath

    try {
      const bridge = new PiAgentBridge(process.cwd(), 'kata', 1_000) as any
      let crashPayload:
        | { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }
        | undefined

      bridge.on('crash', (payload: { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }) => {
        crashPayload = payload
      })

      await bridge.start()

      const pending = bridge.send({ type: 'abort' })
      await expect(pending).rejects.toThrow('RPC subprocess exited before response was received')

      await waitFor(() => Boolean(crashPayload))

      expect(crashPayload?.exitCode).toBe(9)
      expect(crashPayload?.stderrLines).toContain('api_key=***')
      expect(crashPayload?.stderrLines).toContain('token=***')
      expect(bridge.getState().status).toBe('crashed')
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }
      cleanup()
    }
  })

  test('send rejects when writeJsonLine fails after pending command registration', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    bridge.child = createMockChild({ writable: true })
    vi.spyOn(bridge, 'start').mockResolvedValue(undefined)
    vi.spyOn(bridge, 'writeJsonLine').mockRejectedValue('write exploded')

    await expect(bridge.send({ type: 'abort' })).rejects.toThrow('write exploded')
    expect(bridge.pending.size).toBe(0)
  })

  test('shutdown logs and continues when shutdown command fails', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    bridge.child = createMockChild()

    vi.spyOn(bridge, 'send').mockRejectedValue('shutdown write failed')
    vi.spyOn(bridge, 'waitForExit').mockResolvedValue(true)

    await expect(bridge.shutdown(10)).resolves.toBeUndefined()
  })

  test('restart calls shutdown then start', async () => {
    const bridge = new PiAgentBridge(process.cwd())
    const shutdownSpy = vi.spyOn(bridge, 'shutdown').mockResolvedValue(undefined)
    const startSpy = vi.spyOn(bridge, 'start').mockResolvedValue(undefined)

    await bridge.restart()

    expect(shutdownSpy).toHaveBeenCalledTimes(1)
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  test('start returns immediately when bridge is already running', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    bridge.child = createMockChild()
    bridge.status = 'running'

    const startInternalSpy = vi.spyOn(bridge, 'startInternal')

    await bridge.start()

    expect(startInternalSpy).not.toHaveBeenCalled()
  })

  test('waitForExit handles no child, timeout, and process exit events', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    bridge.child = null
    await expect(bridge.waitForExit(10)).resolves.toBe(true)

    vi.useFakeTimers()

    const timeoutChild = new EventEmitter() as any
    bridge.child = timeoutChild
    const timeoutPromise = bridge.waitForExit(20)
    await vi.advanceTimersByTimeAsync(25)
    await expect(timeoutPromise).resolves.toBe(false)

    vi.useRealTimers()

    const exitingChild = new EventEmitter() as any
    bridge.child = exitingChild
    const exitedPromise = bridge.waitForExit(200)
    exitingChild.emit('exit', 0, null)
    await expect(exitedPromise).resolves.toBe(true)
  })

  test('cleanupStreams closes stdout reader and tears down event-loop monitor interval', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const removeAllListeners = vi.fn()
    const close = vi.fn()

    bridge.stdoutReader = {
      removeAllListeners,
      close,
    }

    bridge.startEventLoopLagMonitor(5)
    bridge.eventLoopLagMs = 42

    bridge.cleanupStreams()

    expect(removeAllListeners).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(bridge.stdoutReader).toBeNull()
    expect(bridge.eventLoopMonitor).toBeNull()
    expect(bridge.eventLoopLagMs).toBe(0)
  })

  test('binary discovery supports env, packaged, and PATH fallback branches', () => {
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

    try {
      const envBridge = new PiAgentBridge(process.cwd()) as any
      process.env.KATA_PI_BIN_PATH = process.execPath
      expect(envBridge.discoverBinary(false)).toMatchObject({
        source: 'path',
        resolvedPath: process.execPath,
        runtimeMode: 'pi-runtime',
      })

      const packagedBridge = new PiAgentBridge(process.cwd()) as any
      Object.defineProperty(process, 'resourcesPath', {
        value: '/tmp/kata-resources',
        configurable: true,
      })
      vi.spyOn(packagedBridge, 'isExecutableFile').mockImplementation(((candidate: string) => {
        return candidate === path.join('/tmp/kata-resources', 'pi')
      }) as any)

      expect(packagedBridge.discoverBinary(true)).toMatchObject({
        source: 'bundled',
        resolvedPath: path.join('/tmp/kata-resources', 'pi'),
        runtimeMode: 'pi-runtime',
      })

      const fallbackBridge = new PiAgentBridge(process.cwd(), 'node') as any
      vi.spyOn(fallbackBridge, 'isExecutableFile').mockReturnValue(false)
      expect(fallbackBridge.discoverBinary(false).source).toBe('not_found')
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }

      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        configurable: true,
      })
    }
  })

  test('discoverBinary emits debug event when KATA_PI_BIN_PATH is not executable', () => {
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH

    try {
      process.env.KATA_PI_BIN_PATH = '/definitely/not-executable'
      const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist') as any
      const debugEvents: Array<Record<string, unknown>> = []

      bridge.on('debug', (event: Record<string, unknown>) => {
        debugEvents.push(event)
      })

      const result = bridge.discoverBinary(false)

      expect(result.source).toBe('not_found')
      expect(debugEvents).toContainEqual({
        type: 'bridge:binary-discovery-pi-env-not-executable',
        fromEnv: '/definitely/not-executable',
      })
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }
    }
  })

  test('discoverBinary does not treat KATA_BIN_PATH as the Pi RPC runtime', () => {
    const originalBinPath = process.env.KATA_BIN_PATH
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH

    try {
      process.env.KATA_BIN_PATH = process.execPath
      delete process.env.KATA_PI_BIN_PATH

      const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist') as any
      const result = bridge.discoverBinary(false)

      expect(result.source).toBe('not_found')
      expect(result.checkedPaths).not.toContain(process.execPath)
      expect(result.checkedPaths).toContain('kata-command-that-does-not-exist')
    } finally {
      if (originalBinPath === undefined) {
        delete process.env.KATA_BIN_PATH
      } else {
        process.env.KATA_BIN_PATH = originalBinPath
      }

      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }
    }
  })

  test('spawned Pi runtime inherits KATA_CLI_ROOT for kata skill artifact IO', async () => {
    const { executablePath, cleanup } = createTempExecutable(`#!/usr/bin/env node
const readline = require('node:readline')
process.stdout.write(JSON.stringify({ type: 'event', event: { type: 'agent_ready' } }) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'prompt') {
    process.stdout.write(JSON.stringify({
      type: 'response',
      id: message.id,
      command: 'prompt',
      success: true,
      data: { kataCliRoot: process.env.KATA_CLI_ROOT }
    }) + '\\n')
    return
  }

  if (message.type === 'shutdown') {
    process.stdout.write(JSON.stringify({ type: 'response', id: message.id, command: 'shutdown', success: true }) + '\\n')
    setTimeout(() => process.exit(0), 10)
  }
})
`)

    const originalCliRoot = process.env.KATA_CLI_ROOT
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    const kataCliRoot = './apps/cli'

    try {
      process.env.KATA_PI_BIN_PATH = executablePath
      process.env.KATA_CLI_ROOT = kataCliRoot

      const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist') as any
      await bridge.start()

      await expect(bridge.prompt('env?')).resolves.toMatchObject({
        command: 'prompt',
        success: true,
        data: { kataCliRoot },
      })

      await bridge.shutdown(250)
    } finally {
      if (originalCliRoot === undefined) {
        delete process.env.KATA_CLI_ROOT
      } else {
        process.env.KATA_CLI_ROOT = originalCliRoot
      }

      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }

      cleanup()
    }
  })

  test('packaged discovery returns not_found with checked launcher path when launcher is missing', () => {
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

    try {
      delete process.env.KATA_PI_BIN_PATH
      Object.defineProperty(process, 'resourcesPath', {
        value: '/tmp/missing-kata-resources',
        configurable: true,
      })

      const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist') as any
      const result = bridge.discoverBinary(true)

      expect(result.source).toBe('not_found')
      expect(result.runtimeMode).toBe('pi-runtime')
      expect(result.checkedPaths).toContain(path.join('/tmp/missing-kata-resources', 'pi'))
      expect(result.checkedPaths).toContain('kata-command-that-does-not-exist')
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }

      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        configurable: true,
      })
    }
  })

  test('packaged launcher spawns with rpc args and emits runtimeMode pi-runtime', async () => {
    const { executablePath, cleanup } = createTempExecutable(`#!/usr/bin/env node
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'shutdown') {
    process.stdout.write(JSON.stringify({ type: 'response', id: message.id, command: 'shutdown', success: true }) + '\\n')
    setTimeout(() => process.exit(0), 10)
  }
})
`)

    const resourcesDir = path.dirname(executablePath)
    const bundledLauncherPath = path.join(resourcesDir, 'pi')
    const originalPiBinPath = process.env.KATA_PI_BIN_PATH
    const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

    // Ensure discoverBinary sees a bundled launcher named "pi"
    writeFileSync(bundledLauncherPath, `#!/usr/bin/env node
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'shutdown') {
    process.stdout.write(JSON.stringify({ type: 'response', id: message.id, command: 'shutdown', success: true }) + '\\n')
    setTimeout(() => process.exit(0), 10)
  }
})
`)
    chmodSync(bundledLauncherPath, 0o755)

    try {
      delete process.env.KATA_PI_BIN_PATH
      Object.defineProperty(process, 'resourcesPath', {
        value: resourcesDir,
        configurable: true,
      })

      const workspacePath = '/tmp/kata-packaged-workspace'
      const bridge = new PiAgentBridge(workspacePath, 'kata-command-that-does-not-exist') as any
      const debugEvents: Array<Record<string, unknown>> = []
      const statuses: string[] = []

      vi.spyOn(bridge, 'isElectronPackaged').mockReturnValue(true)

      bridge.on('debug', (event: Record<string, unknown>) => {
        debugEvents.push(event)
      })

      bridge.on('status', (event: { state: string }) => {
        statuses.push(event.state)
      })

      await bridge.start()
      await waitFor(() => statuses.includes('running'))

      const discoveryEvent = debugEvents.find((event) => event.type === 'bridge:binary-discovery')
      expect(discoveryEvent).toMatchObject({
        source: 'bundled',
        path: bundledLauncherPath,
        runtimeMode: 'pi-runtime',
      })

      const spawnEvent = debugEvents.find((event) => event.type === 'bridge:spawn')
      expect(spawnEvent).toMatchObject({
        command: bundledLauncherPath,
        args: ['--mode', 'rpc', '--cwd', workspacePath],
        runtimeMode: 'pi-runtime',
      })

      await bridge.shutdown(250)
      await waitFor(() => statuses.includes('shutdown'))
    } finally {
      if (originalPiBinPath === undefined) {
        delete process.env.KATA_PI_BIN_PATH
      } else {
        process.env.KATA_PI_BIN_PATH = originalPiBinPath
      }

      Object.defineProperty(process, 'resourcesPath', {
        value: originalResourcesPath,
        configurable: true,
      })

      cleanup()
    }
  })

  test('packaged runtime launcher invokes bundled Pi runtime instead of global pi', () => {
    const script = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/bundle-kata-runtime.sh'),
      'utf8',
    )

    expect(script).toContain('pi-runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js')
    expect(script).toContain('export KATA_CLI_ROOT="$SCRIPT_DIR/kata-cli"')
    expect(script).toContain('ELECTRON_RUN_AS_NODE=1 exec "$KATA_ELECTRON_NODE" "$PI_CLI" "$@"')
    expect(script).not.toContain('exec pi "$@"')
    expect(script).not.toContain('\npi %*')
  })

  test('isExecutableFile and RPC type guards return false for invalid values', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    expect(bridge.isExecutableFile(process.execPath)).toBe(true)
    expect(bridge.isExecutableFile('/definitely/not/a/real/binary')).toBe(false)

    expect(bridge.isRpcResponse(null)).toBe(false)
    expect(bridge.isRpcEnvelope(null)).toBe(false)
    expect(bridge.isRpcEvent(null)).toBe(false)
  })

  test('spawn error path emits crash details after discovery returns an invalid command', async () => {
    const bridge = new PiAgentBridge(process.cwd()) as any
    const statuses: string[] = []
    const debugEvents: Array<Record<string, unknown>> = []

    vi.spyOn(bridge, 'discoverBinary').mockReturnValue({
      source: 'path',
      resolvedPath: '/definitely/missing/kata-bin',
      checkedPaths: ['/definitely/missing/kata-bin'],
      runtimeMode: 'pi-runtime',
    })
    vi.spyOn(bridge, 'isElectronPackaged').mockReturnValue(false)

    bridge.on('status', (event: { state: string }) => {
      statuses.push(event.state)
    })

    bridge.on('debug', (event: Record<string, unknown>) => {
      debugEvents.push(event)
    })

    await bridge.start()
    await waitFor(() => statuses.includes('crashed'))

    expect(debugEvents.some((event) => event.type === 'bridge:error')).toBe(true)
    expect(bridge.getState().status).toBe('crashed')
  })

  test('normalizes first-run model checkpoint and startup checkpoint', () => {
    const providers: ProviderStatusMap = {
      anthropic: { provider: 'anthropic', status: 'missing' as const, authType: 'api_key' as const },
      openai: { provider: 'openai', status: 'valid' as const, authType: 'api_key' as const, maskedKey: '••••1234' },
      google: { provider: 'google', status: 'missing' as const, authType: 'api_key' as const },
      mistral: { provider: 'mistral', status: 'missing' as const, authType: 'api_key' as const },
      bedrock: { provider: 'bedrock', status: 'missing' as const, authType: 'api_key' as const },
      azure: { provider: 'azure', status: 'missing' as const, authType: 'api_key' as const },
      'github-copilot': { provider: 'github-copilot', status: 'missing' as const, authType: 'oauth' as const },
    }

    const modelCheckpoint = normalizeFirstRunModelReadiness({
      providers,
      selectedProvider: 'openai',
      selectedModel: 'openai/gpt-4.1',
      availableModels: [{ provider: 'openai', id: 'gpt-4.1' }],
      now: '2026-04-08T00:00:00.000Z',
    })

    const startupCheckpoint = normalizeFirstRunStartupReadiness({
      bridgeStatus: 'running',
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(modelCheckpoint.status).toBe('pass')
    expect(startupCheckpoint.status).toBe('pass')
  })

  test('treats aliased selected models as available when canonical provider model exists', () => {
    const providers: ProviderStatusMap = {
      anthropic: { provider: 'anthropic', status: 'missing' as const, authType: 'api_key' as const },
      openai: { provider: 'openai', status: 'valid' as const, authType: 'api_key' as const, maskedKey: '••••1234' },
      google: { provider: 'google', status: 'missing' as const, authType: 'api_key' as const },
      mistral: { provider: 'mistral', status: 'missing' as const, authType: 'api_key' as const },
      bedrock: { provider: 'bedrock', status: 'missing' as const, authType: 'api_key' as const },
      azure: { provider: 'azure', status: 'missing' as const, authType: 'api_key' as const },
      'github-copilot': { provider: 'github-copilot', status: 'missing' as const, authType: 'oauth' as const },
    }

    const checkpoint = normalizeFirstRunModelReadiness({
      providers,
      selectedProvider: 'openai',
      selectedModel: 'openai-codex/gpt-4.1',
      availableModels: [{ provider: 'openai', id: 'gpt-4.1' }],
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(checkpoint.status).toBe('pass')
  })

  test('fails model checkpoint when selected model provider is not configured', () => {
    const providers: ProviderStatusMap = {
      anthropic: { provider: 'anthropic', status: 'missing' as const, authType: 'api_key' as const },
      openai: { provider: 'openai', status: 'missing' as const, authType: 'api_key' as const },
      google: { provider: 'google', status: 'valid' as const, authType: 'api_key' as const, maskedKey: '••••5678' },
      mistral: { provider: 'mistral', status: 'missing' as const, authType: 'api_key' as const },
      bedrock: { provider: 'bedrock', status: 'missing' as const, authType: 'api_key' as const },
      azure: { provider: 'azure', status: 'missing' as const, authType: 'api_key' as const },
      'github-copilot': { provider: 'github-copilot', status: 'missing' as const, authType: 'oauth' as const },
    }

    const checkpoint = normalizeFirstRunModelReadiness({
      providers,
      selectedProvider: 'google',
      selectedModel: 'openai/gpt-4.1',
      availableModels: [{ provider: 'openai', id: 'gpt-4.1' }],
      now: '2026-04-08T00:00:00.000Z',
    })

    expect(checkpoint.status).toBe('fail')
    expect(checkpoint.failure?.code).toBe('MODEL_PROVIDER_NOT_CONFIGURED')
    expect(checkpoint.failure?.recoveryAction).toBe('reauthenticate')
  })
})
