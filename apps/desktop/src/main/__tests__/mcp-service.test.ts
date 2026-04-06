import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
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
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('refreshStatus connects to local stdio server and returns tool list', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            local: {
              command: process.execPath,
              args: [fixtureScriptPath],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const configBridge = new McpConfigBridge({ configPath })
    const service = new McpService({ configBridge, requestTimeoutMs: 5_000 })

    const response = await service.refreshStatus('local')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('connected')
    expect(response.status?.toolNames).toEqual(['echo', 'ping'])
    expect(response.status?.toolCount).toBe(2)
  })

  test('returns malformed-config status when config is invalid JSON', async () => {
    await fs.writeFile(configPath, '{bad-json', 'utf8')

    const configBridge = new McpConfigBridge({ configPath })
    const service = new McpService({ configBridge, requestTimeoutMs: 3_000 })

    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('MALFORMED_CONFIG')
  })

  test('returns command-not-found status for unreachable stdio command', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            unreachable: {
              command: 'not-a-real-command-xyz',
              args: [],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const configBridge = new McpConfigBridge({ configPath })
    const service = new McpService({ configBridge, requestTimeoutMs: 3_000 })

    const response = await service.reconnectServer('unreachable')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('COMMAND_NOT_FOUND')
  })
})

const MCP_STDIO_FIXTURE_SERVER = `
import process from 'node:process'

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
