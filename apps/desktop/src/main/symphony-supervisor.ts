import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import log from './logger'
import { resolveSymphonyLaunch, type ResolveSymphonyLaunchOptions } from './symphony-config'
import type {
  SymphonyRuntimeCommandResult,
  SymphonyRuntimeError,
  SymphonyRuntimeStatus,
} from '../shared/types'

const DEFAULT_READINESS_TIMEOUT_MS = 20_000
const DEFAULT_READINESS_INTERVAL_MS = 750
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const MAX_DIAGNOSTIC_LINES = 100

interface SupervisorEvents {
  status: (status: SymphonyRuntimeStatus) => void
}

export interface SymphonySupervisorOptions {
  workspacePath: string
  appIsPackaged: boolean
  resourcesPath?: string
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  spawnImpl?: typeof spawn
  readinessTimeoutMs?: number
  readinessIntervalMs?: number
  stopTimeoutMs?: number
}

export class SymphonySupervisor extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private status: SymphonyRuntimeStatus = createInitialStatus()
  private workspacePath: string
  private readonly fetchImpl: typeof fetch
  private readonly spawnImpl: typeof spawn
  private readonly readinessTimeoutMs: number
  private readonly readinessIntervalMs: number
  private readonly stopTimeoutMs: number
  private startInFlight: Promise<SymphonyRuntimeCommandResult> | null = null
  private stopInFlight: Promise<SymphonyRuntimeCommandResult> | null = null
  private restartInFlight: Promise<SymphonyRuntimeCommandResult> | null = null
  private readonly mockMode: string | null

  constructor(private readonly options: SymphonySupervisorOptions) {
    super()
    this.workspacePath = options.workspacePath
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.mockMode = (options.env ?? process.env).KATA_DESKTOP_SYMPHONY_MOCK?.trim() ?? null
    this.spawnImpl = options.spawnImpl ?? spawn
    this.readinessTimeoutMs = options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS
    this.readinessIntervalMs = options.readinessIntervalMs ?? DEFAULT_READINESS_INTERVAL_MS
    this.stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
  }

  override on<K extends keyof SupervisorEvents>(event: K, listener: SupervisorEvents[K]): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof SupervisorEvents>(event: K, ...args: Parameters<SupervisorEvents[K]>): boolean {
    return super.emit(event, ...args)
  }

  public getStatus(): SymphonyRuntimeStatus {
    return this.status
  }

  public async setWorkspacePath(workspacePath: string): Promise<void> {
    const resolved = workspacePath.trim()
    if (!resolved || resolved === this.workspacePath) {
      return
    }

    await this.stop('workspace_changed')
    this.workspacePath = resolved
    this.updateStatus({
      phase: 'stopped',
      managedProcessRunning: false,
      pid: null,
      url: null,
      launch: undefined,
      diagnostics: { stdout: [], stderr: [] },
      lastError: undefined,
      restartReason: 'workspace_changed',
    })
  }

  public async start(): Promise<SymphonyRuntimeCommandResult> {
    if (this.restartInFlight) {
      return this.restartInFlight
    }

    if (this.startInFlight) {
      return this.startInFlight
    }

    if (this.child && this.status.phase === 'ready') {
      return { success: true, status: this.status }
    }

    this.startInFlight = this.startInternal()
    try {
      return await this.startInFlight
    } finally {
      this.startInFlight = null
    }
  }

  public async stop(reason = 'user_requested'): Promise<SymphonyRuntimeCommandResult> {
    if (this.stopInFlight) {
      return this.stopInFlight
    }

    this.stopInFlight = this.stopInternal(reason)
    try {
      return await this.stopInFlight
    } finally {
      this.stopInFlight = null
    }
  }

  public async restart(reason = 'user_requested'): Promise<SymphonyRuntimeCommandResult> {
    if (this.restartInFlight) {
      return this.restartInFlight
    }

    this.restartInFlight = this.restartInternal(reason)
    try {
      return await this.restartInFlight
    } finally {
      this.restartInFlight = null
    }
  }

  private async startInternal(): Promise<SymphonyRuntimeCommandResult> {
    if (this.mockMode) {
      return this.startMockedRuntime(this.mockMode)
    }

    const resolved = await resolveSymphonyLaunch(this.resolveLaunchOptions())
    if (!resolved.ok) {
      this.updateStatus({
        phase: 'config_error',
        managedProcessRunning: false,
        pid: null,
        url: null,
        lastError: resolved.error,
      })
      return {
        success: false,
        status: this.status,
        error: resolved.error,
      }
    }

    const launch = resolved.launch

    this.updateStatus({
      phase: 'starting',
      managedProcessRunning: false,
      pid: null,
      url: launch.resolvedUrl,
      launch: {
        command: launch.command,
        args: launch.args,
        source: launch.source,
      },
      diagnostics: { stdout: [], stderr: [] },
      lastError: undefined,
    })

    try {
      const child = this.spawnImpl(launch.command, launch.args, {
        cwd: launch.cwd,
        env: this.options.env ?? process.env,
        stdio: 'pipe',
      })

      this.child = child

      child.stdout.on('data', (chunk: Buffer | string) => {
        this.pushDiagnostics('stdout', chunk.toString())
      })

      child.stderr.on('data', (chunk: Buffer | string) => {
        this.pushDiagnostics('stderr', chunk.toString())
      })

      child.on('exit', (exitCode, signal) => {
        const wasStopping = this.status.phase === 'stopping'
        this.child = null

        this.updateStatus({
          managedProcessRunning: false,
          pid: null,
          phase: wasStopping ? 'stopped' : 'failed',
          lastError: wasStopping
            ? this.status.lastError
            : {
                code: 'PROCESS_EXITED',
                phase: 'process',
                message: `Symphony exited unexpectedly (${exitCode ?? 'null'}${signal ? `/${signal}` : ''}).`,
              },
        })
      })

      child.on('error', (error) => {
        this.child = null
        this.updateStatus({
          phase: 'failed',
          managedProcessRunning: false,
          pid: null,
          lastError: {
            code: 'SPAWN_FAILED',
            phase: 'spawn',
            message: `Failed to launch Symphony: ${error.message}`,
          },
        })
      })

      this.updateStatus({
        managedProcessRunning: true,
        pid: child.pid ?? null,
      })

      const readiness = await this.waitForReadiness(launch.resolvedUrl)
      if (!readiness.ok) {
        if (readiness.error.code === 'READINESS_FAILED') {
          await this.terminateChildAfterReadinessFailure()
        }

        this.updateStatus({
          phase: 'failed',
          managedProcessRunning: Boolean(this.child),
          pid: this.child?.pid ?? null,
          lastError: readiness.error,
          lastReadinessCheckAt: new Date().toISOString(),
        })

        return {
          success: false,
          status: this.status,
          error: readiness.error,
        }
      }

      const nowIso = new Date().toISOString()
      this.updateStatus({
        phase: 'ready',
        managedProcessRunning: true,
        lastReadyAt: nowIso,
        lastReadinessCheckAt: nowIso,
      })

      return {
        success: true,
        status: this.status,
      }
    } catch (error) {
      const err: SymphonyRuntimeError = {
        code: 'SPAWN_FAILED',
        phase: 'spawn',
        message: error instanceof Error ? error.message : String(error),
      }

      this.updateStatus({
        phase: 'failed',
        managedProcessRunning: false,
        pid: null,
        lastError: err,
      })

      return {
        success: false,
        status: this.status,
        error: err,
      }
    }
  }

  private async stopInternal(reason: string): Promise<SymphonyRuntimeCommandResult> {
    const child = this.child
    if (!child) {
      this.updateStatus({
        phase: 'stopped',
        managedProcessRunning: false,
        pid: null,
        restartReason: reason,
      })
      return { success: true, status: this.status }
    }

    this.updateStatus({
      phase: 'stopping',
      managedProcessRunning: true,
      restartReason: reason,
      lastError: undefined,
    })

    child.kill('SIGTERM')
    const exited = await this.waitForExit(child, this.stopTimeoutMs)

    if (!exited) {
      child.kill('SIGKILL')
      const killed = await this.waitForExit(child, 1_000)

      if (killed) {
        this.child = null
        this.updateStatus({
          phase: 'stopped',
          managedProcessRunning: false,
          pid: null,
          restartReason: reason,
          lastError: undefined,
        })

        return { success: true, status: this.status }
      }

      const error: SymphonyRuntimeError = {
        code: 'STOP_TIMEOUT',
        phase: 'shutdown',
        message: 'Timed out waiting for Symphony to stop gracefully.',
      }

      this.updateStatus({
        phase: 'failed',
        managedProcessRunning: false,
        pid: null,
        lastError: error,
      })

      return { success: false, status: this.status, error }
    }

    this.child = null
    this.updateStatus({
      phase: 'stopped',
      managedProcessRunning: false,
      pid: null,
      restartReason: reason,
    })

    return { success: true, status: this.status }
  }

  private async restartInternal(reason: string): Promise<SymphonyRuntimeCommandResult> {
    this.updateStatus({
      phase: 'restarting',
      restartCount: this.status.restartCount + 1,
      restartReason: reason,
    })

    const stopResult = await this.stop('restart')
    if (!stopResult.success) {
      return stopResult
    }

    return this.startInternal()
  }

  private async startMockedRuntime(mockMode: string): Promise<SymphonyRuntimeCommandResult> {
    const mockUrl = (this.options.env ?? process.env).KATA_SYMPHONY_URL ?? 'http://127.0.0.1:8080'

    this.updateStatus({
      phase: 'starting',
      managedProcessRunning: false,
      pid: null,
      url: mockUrl,
      lastError: undefined,
      diagnostics: { stdout: [], stderr: [] },
    })

    await delay(25)

    if (mockMode === 'config_error') {
      const error: SymphonyRuntimeError = {
        code: 'CONFIG_MISSING',
        phase: 'config',
        message: 'Mocked config error for e2e validation.',
      }

      this.updateStatus({
        phase: 'config_error',
        managedProcessRunning: false,
        pid: null,
        lastError: error,
      })

      return { success: false, status: this.status, error }
    }

    if (mockMode === 'readiness_error') {
      const error: SymphonyRuntimeError = {
        code: 'READINESS_FAILED',
        phase: 'readiness',
        message: 'Mocked readiness failure for e2e validation.',
      }

      this.updateStatus({
        phase: 'failed',
        managedProcessRunning: false,
        pid: null,
        lastError: error,
      })

      return { success: false, status: this.status, error }
    }

    const nowIso = new Date().toISOString()
    this.updateStatus({
      phase: 'ready',
      managedProcessRunning: true,
      pid: 4242,
      lastReadyAt: nowIso,
      lastReadinessCheckAt: nowIso,
      launch: {
        command: 'mock-symphony',
        args: ['WORKFLOW.md', '--no-tui', '--port', '8080'],
        source: 'env',
      },
    })

    return { success: true, status: this.status }
  }

  private async waitForReadiness(url: string): Promise<{ ok: true } | { ok: false; error: SymphonyRuntimeError }> {
    const startedAt = Date.now()

    while (Date.now() - startedAt < this.readinessTimeoutMs) {
      if (!this.child || this.child.exitCode !== null) {
        return {
          ok: false,
          error:
            this.status.lastError ?? {
              code: 'PROCESS_EXITED',
              phase: 'process',
              message: 'Symphony exited before becoming ready.',
            },
        }
      }

      const endpoint = buildEndpoint(url, '/api/v1/state')
      this.updateStatus({ lastReadinessCheckAt: new Date().toISOString() })

      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        })

        if (response.ok) {
          return { ok: true }
        }
      } catch {
        // keep polling until timeout
      }

      await delay(this.readinessIntervalMs)
    }

    return {
      ok: false,
      error: {
        code: 'READINESS_FAILED',
        phase: 'readiness',
        message: `Symphony readiness check failed after ${this.readinessTimeoutMs}ms.`,
      },
    }
  }

  private async terminateChildAfterReadinessFailure(): Promise<void> {
    const child = this.child
    if (!child) {
      return
    }

    child.kill('SIGTERM')
    const exited = await this.waitForExit(child, this.stopTimeoutMs)

    if (!exited) {
      child.kill('SIGKILL')
      await this.waitForExit(child, 1_000)
    }

    this.child = null
  }

  private updateStatus(patch: Partial<SymphonyRuntimeStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      diagnostics: patch.diagnostics ?? this.status.diagnostics,
      updatedAt: new Date().toISOString(),
    }

    this.emit('status', this.status)
  }

  private pushDiagnostics(stream: 'stdout' | 'stderr', chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length === 0) {
      return
    }

    const next = {
      ...this.status.diagnostics,
      [stream]: [...this.status.diagnostics[stream], ...lines].slice(-MAX_DIAGNOSTIC_LINES),
    }

    this.updateStatus({ diagnostics: next })
  }

  private waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve(true)
        return
      }

      const timeoutId = setTimeout(() => {
        cleanup()
        resolve(false)
      }, timeoutMs)

      const onExit = () => {
        cleanup()
        resolve(true)
      }

      const cleanup = () => {
        clearTimeout(timeoutId)
        child.removeListener('exit', onExit)
        child.removeListener('close', onExit)
      }

      child.once('exit', onExit)
      child.once('close', onExit)
    })
  }

  private resolveLaunchOptions(): ResolveSymphonyLaunchOptions {
    return {
      workspacePath: this.workspacePath,
      appIsPackaged: this.options.appIsPackaged,
      resourcesPath: this.options.resourcesPath,
      env: this.options.env,
    }
  }
}

function createInitialStatus(): SymphonyRuntimeStatus {
  return {
    phase: 'idle',
    managedProcessRunning: false,
    pid: null,
    url: null,
    diagnostics: {
      stdout: [],
      stderr: [],
    },
    updatedAt: new Date().toISOString(),
    restartCount: 0,
  }
}

function buildEndpoint(baseUrl: string, endpointPath: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(endpointPath.replace(/^\//, ''), normalized).toString()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
