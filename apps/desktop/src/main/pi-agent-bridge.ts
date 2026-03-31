import { EventEmitter } from 'node:events'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'
import log from 'electron-log/main'
import {
  type BridgeLifecycleState,
  type BridgeState,
  type BridgeStatusEvent,
  type CommandResult,
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
  crash: (payload: { exitCode: number | null; signal: NodeJS.Signals | null; stderrLines: string[] }) => void
  status: (payload: BridgeStatusEvent) => void
  debug: (payload: Record<string, unknown>) => void
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

  constructor(
    private readonly workspacePath: string,
    private readonly commandHint = 'kata',
  ) {
    super()
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
    }
  }

  public async start(): Promise<void> {
    if (this.child && !this.child.killed && this.status === 'running') {
      return
    }

    this.shuttingDown = false
    this.stderrLines.length = 0

    const command = this.resolveCommand()
    this.resolvedCommand = command

    this.emitStatus({
      state: 'spawning',
      pid: null,
    })

    const args = ['--mode', 'rpc', '--cwd', this.workspacePath]
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
      this.pending.set(id, {
        command: command.type,
        resolve,
        reject,
      })

      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  public prompt(message: string): Promise<CommandResult> {
    return this.send({ type: 'prompt', message })
  }

  public abort(): Promise<CommandResult> {
    return this.send({ type: 'abort' })
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
      await this.waitForExit(timeoutMs)
    }
  }

  private resolveCommand(): string {
    const fromEnv = process.env.KATA_BIN_PATH?.trim()
    if (fromEnv) {
      return fromEnv
    }

    const whichResult = spawnSync('which', [this.commandHint], {
      stdio: 'pipe',
      encoding: 'utf8',
    })

    if (whichResult.status === 0) {
      const discovered = whichResult.stdout.trim()
      if (discovered) {
        return discovered
      }
    }

    return this.commandHint
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
      this.emit('rpc-event', parsed.event)
      return
    }

    if (this.isRpcEvent(parsed)) {
      this.emit('rpc-event', parsed)
      return
    }

    this.emit('rpc-event', {
      type: 'agent_error',
      message: 'Received unrecognized RPC payload shape',
    })
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
