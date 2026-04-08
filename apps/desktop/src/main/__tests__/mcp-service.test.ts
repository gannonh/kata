import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { McpConfigBridge } from '../mcp-config-bridge'
import { McpService } from '../mcp-service'

describe('McpService', () => {
  let tempDir: string
  let configPath: string

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-mcp-service-'))
    configPath = path.join(tempDir, 'agent', 'mcp.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeConfig(config: unknown): Promise<void> {
    return fs.writeFile(configPath, JSON.stringify(config), 'utf8')
  }

  function createService(): McpService {
    const bridge = new McpConfigBridge({ configPath })
    return new McpService({ configBridge: bridge })
  }

  test('refreshStatus returns configured for valid enabled stdio server', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'npx',
          args: ['-y', 'some-mcp-server'],
        },
      },
    })

    const service = createService()
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('configured')
    expect(response.status?.serverName).toBe('local')
    expect(response.status?.toolNames).toEqual([])
    expect(response.status?.toolCount).toBe(0)
  })

  test('refreshStatus returns configured for valid enabled HTTP server', async () => {
    await writeConfig({
      mcpServers: {
        remote: {
          url: 'https://example.com/mcp',
          auth: 'bearer',
          bearerTokenEnv: 'TEST_TOKEN',
        },
      },
    })

    const service = createService()
    const response = await service.refreshStatus('remote')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('configured')
    expect(response.status?.serverName).toBe('remote')
  })

  test('reconnectServer returns same result as refreshStatus', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'npx',
          args: ['-y', 'some-mcp-server'],
        },
      },
    })

    const service = createService()
    const refresh = await service.refreshStatus('local')
    const reconnect = await service.reconnectServer('local')

    expect(reconnect.success).toBe(refresh.success)
    expect(reconnect.status?.serverName).toBe(refresh.status?.serverName)
    expect(reconnect.status?.phase).toBe(refresh.status?.phase)
    expect(reconnect.status?.toolNames).toEqual(refresh.status?.toolNames)
    expect(reconnect.status?.toolCount).toBe(refresh.status?.toolCount)
  })

  test('returns malformed-config status when config is invalid JSON', async () => {
    await fs.writeFile(configPath, '{bad-json', 'utf8')

    const service = createService()
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(false)
    expect(response.status?.phase).toBe('error')
    expect(response.status?.error?.code).toBe('MALFORMED_CONFIG')
  })

  test('returns unsupported when server is disabled', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'npx',
          args: ['-y', 'some-server'],
          disabled: true,
        },
      },
    })

    const service = createService()
    const response = await service.refreshStatus('local')

    expect(response.success).toBe(true)
    expect(response.status?.phase).toBe('unsupported')
  })

  test('returns server-not-found when runtime server is missing', async () => {
    await writeConfig({ mcpServers: {} })

    const service = createService()
    const response = await service.refreshStatus('missing')

    expect(response.success).toBe(false)
    expect(response.status?.error?.code).toBe('SERVER_NOT_FOUND')
  })

  test('exposes canonical MCP reliability signal for config/status failures', async () => {
    await fs.writeFile(configPath, '{bad-json', 'utf8')

    const service = createService()
    await service.refreshStatus('local')

    const reliability = service.getReliabilitySignal()
    expect(reliability?.sourceSurface).toBe('mcp')
    expect(reliability?.class).toBe('config')
    expect(reliability?.recoveryAction).toBe('fix_config')
    expect(reliability?.code).toBe('REL-MCP-CONFIG-MALFORMED_CONFIG')
  })

  test('aggregates reliability across servers instead of last-write wins', async () => {
    const serverState = {
      broken: true,
    }

    const configBridge = {
      getRuntimeServer: vi.fn(async (serverName: string) => {
        if (serverName === 'broken' && serverState.broken) {
          return {
            success: false,
            error: {
              code: 'MALFORMED_CONFIG',
              message: 'Invalid config',
            },
          }
        }

        return {
          success: true,
          server: {
            name: serverName,
            enabled: true,
          },
        }
      }),
    } as any

    const service = new McpService({ configBridge })

    await service.refreshStatus('broken')
    expect(service.getReliabilitySignal()?.code).toBe('REL-MCP-CONFIG-MALFORMED_CONFIG')

    await service.refreshStatus('healthy')
    expect(service.getReliabilitySignal()?.code).toBe('REL-MCP-CONFIG-MALFORMED_CONFIG')

    serverState.broken = false
    await service.refreshStatus('broken')
    expect(service.getReliabilitySignal()).toBeNull()
  })

  test('does not fold MCP server connectivity errors into accessibility violation counts', async () => {
    await writeConfig({
      mcpServers: {
        broken: {
          command: 'node',
        },
      },
    })

    const service = createService()

    await fs.writeFile(configPath, '{bad-json', 'utf8')
    await service.refreshStatus('broken')

    service.recordAccessibilityViolationCounts({ serious: 0, critical: 0 })
    const metrics = service.getStabilityMetrics()

    expect(metrics.a11yViolationCounts).toEqual({
      minor: 0,
      moderate: 0,
      serious: 0,
      critical: 0,
    })
    expect(metrics.collectedAt).toBeTruthy()
  })
})
