import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { McpConfigBridge } from '../mcp-config-bridge'
import { McpService } from '../mcp-service'

describe('McpService', () => {
  let tempDir: string
  let configPath: string
  let fixtureScriptPath: string

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-mcp-service-'))
    configPath = path.join(tempDir, 'agent', 'mcp.json')
    fixtureScriptPath = path.join(tempDir, 'fixture-mcp-server.mjs')

    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(fixtureScriptPath, MCP_STDIO_FIXTURE_SERVER, 'utf8')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('refreshStatus connects to local stdio server and returns tool list', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: process.execPath,
          args: [fixtureScriptPath, 'ok'],
        },
      },
    })

    const service = createService(5_000)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('connected')
    expect(response.status?.toolNames).toEqual(['echo', 'ping'])
    expect(response.status?.toolCount).toBe(2)
  })

  test('returns malformed-config status when config is invalid JSON', async () => {
    await fs.writeFile(configPath, '{bad-json', 'utf8')

    const service = createService(3_000)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('MALFORMED_CONFIG')
  })

  test('returns command-not-found status for unreachable stdio command', async () => {
    await writeConfig({
      mcpServers: {
        unreachable: {
          command: 'not-a-real-command-xyz',
          args: [],
        },
      },
    })

    const service = createService(3_000)
    const response = await service.reconnectServer('unreachable')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('COMMAND_NOT_FOUND')
  })

  test('returns unsupported when server is disabled', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: process.execPath,
          args: [fixtureScriptPath, 'ok'],
          disabled: true,
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('unsupported')
    expect(response.status?.toolCount).toBe(0)
  })

  test('returns server-not-found when runtime server is missing', async () => {
    await writeConfig({ mcpServers: {} })

    const service = createService(3_000)
    const response = await service.refreshStatus('missing')

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('SERVER_NOT_FOUND')
  })

  test('maps stdio initialize RPC errors to protocol_error', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: process.execPath,
          args: [fixtureScriptPath, 'initialize-error'],
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('PROTOCOL_ERROR')
  })

  test('maps stdio process exits to connection_failed', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: process.execPath,
          args: [fixtureScriptPath, 'exit'],
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('CONNECTION_FAILED')
  })

  test('maps stdio request timeout to timeout error', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: process.execPath,
          args: [fixtureScriptPath, 'timeout'],
        },
      },
    })

    const service = createService(150)
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('TIMEOUT')
  })

  test('inspects HTTP server with bearer token resolved from env and lists tools', async () => {
    const httpServer = await startJsonRpcHttpServer((request) => {
      if (request.method === 'initialize') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              serverInfo: {
                name: 'fixture-http',
                version: '1.0.0',
              },
            },
          },
        }
      }

      if (request.method === 'tools/list') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: [{ name: 'search' }, { name: 'lookup' }],
            },
          },
        }
      }

      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        },
      }
    })

    process.env.MCP_HTTP_TOKEN = 'token-from-env'

    await writeConfig({
      mcpServers: {
        remote: {
          url: httpServer.url,
          auth: 'bearer',
          bearerTokenEnv: 'MCP_HTTP_TOKEN',
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('connected')
    expect(response.status?.toolNames).toEqual(['search', 'lookup'])

    const initializeRequest = httpServer.requests.find((request) => request.body?.method === 'initialize')
    expect(initializeRequest?.headers.authorization).toBe('Bearer token-from-env')

    delete process.env.MCP_HTTP_TOKEN
    await httpServer.close()
  })

  test('returns missing-bearer-token when HTTP bearer auth has no token source', async () => {
    await writeConfig({
      mcpServers: {
        remote: {
          url: 'https://example.invalid/mcp',
          auth: 'bearer',
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('MISSING_BEARER_TOKEN')
  })

  test('returns connection-failed when HTTP initialize returns JSON-RPC error', async () => {
    const httpServer = await startJsonRpcHttpServer((request) => {
      if (request.method === 'initialize') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32000,
              message: 'initialize failed',
            },
          },
        }
      }

      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        },
      }
    })

    await writeConfig({
      mcpServers: {
        remote: {
          url: httpServer.url,
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('CONNECTION_FAILED')
    expect(response.status?.error?.message).toContain('initialize failed')

    await httpServer.close()
  })

  test('returns connection-failed when HTTP tools/list returns JSON-RPC error', async () => {
    const httpServer = await startJsonRpcHttpServer((request) => {
      if (request.method === 'initialize') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              serverInfo: {
                name: 'fixture-http',
                version: '1.0.0',
              },
            },
          },
        }
      }

      if (request.method === 'tools/list') {
        return {
          body: {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32001,
              message: 'tools unavailable',
            },
          },
        }
      }

      return {
        body: {
          jsonrpc: '2.0',
          id: request.id,
          result: {},
        },
      }
    })

    await writeConfig({
      mcpServers: {
        remote: {
          url: httpServer.url,
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('CONNECTION_FAILED')
    expect(response.status?.error?.message).toContain('tools unavailable')

    await httpServer.close()
  })

  test('returns unreachable when HTTP endpoint returns non-200 status', async () => {
    const httpServer = await startJsonRpcHttpServer(() => ({
      status: 500,
      body: {
        message: 'boom',
      },
    }))

    await writeConfig({
      mcpServers: {
        remote: {
          url: httpServer.url,
        },
      },
    })

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('UNREACHABLE')

    await httpServer.close()
  })

  test('returns timeout when fetch throws timeout-like errors', async () => {
    await writeConfig({
      mcpServers: {
        remote: {
          url: 'https://example.invalid/mcp',
        },
      },
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('timeout while connecting'))

    const service = createService(3_000)
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('TIMEOUT')

    fetchSpy.mockRestore()
  })

  function createService(timeoutMs: number): McpService {
    const configBridge = new McpConfigBridge({ configPath })
    return new McpService({ configBridge, requestTimeoutMs: timeoutMs })
  }

  async function writeConfig(value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(value, null, 2), 'utf8')
  }
})

interface JsonRpcRequest {
  method?: string
  id?: number
  params?: unknown
}

interface HttpScenarioResponse {
  status?: number
  body?: unknown
  delayMs?: number
}

interface RecordedRequest {
  headers: IncomingHttpHeaders
  body: JsonRpcRequest | null
}

async function startJsonRpcHttpServer(
  handler: (request: JsonRpcRequest) => HttpScenarioResponse,
): Promise<{
  url: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}> {
  const requests: RecordedRequest[] = []

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')
    const parsedBody = rawBody ? (JSON.parse(rawBody) as JsonRpcRequest) : null

    requests.push({
      headers: req.headers,
      body: parsedBody,
    })

    const scenario = handler(parsedBody ?? {})
    const status = scenario.status ?? 200
    const body = scenario.body ?? {}

    if (scenario.delayMs && scenario.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, scenario.delayMs))
    }

    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve HTTP server address')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
  }
}

const MCP_STDIO_FIXTURE_SERVER = `
import process from 'node:process'

const mode = process.argv[2] ?? 'ok'

if (mode === 'exit') {
  process.exit(1)
}

let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  while (buffer.length > 0) {
    const separatorIndex = buffer.indexOf('\\r\\n\\r\\n')
    if (separatorIndex === -1) {
      return
    }

    const headers = buffer.slice(0, separatorIndex).toString('utf8')
    const lengthMatch = headers.match(/Content-Length:\\s*(\\d+)/i)
    if (!lengthMatch) {
      buffer = Buffer.alloc(0)
      return
    }

    const bodyLength = Number(lengthMatch[1])
    const frameLength = separatorIndex + 4 + bodyLength
    if (buffer.length < frameLength) {
      return
    }

    const body = buffer.slice(separatorIndex + 4, frameLength).toString('utf8')
    buffer = buffer.slice(frameLength)

    const message = JSON.parse(body)

    if (message.method === 'initialize') {
      if (mode === 'timeout') {
        continue
      }

      if (mode === 'initialize-error') {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32000,
            message: 'initialize failed',
          },
        })
        continue
      }

      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: {
            name: 'fixture-mcp-server',
            version: '1.0.0',
          },
        },
      })
      continue
    }

    if (message.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            { name: 'echo' },
            { name: 'ping' },
          ],
        },
      })
      continue
    }

    if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32601,
          message: 'Method not found',
        },
      })
    }
  }
})

function send(payload) {
  const body = JSON.stringify(payload)
  const frame = 'Content-Length: ' + Buffer.byteLength(body, 'utf8') + '\\r\\n\\r\\n' + body
  process.stdout.write(frame)
}
`
