import { McpConfigBridge } from './mcp-config-bridge'
import type { McpServerStatus, McpServerStatusResponse, ReliabilitySignal } from '../shared/types'
import { mapMcpStatusResponseToReliability } from './reliability-contract'

interface McpServiceOptions {
  configBridge: McpConfigBridge
  requestTimeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export class McpService {
  private readonly configBridge: McpConfigBridge
  private readonly requestTimeoutMs: number
  private lastReliabilitySignal: ReliabilitySignal | null = null

  constructor(options: McpServiceOptions) {
    this.configBridge = options.configBridge
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  public getReliabilitySignal(): ReliabilitySignal | null {
    return this.lastReliabilitySignal
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
      const response: McpServerStatusResponse = { success: false, status, error: status.error }
      this.lastReliabilitySignal = mapMcpStatusResponseToReliability(response)
      return response
    }

    const server = runtimeServerResponse.server
    const checkedAt = new Date().toISOString()

    if (!server.enabled) {
      const response: McpServerStatusResponse = {
        success: true,
        status: {
          serverName: server.name,
          phase: 'unsupported',
          checkedAt,
          toolNames: [],
          toolCount: 0,
        },
      }
      this.lastReliabilitySignal = mapMcpStatusResponseToReliability(response)
      return response
    }

    const response: McpServerStatusResponse = {
      success: true,
      status: {
        serverName: server.name,
        phase: 'configured',
        checkedAt,
        toolNames: [],
        toolCount: 0,
      },
    }
    this.lastReliabilitySignal = mapMcpStatusResponseToReliability(response)
    return response
  }

  public async reconnectServer(serverName: string): Promise<McpServerStatusResponse> {
    // Reconnect is also lightweight — validates config only.
    // Actual MCP server connections are managed by pi-mcp-adapter inside
    // the CLI subprocess. Desktop manages the config; the CLI manages
    // the connections. Spawning servers from the Electron main process
    // is unsafe (e.g. chrome-devtools-mcp hijacks Electron DevTools).
    return this.refreshStatus(serverName)
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

function mapBridgeErrorCode(code: string): NonNullable<McpServerStatus['error']>['code'] {
  if (code === 'MALFORMED_CONFIG') {
    return 'MALFORMED_CONFIG'
  }

  if (code === 'SERVER_NOT_FOUND') {
    return 'SERVER_NOT_FOUND'
  }

  return 'UNKNOWN'
}


