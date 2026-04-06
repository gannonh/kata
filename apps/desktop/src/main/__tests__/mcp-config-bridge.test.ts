import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { McpConfigBridge } from '../mcp-config-bridge'

describe('McpConfigBridge', () => {
  let tempDir: string
  let workspaceDir: string
  let configPath: string

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'kata-desktop-mcp-bridge-'))
    workspaceDir = path.join(tempDir, 'workspace')
    configPath = path.join(tempDir, 'agent', 'mcp.json')

    await fs.mkdir(workspaceDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns starter defaults when config file does not exist', async () => {
    const bridge = new McpConfigBridge({
      configPath,
      getWorkspacePath: () => workspaceDir,
    })

    const response = await bridge.listServers()

    expect(response.success).toBe(true)
    expect(response.servers).toEqual([])
    expect(response.provenance.mode).toBe('global_only')
    expect(response.provenance.globalConfigPath).toBe(configPath)
  })

  test('surfaces malformed config as typed error', async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, '{not-json', 'utf8')

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('MALFORMED_CONFIG')
    expect(response.servers).toEqual([])
  })

  test('redacts env values and inline bearer tokens from renderer summaries', async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            local: {
              command: 'node',
              args: ['server.js'],
              env: {
                SECRET_KEY: 'hidden',
                PUBLIC_FLAG: 'true',
              },
            },
            remote: {
              url: 'https://mcp.example.com',
              auth: 'bearer',
              bearerToken: 'super-secret-token',
              bearerTokenEnv: 'MCP_TOKEN',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()

    expect(response.success).toBe(true)

    const local = response.servers.find((server) => server.name === 'local')
    expect(local?.summary.transport).toBe('stdio')
    if (local?.summary.transport === 'stdio') {
      expect(local.summary.envKeys).toEqual(['PUBLIC_FLAG', 'SECRET_KEY'])
      expect('env' in local.summary).toBe(false)
    }

    const remote = response.servers.find((server) => server.name === 'remote')
    expect(remote?.summary.transport).toBe('http')
    if (remote?.summary.transport === 'http') {
      expect(remote.summary.hasInlineBearerToken).toBe(true)
      expect(remote.summary.bearerTokenEnv).toBe('MCP_TOKEN')
      expect('bearerToken' in remote.summary).toBe(false)
    }
  })

  test('preserves unknown fields during save and verifies readback', async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          settings: {
            toolPrefix: 'server',
            idleTimeout: 10,
            customSetting: 'preserve-me',
          },
          mcpServers: {
            local: {
              command: 'node',
              args: ['old.js'],
              metadata: {
                owner: 'desktop-team',
              },
            },
          },
          customTopLevel: {
            keep: true,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const bridge = new McpConfigBridge({ configPath })
    const saveResponse = await bridge.saveServer({
      name: 'local',
      transport: 'stdio',
      command: 'node',
      args: ['new.js'],
      enabled: true,
    })

    expect(saveResponse.success).toBe(true)

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      settings: Record<string, unknown>
      mcpServers: Record<string, Record<string, unknown>>
      customTopLevel: Record<string, unknown>
    }

    expect(persisted.settings.customSetting).toBe('preserve-me')
    expect(persisted.customTopLevel.keep).toBe(true)
    const persistedLocalServer = persisted.mcpServers.local
    expect(persistedLocalServer).toBeDefined()
    expect(persistedLocalServer?.metadata).toEqual({ owner: 'desktop-team' })
    expect(persistedLocalServer?.args).toEqual(['new.js'])
  })

  test('reports overlay provenance when project-local overlay exists', async () => {
    await fs.mkdir(path.join(workspaceDir, '.kata-cli'), { recursive: true })
    await fs.writeFile(path.join(workspaceDir, '.kata-cli', 'mcp.json'), '{"mcpServers":{}}\n', 'utf8')

    const bridge = new McpConfigBridge({
      configPath,
      getWorkspacePath: () => workspaceDir,
    })

    const response = await bridge.listServers()

    expect(response.success).toBe(true)
    expect(response.provenance.mode).toBe('overlay_present')
    expect(response.provenance.overlayConfigPath).toBe(path.join(workspaceDir, '.kata-cli', 'mcp.json'))
    expect(response.provenance.warning).toContain('Desktop only edits the shared global MCP config')
  })
})
