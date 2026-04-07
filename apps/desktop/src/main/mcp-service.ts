import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import log from './logger'
import { McpConfigBridge, type McpRuntimeHttpServer, type McpRuntimeServerConfig, type McpRuntimeStdioServer } from './mcp-config-bridge'
import type { McpServerStatus, McpServerStatusResponse } from '../shared/types'

interface McpServiceOptions {
  configBridge: McpConfigBridge
  requestTimeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export class McpService {
  private readonly configBridge: McpConfigBridge
  private readonly requestTimeoutMs: number

  constructor(options: McpServiceOptions) {
    this.configBridge = options.configBridge
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  public async refreshStatus(serverName: string): Promise<McpServerStatusResponse> {
    // Lightweight config validation only — does NOT spawn the server process.
    // Spawning stdio servers from the Electron main process is dangerous:
    // servers like chrome-devtools-mcp can hijack Electron's DevTools and
    // crash the renderer. Full connect should go through the CLI subprocess
    // via the mcp() RPC tool.
    const runtimeServerResponse = await this.configBridge.getRuntimeServer(serverName)

    if (!runtimeServerResponse.success) {
      const status = this.createErrorStatus(
        serverName,
        mapBridgeErrorCode(runtimeServerResponse.error.code),
        runtimeServerResponse.error.message,
      )
      return { success: false, status, error: status.error }
    }

    const server = runtimeServerResponse.server
    const checkedAt = new Date().toISOString()

    if (!server.enabled) {
      return {
        success: true,
        status: {
          serverName: server.name,
          phase: 'unsupported',
          checkedAt,
          toolNames: [],
          toolCount: 0,
        },
      }
    }

    return {
      success: true,
      status: {
        serverName: server.name,
        phase: 'configured',
        checkedAt,
        toolNames: [],
        toolCount: 0,
      },
    }
  }

  public async reconnectServer(serverName: string): Promise<McpServerStatusResponse> {
    // Reconnect is also lightweight — validates config only.
    // Actual MCP server connections are managed by pi-mcp-adapter inside
    // the CLI subprocess. Desktop manages the config; the CLI manages
    // the connections. Spawning servers from the Electron main process
    // is unsafe (e.g. chrome-devtools-mcp hijacks Electron DevTools).
    return this.refreshStatus(serverName)
  }

  private async inspectServer(
    serverName: string,
    action: 'refresh' | 'reconnect',
  ): Promise<McpServerStatusResponse> {
    const runtimeServerResponse = await this.configBridge.getRuntimeServer(serverName)

    if (!runtimeServerResponse.success) {
      const status = this.createErrorStatus(serverName, mapBridgeErrorCode(runtimeServerResponse.error.code), runtimeServerResponse.error.message)
      return {
        success: false,
        status,
        error: status.error,
      }
    }

    const runtimeServer = runtimeServerResponse.server

    if (!runtimeServer.enabled) {
      const status: McpServerStatus = {
        serverName: runtimeServer.name,
        phase: 'unsupported',
        checkedAt: new Date().toISOString(),
        toolNames: [],
        toolCount: 0,
      }

      return {
        success: true,
        status,
      }
    }

    try {
      const status =
        runtimeServer.transport === 'stdio'
          ? await this.inspectStdioServer(runtimeServer)
          : await this.inspectHttpServer(runtimeServer)

      const success = status.phase === 'connected' || status.phase === 'unsupported'

      log.info('[mcp-service] status check completed', {
        action,
        serverName: runtimeServer.name,
        phase: status.phase,
        toolCount: status.toolCount,
        errorCode: status.error?.code,
      })

      return {
        success,
        status,
        error: success ? undefined : status.error,
      }
    } catch (error) {
      const status = this.createErrorStatus(
        runtimeServer.name,
        'UNKNOWN',
        error instanceof Error ? error.message : String(error),
      )

      log.error('[mcp-service] status check crashed', {
        action,
        serverName: runtimeServer.name,
        error: status.error?.message,
      })

      return {
        success: false,
        status,
        error: status.error,
      }
    }
  }

  private async inspectStdioServer(server: McpRuntimeStdioServer): Promise<McpServerStatus> {
    const startedAt = new Date().toISOString()

    try {
      const client = await createStdioRpcClient(server)

      try {
        await client.request(
          'initialize',
          {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'kata-desktop',
              version: '0.1.0',
            },
          },
          this.requestTimeoutMs,
        )

        await client.notify('notifications/initialized', {})

        const toolsResult = await client.request('tools/list', {}, this.requestTimeoutMs)
        const toolNames = extractToolNames(toolsResult)

        return {
          serverName: server.name,
          phase: 'connected',
          checkedAt: startedAt,
          toolNames,
          toolCount: toolNames.length,
        }
      } finally {
        await client.dispose()
      }
    } catch (error) {
      const mapped = mapTransportError(error)
      return this.createErrorStatus(server.name, mapped.code, mapped.message, startedAt)
    }
  }

  private async inspectHttpServer(server: McpRuntimeHttpServer): Promise<McpServerStatus> {
    const checkedAt = new Date().toISOString()

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      }

      if (server.auth === 'bearer') {
        const resolvedToken = resolveBearerToken(server)

        if (!resolvedToken) {
          return this.createErrorStatus(
            server.name,
            'MISSING_BEARER_TOKEN',
            'Bearer auth requires a token value or configured env key.',
            checkedAt,
          )
        }

        headers.authorization = `Bearer ${resolvedToken}`
      }

      const initializeResponse = await postJsonRpc(server.url, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'kata-desktop',
            version: '0.1.0',
          },
        },
      }, headers, this.requestTimeoutMs)

      if (initializeResponse.error) {
        return this.createErrorStatus(
          server.name,
          'CONNECTION_FAILED',
          formatJsonRpcError('initialize', initializeResponse.error),
          checkedAt,
        )
      }

      void postJsonRpcNotification(
        server.url,
        {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        },
        headers,
        this.requestTimeoutMs,
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('[mcp-service] notifications/initialized failed', {
          serverName: server.name,
          error: message,
        })
      })

      const toolsResponse = await postJsonRpc(server.url, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }, headers, this.requestTimeoutMs)

      if (toolsResponse.error) {
        return this.createErrorStatus(
          server.name,
          'CONNECTION_FAILED',
          formatJsonRpcError('tools/list', toolsResponse.error),
          checkedAt,
        )
      }

      const toolNames = extractToolNames(toolsResponse.result)

      return {
        serverName: server.name,
        phase: 'connected',
        checkedAt,
        toolNames,
        toolCount: toolNames.length,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = message.toLowerCase().includes('timeout') ? 'TIMEOUT' : 'UNREACHABLE'

      return this.createErrorStatus(server.name, code, message, checkedAt)
    }
  }

  private createErrorStatus(
    serverName: string,
    code: NonNullable<McpServerStatus['error']>['code'],
    message: string,
    checkedAt = new Date().toISOString(),
  ): McpServerStatus {
    return {
      serverName,
      phase: 'error',
      checkedAt,
      toolNames: [],
      toolCount: 0,
      error: {
        code,
        message,
      },
    }
  }
}

interface StdioRpcClient {
  request: (method: string, params: unknown, timeoutMs: number) => Promise<unknown>
  notify: (method: string, params: unknown) => Promise<void>
  dispose: () => Promise<void>
}

async function createStdioRpcClient(server: McpRuntimeStdioServer): Promise<StdioRpcClient> {
  const child = spawn(server.command, server.args, {
    cwd: server.cwd,
    env: {
      ...process.env,
      ...server.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams

  const transport = new FramedRpcTransport(child)
  await transport.waitForSpawn()

  return {
    request: async (method, params, timeoutMs) => transport.request(method, params, timeoutMs),
    notify: async (method, params) => {
      await transport.notify(method, params)
    },
    dispose: async () => {
      await transport.dispose()
    },
  }
}

class FramedRpcTransport {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeoutId: ReturnType<typeof setTimeout>
    }
  >()
  private nextRequestId = 1
  private buffer = Buffer.alloc(0)
  private stderrOutput = ''
  private closed = false
  private spawnResolved = false
  private spawnWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = []

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child

    child.on('spawn', () => {
      this.spawnResolved = true
      for (const waiter of this.spawnWaiters) {
        waiter.resolve()
      }
      this.spawnWaiters = []
    })

    child.on('error', (error) => {
      this.rejectPending(new Error(error.message))
      if (!this.spawnResolved) {
        for (const waiter of this.spawnWaiters) {
          waiter.reject(error)
        }
        this.spawnWaiters = []
      }
    })

    child.on('exit', (code, signal) => {
      const stderrSummary = this.stderrOutput.trim().split('\n')[0]
      const reason = stderrSummary || `Process exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})`
      this.rejectPending(new Error(reason))
    })

    child.stderr.on('data', (chunk) => {
      this.stderrOutput = `${this.stderrOutput}${chunk.toString('utf8')}`.slice(-16_384)
    })

    child.stdout.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.processBuffer()
    })
  }

  public async waitForSpawn(): Promise<void> {
    if (this.spawnResolved) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      this.spawnWaiters.push({ resolve, reject })
    })
  }

  public async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const requestId = this.nextRequestId++

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Timeout waiting for ${method} response`))
      }, timeoutMs)

      this.pending.set(requestId, { resolve, reject, timeoutId })
    })

    await this.writeFrame({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    })

    return responsePromise
  }

  public async notify(method: string, params: unknown): Promise<void> {
    await this.writeFrame({
      jsonrpc: '2.0',
      method,
      params,
    })
  }

  public async dispose(): Promise<void> {
    if (this.closed) {
      return
    }

    this.closed = true

    if (!this.child.killed) {
      this.child.kill('SIGTERM')

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!this.child.killed) {
            this.child.kill('SIGKILL')
          }
          resolve()
        }, 500)

        this.child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }

    this.rejectPending(new Error('MCP stdio client closed'))
  }

  private async writeFrame(payload: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify(payload)
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`

    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(frame, (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      const separatorIndex = this.buffer.indexOf('\r\n\r\n')
      if (separatorIndex === -1) {
        return
      }

      const headerText = this.buffer.slice(0, separatorIndex).toString('utf8')
      const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i)

      if (!lengthMatch?.[1]) {
        this.rejectPending(new Error('Invalid MCP frame: missing Content-Length header'))
        this.buffer = Buffer.alloc(0)
        return
      }

      const bodyLength = Number(lengthMatch[1])
      if (!Number.isFinite(bodyLength) || bodyLength < 0) {
        this.rejectPending(new Error('Invalid MCP frame: malformed Content-Length header'))
        this.buffer = Buffer.alloc(0)
        return
      }

      const frameLength = separatorIndex + 4 + bodyLength
      if (this.buffer.length < frameLength) {
        return
      }

      const body = this.buffer.slice(separatorIndex + 4, frameLength).toString('utf8')
      this.buffer = this.buffer.slice(frameLength)

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(body) as Record<string, unknown>
      } catch {
        this.rejectPending(new Error('Invalid MCP frame: JSON parse failed'))
        continue
      }

      const id = parsed.id
      if (typeof id !== 'number') {
        continue
      }

      const pendingRequest = this.pending.get(id)
      if (!pendingRequest) {
        continue
      }

      clearTimeout(pendingRequest.timeoutId)
      this.pending.delete(id)

      if (parsed.error) {
        pendingRequest.reject(new Error(formatJsonRpcError('request', parsed.error)))
      } else {
        pendingRequest.resolve(parsed.result)
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const [requestId, pendingRequest] of this.pending.entries()) {
      clearTimeout(pendingRequest.timeoutId)
      pendingRequest.reject(error)
      this.pending.delete(requestId)
    }
  }
}

function extractToolNames(result: unknown): string[] {
  if (!result || typeof result !== 'object') {
    return []
  }

  const tools = (result as { tools?: unknown }).tools
  if (!Array.isArray(tools)) {
    return []
  }

  return tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') {
        return null
      }

      const name = (tool as { name?: unknown }).name
      return typeof name === 'string' ? name : null
    })
    .filter((name): name is string => Boolean(name))
}

function resolveBearerToken(server: McpRuntimeHttpServer): string | null {
  if (server.bearerToken?.trim()) {
    return server.bearerToken.trim()
  }

  if (server.bearerTokenEnv?.trim()) {
    const fromEnv = process.env[server.bearerTokenEnv.trim()]
    if (fromEnv?.trim()) {
      return fromEnv.trim()
    }
  }

  return null
}

async function postJsonRpc(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ result?: unknown; error?: unknown }> {
  const response = await postJson(url, payload, headers, timeoutMs)

  const body = (await response.json()) as {
    result?: unknown
    error?: unknown
  }

  return body
}

async function postJsonRpcNotification(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<void> {
  // JSON-RPC notifications may return 204/empty bodies (or no meaningful payload).
  // We only care that the request is delivered; response content is intentionally ignored.
  await postJson(url, payload, headers, timeoutMs)
}

async function postJson(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => {
    abortController.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`)
    }

    return response
  } finally {
    clearTimeout(timeout)
  }
}

function formatJsonRpcError(method: string, error: unknown): string {
  if (!error || typeof error !== 'object') {
    return `${method} failed`
  }

  const code = (error as { code?: unknown }).code
  const message = (error as { message?: unknown }).message

  if (typeof code === 'number' && typeof message === 'string') {
    return `${method} failed (${code}): ${message}`
  }

  if (typeof message === 'string') {
    return `${method} failed: ${message}`
  }

  return `${method} failed`
}

function mapBridgeErrorCode(code: string): NonNullable<McpServerStatus['error']>['code'] {
  if (code === 'MALFORMED_CONFIG') {
    return 'MALFORMED_CONFIG'
  }

  if (code === 'SERVER_NOT_FOUND') {
    return 'SERVER_NOT_FOUND'
  }

  return 'UNKNOWN'
}

function mapTransportError(error: unknown): {
  code: NonNullable<McpServerStatus['error']>['code']
  message: string
} {
  if (error instanceof Error) {
    const message = error.message
    const lower = message.toLowerCase()

    if (lower.includes('enoent') || lower.includes('not found')) {
      return {
        code: 'COMMAND_NOT_FOUND',
        message,
      }
    }

    if (lower.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message,
      }
    }

    if (lower.includes('content-length') || lower.includes('json parse') || lower.includes('request failed')) {
      return {
        code: 'PROTOCOL_ERROR',
        message,
      }
    }

    return {
      code: 'CONNECTION_FAILED',
      message,
    }
  }

  return {
    code: 'UNKNOWN',
    message: String(error),
  }
}
