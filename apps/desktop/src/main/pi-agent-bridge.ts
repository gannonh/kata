import { EventEmitter } from 'node:events'
import { accessSync, constants } from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import readline from 'node:readline'
import log from './logger'
import {
  type AvailableModel,
  type BridgeLifecycleState,
  type BridgeState,
  type BridgeStatusEvent,
  type CommandResult,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type PermissionMode,
  type RpcCommand,
} from '../shared/types'

interface PendingCommand {
  command: string
  resolve: (value: CommandResult) => void
  reject: (error: Error) => void
}

interface RpcResponse {
  type: 'response'
  id?: string
  command: string
  success: boolean
  data?: unknown
  error?: string
}

interface RpcEnvelope {
  type: 'event'
  event: Record<string, unknown>
}

interface BridgeEvents {
  'rpc-event': (event: Record<string, unknown>) => void
  'extension-ui-request': (request: ExtensionUIRequest) => void
  crash: (payload: { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }) => void
  status: (payload: BridgeStatusEvent) => void
  debug: (payload: Record<string, unknown>) => void
}

interface BinaryDiscoveryResult {
  source: 'bundled' | 'path' | 'not_found'
  resolvedPath: string | null
  checkedPaths: string[]
}

export class PiAgentBridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutReader: readline.Interface | null = null
  private readonly pending = new Map<string, PendingCommand>()
  private readonly stderrLines: string[] = []
  private commandCounter = 0
  private shuttingDown = false
  private resolvedCommand: string | null = null
  private status: BridgeLifecycleState = 'shutdown'
  private startPromise: Promise<void> | null = null
  private permissionMode: PermissionMode = 'ask'
  private selectedModel: string | null

  constructor(
    private workspacePath: string,
    private readonly commandHint = 'kata',
    private readonly commandTimeoutMs = 30_000,
    initialModel: string | null = null,
  ) {
    super()
    this.selectedModel = initialModel?.trim() ? initialModel.trim() : null
  }

  override on<K extends keyof BridgeEvents>(event: K, listener: BridgeEvents[K]): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof BridgeEvents>(event: K, ...args: Parameters<BridgeEvents[K]>): boolean {
    return super.emit(event, ...args)
  }

  public getState(): BridgeState {
    return {
      running: this.child !== null && !this.child.killed && this.status === 'running',
      pid: this.child?.pid ?? null,
      command: this.resolvedCommand,
      status: this.status,
      permissionMode: this.permissionMode,
      selectedModel: this.selectedModel,
    }
  }

  public async start(): Promise<void> {
    if (this.child && !this.child.killed && this.status === 'running') {
      return
    }

    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.startInternal()

    try {
      await this.startPromise
    } finally {
      this.startPromise = null
    }
  }

  private async startInternal(): Promise<void> {
    this.shuttingDown = false
    this.stderrLines.length = 0

    const isPackaged = this.isElectronPackaged()
    const discovery = this.discoverBinary(isPackaged)
    this.resolvedCommand = discovery.resolvedPath

    log.info('[PiAgentBridge] binary discovery', {
      source: discovery.source,
      path: discovery.resolvedPath,
      checkedPaths: discovery.checkedPaths,
      isPackaged,
    })

    this.emit('debug', {
      type: 'bridge:binary-discovery',
      source: discovery.source,
      path: discovery.resolvedPath,
      checkedPaths: discovery.checkedPaths,
      isPackaged,
    })

    if (discovery.source === 'not_found' || !discovery.resolvedPath) {
      const message =
        'Kata CLI not found. Install via: npm install -g @kata-sh/cli. Checked: ' +
        discovery.checkedPaths.join(', ')

      this.emit('crash', {
        exitCode: null,
        signal: null,
        stderrLines: [message],
      })
      this.emitStatus({
        state: 'crashed',
        pid: null,
        message,
        exitCode: null,
        signal: null,
      })
      return
    }

    const command = discovery.resolvedPath

    this.emitStatus({
      state: 'spawning',
      pid: null,
    })

    const args = ['--mode', 'rpc', '--cwd', this.workspacePath]
    if (this.selectedModel) {
      args.push('--model', this.selectedModel)
    }
    const child = spawn(command, args, {
      cwd: this.workspacePath,
      env: process.env,
      stdio: 'pipe',
    })

    this.child = child
    this.stdoutReader = readline.createInterface({ input: child.stdout })

    log.info('[PiAgentBridge] spawn', {
      command,
      args,
      cwd: this.workspacePath,
      pid: child.pid,
    })

    this.emit('debug', {
      type: 'bridge:spawn',
      command,
      args,
      cwd: this.workspacePath,
      pid: child.pid,
    })

    this.emitStatus({
      state: 'running',
      pid: child.pid ?? null,
    })

    this.stdoutReader.on('line', (line) => {
      this.handleStdoutLine(line)
    })

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        this.pushStderr(trimmed)
      }
    })

    let finalizedTermination = false

    const finalizeTermination = (
      cause: 'exit' | 'close' | 'error',
      exitCode: number | null,
      signal: NodeJS.Signals | null,
      errorMessage?: string,
    ): void => {
      if (finalizedTermination) {
        return
      }

      finalizedTermination = true

      if (errorMessage) {
        this.pushStderr(errorMessage)
      }

      const stderrSnapshot = [...this.stderrLines]
      this.cleanupStreams()

      if (this.child === child) {
        this.child = null
      }

      this.rejectPending(new Error('RPC subprocess exited before response was received'))

      if (!this.shuttingDown) {
        log.error('[PiAgentBridge] crash', {
          cause,
          exitCode,
          signal,
          stderrLines: stderrSnapshot,
        })
        this.emit('debug', {
          type: 'bridge:crash',
          cause,
          exitCode,
          signal,
          stderrLines: stderrSnapshot,
        })
        this.emit('crash', {
          exitCode,
          signal,
          stderrLines: stderrSnapshot,
        })
        this.emitStatus({
          state: 'crashed',
          pid: null,
          message: stderrSnapshot.at(-1) ?? 'kata subprocess exited unexpectedly',
          exitCode,
          signal,
        })
      } else {
        log.info('[PiAgentBridge] shutdown complete', { cause, exitCode, signal })
        this.emit('debug', {
          type: 'bridge:shutdown',
          cause,
          exitCode,
          signal,
        })
        this.emitStatus({
          state: 'shutdown',
          pid: null,
          exitCode,
          signal,
        })
      }
    }

    child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[PiAgentBridge] subprocess error', error)
      this.emit('debug', {
        type: 'bridge:error',
        message,
      })
      finalizeTermination('error', null, null, message)
    })

    child.on('exit', (exitCode, signal) => {
      finalizeTermination('exit', exitCode, signal)
    })

    child.on('close', (exitCode, signal) => {
      finalizeTermination('close', exitCode, signal)
    })
  }

  public async send(command: RpcCommand): Promise<CommandResult> {
    await this.start()

    const child = this.child
    if (!child || child.killed || !child.stdin.writable) {
      throw new Error('RPC subprocess is not writable')
    }

    const id = command.id ?? `cmd-${++this.commandCounter}`
    const payload = { ...command, id }

    return new Promise<CommandResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC command timed out: ${command.type}`))
      }, this.commandTimeoutMs)

      this.pending.set(id, {
        command: command.type,
        resolve: (value) => {
          clearTimeout(timeoutId)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        },
      })

      this.writeJsonLine(payload).catch((error: unknown) => {
        clearTimeout(timeoutId)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  public setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode
    this.emit('debug', {
      type: 'bridge:permission-mode',
      mode,
    })
  }

  public async sendExtensionUIResponse(id: string, response: ExtensionUIResponse): Promise<void> {
    await this.start()

    const payload = {
      type: 'extension_ui_response',
      id,
      ...response,
    }

    await this.writeJsonLine(payload)
  }

  public prompt(message: string): Promise<CommandResult> {
    return this.send({ type: 'prompt', message })
  }

  public abort(): Promise<CommandResult> {
    return this.send({ type: 'abort' })
  }

  public async getAvailableModels(): Promise<AvailableModel[]> {
    const result = await this.send({ type: 'get_available_models' })
    const payload = result.data

    if (!Array.isArray(payload)) {
      return []
    }

    const models: AvailableModel[] = []

    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const candidate = entry as Partial<AvailableModel>
      if (typeof candidate.provider !== 'string' || typeof candidate.id !== 'string') {
        continue
      }

      models.push({
        provider: candidate.provider,
        id: candidate.id,
        contextWindow:
          typeof candidate.contextWindow === 'number' ? candidate.contextWindow : undefined,
        reasoning: typeof candidate.reasoning === 'boolean' ? candidate.reasoning : undefined,
      })
    }

    return models
  }

  public async setModel(model: string): Promise<void> {
    const trimmed = model.trim()
    if (!trimmed) {
      throw new Error('Model is required')
    }

    await this.send({ type: 'set_model', model: trimmed })
    this.selectedModel = trimmed
  }

  public getSelectedModel(): string | null {
    return this.selectedModel
  }

  public getWorkspacePath(): string {
    return this.workspacePath
  }

  public async switchWorkspace(nextWorkspacePath: string): Promise<void> {
    const normalized = nextWorkspacePath.trim()
    if (!normalized) {
      throw new Error('Workspace path is required')
    }

    if (normalized === this.workspacePath) {
      return
    }

    this.workspacePath = normalized
    await this.restart()
  }

  public async restart(): Promise<void> {
    await this.shutdown()
    await this.start()
  }

  public async shutdown(timeoutMs = 1_500): Promise<void> {
    const child = this.child
    if (!child) {
      this.emitStatus({
        state: 'shutdown',
        pid: null,
      })
      return
    }

    this.shuttingDown = true

    try {
      await this.send({ type: 'shutdown' })
    } catch (error) {
      log.warn('[PiAgentBridge] shutdown command failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const exited = await this.waitForExit(timeoutMs)
    if (!exited && this.child && !this.child.killed) {
      this.child.kill('SIGTERM')
      const exitedAfterTerm = await this.waitForExit(timeoutMs)

      if (!exitedAfterTerm && this.child && !this.child.killed && this.child.exitCode === null) {
        log.warn('[PiAgentBridge] SIGTERM ignored, escalating to SIGKILL')
        this.child.kill('SIGKILL')

        const exitedAfterKill = await this.waitForExit(Math.min(timeoutMs, 500))
        if (!exitedAfterKill) {
          log.error('[PiAgentBridge] subprocess did not exit after SIGKILL')
        }
      }
    }
  }

  private writeJsonLine(payload: Record<string, unknown>): Promise<void> {
    const child = this.child
    if (!child || child.killed || !child.stdin.writable) {
      return Promise.reject(new Error('RPC subprocess is not writable'))
    }

    return new Promise<void>((resolve, reject) => {
      const line = `${JSON.stringify(payload)}\n`
      child.stdin.write(line, (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private discoverBinary(isPackaged: boolean): BinaryDiscoveryResult {
    const checkedPaths: string[] = []

    if (isPackaged) {
      const bundledPath = path.join(process.resourcesPath, 'kata')
      checkedPaths.push(bundledPath)
      if (this.isExecutableFile(bundledPath)) {
        return {
          source: 'bundled',
          resolvedPath: bundledPath,
          checkedPaths,
        }
      }
    }

    const fromEnvRaw = process.env.KATA_BIN_PATH?.trim()
    const fromEnv = fromEnvRaw ? path.resolve(fromEnvRaw) : undefined
    if (fromEnv) {
      checkedPaths.push(fromEnv)
      if (this.isExecutableFile(fromEnv)) {
        return {
          source: 'path',
          resolvedPath: fromEnv,
          checkedPaths,
        }
      }

      log.warn('[PiAgentBridge] KATA_BIN_PATH is set but not executable, falling back to PATH lookup', {
        fromEnv,
      })
      this.emit('debug', {
        type: 'bridge:binary-discovery-env-not-executable',
        fromEnv,
      })
    }

    const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
    const whichResult = spawnSync(lookupCommand, [this.commandHint], {
      stdio: 'pipe',
      encoding: 'utf8',
    })

    if (whichResult.status === 0) {
      const discovered = whichResult.stdout.trim().split(/\r?\n/)[0]?.trim()
      if (discovered) {
        checkedPaths.push(discovered)
        if (this.isExecutableFile(discovered)) {
          return {
            source: 'path',
            resolvedPath: discovered,
            checkedPaths,
          }
        }

        log.warn('[PiAgentBridge] PATH lookup returned a non-executable binary candidate', {
          discovered,
        })
      }
    }

    checkedPaths.push(this.commandHint)
    return {
      source: 'not_found',
      resolvedPath: null,
      checkedPaths,
    }
  }

  private isElectronPackaged(): boolean {
    try {
      const require = createRequire(import.meta.url)
      const electron = require('electron') as { app?: { isPackaged?: boolean } }
      return Boolean(electron?.app?.isPackaged)
    } catch {
      return false
    }
  }

  private isExecutableFile(filePath: string): boolean {
    try {
      accessSync(filePath, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      this.emit('rpc-event', {
        type: 'agent_error',
        message: 'Received non-JSON line from kata RPC subprocess',
      })
      return
    }

    if (this.isRpcResponse(parsed)) {
      this.resolvePending(parsed)
      return
    }

    if (this.isRpcEnvelope(parsed)) {
      this.dispatchRpcEvent(parsed.event)
      return
    }

    if (this.isRpcEvent(parsed)) {
      this.dispatchRpcEvent(parsed)
      return
    }

    this.emit('rpc-event', {
      type: 'agent_error',
      message: 'Received unrecognized RPC payload shape',
    })
  }

  private dispatchRpcEvent(event: Record<string, unknown>): void {
    if (event.type === 'extension_ui_request') {
      const request = this.extractExtensionUIRequest(event)
      if (!request) {
        this.emit('rpc-event', {
          type: 'agent_error',
          message: 'Received malformed extension_ui_request payload',
        })
        return
      }

      this.emit('extension-ui-request', request)
      return
    }

    this.emit('rpc-event', event)
  }

  private extractExtensionUIRequest(event: Record<string, unknown>): ExtensionUIRequest | null {
    const id = event.id
    const method = event.method

    if (typeof id !== 'string' || id.length === 0) {
      return null
    }

    if (typeof method !== 'string' || method.length === 0) {
      return null
    }

    return event as ExtensionUIRequest
  }

  private resolvePending(response: RpcResponse): void {
    const id = response.id

    let pendingId: string | undefined = id
    let pending = id ? this.pending.get(id) : undefined

    if (!pending && !id) {
      const firstPendingEntry = this.pending.entries().next()
      if (!firstPendingEntry.done) {
        pendingId = firstPendingEntry.value[0]
        pending = firstPendingEntry.value[1]
      }
    }

    if (!pending || !pendingId) {
      return
    }

    this.pending.delete(pendingId)

    if (!response.success) {
      pending.reject(new Error(response.error ?? `RPC command failed: ${pending.command}`))
      return
    }

    pending.resolve({
      id: pendingId,
      command: response.command,
      success: true,
      data: response.data,
      error: response.error,
    })
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const current = this.child
      if (!current) {
        resolve(true)
        return
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve(false)
      }, timeoutMs)

      const onTerminated = () => {
        cleanup()
        resolve(true)
      }

      const cleanup = () => {
        clearTimeout(timer)
        current.removeListener('exit', onTerminated)
        current.removeListener('close', onTerminated)
      }

      current.once('exit', onTerminated)
      current.once('close', onTerminated)
    })
  }

  private cleanupStreams(): void {
    if (this.stdoutReader) {
      this.stdoutReader.removeAllListeners()
      this.stdoutReader.close()
      this.stdoutReader = null
    }
  }

  private pushStderr(line: string): void {
    const sanitized = this.redactSensitiveTokens(line)
    this.stderrLines.push(sanitized)

    while (this.stderrLines.length > 5) {
      this.stderrLines.shift()
    }
  }

  private redactSensitiveTokens(value: string): string {
    return value
      .replace(/(sk-[A-Za-z0-9_-]{10,})/g, 'sk-***')
      .replace(/(api[_-]?key\s*[=:]\s*)([^\s]+)/gi, '$1***')
      .replace(/(token\s*[=:]\s*)([^\s]+)/gi, '$1***')
  }

  private emitStatus(event: Omit<BridgeStatusEvent, 'updatedAt'>): void {
    this.status = event.state
    this.emit('status', {
      ...event,
      updatedAt: Date.now(),
    })
  }

  private isRpcResponse(value: unknown): value is RpcResponse {
    if (!value || typeof value !== 'object') {
      return false
    }

    const candidate = value as Partial<RpcResponse>
    return candidate.type === 'response' && typeof candidate.command === 'string'
  }

  private isRpcEnvelope(value: unknown): value is RpcEnvelope {
    if (!value || typeof value !== 'object') {
      return false
    }

    const candidate = value as Partial<RpcEnvelope>
    return candidate.type === 'event' && typeof candidate.event === 'object' && candidate.event !== null
  }

  private isRpcEvent(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return false
    }

    const candidate = value as Record<string, unknown>
    return typeof candidate.type === 'string'
  }
}
