import { mkdtempSync, rmSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
    vi.restoreAllMocks()
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

  test('surfaces invalid top-level config shape as malformed error', async () => {
    await writeConfig(['not-an-object'])

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('MALFORMED_CONFIG')
    expect(response.error?.message).toContain('Top-level MCP config must be a JSON object')
  })

  test('redacts env values and inline bearer tokens from renderer summaries', async () => {
    await writeConfig({
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
    })

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
    await writeConfig({
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
    })

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

  test('getServer returns server_not_found for unknown entries', async () => {
    const bridge = new McpConfigBridge({ configPath })

    const response = await bridge.getServer('missing-server')

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('SERVER_NOT_FOUND')
  })

  test('getServer returns http summary with default auth and disabled flag', async () => {
    await writeConfig({
      mcpServers: {
        httpRemote: {
          url: 'https://example.com/mcp',
          disabled: true,
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.getServer('httpRemote')

    expect(response.success).toBe(true)
    expect(response.server?.enabled).toBe(false)
    expect(response.server?.summary.transport).toBe('http')
    if (response.server?.summary.transport === 'http') {
      expect(response.server.summary.auth).toBe('none')
      expect(response.server.summary.url).toBe('https://example.com/mcp')
      expect(response.server.summary.hasInlineBearerToken).toBe(false)
    }
  })

  test('saveServer returns validation errors for invalid payloads', async () => {
    const bridge = new McpConfigBridge({ configPath })

    const stdioValidation = await bridge.saveServer({
      name: 'bad name with spaces',
      transport: 'stdio',
      command: '   ',
    })

    expect(stdioValidation.success).toBe(false)
    expect(stdioValidation.error?.code).toBe('VALIDATION_FAILED')
    expect(stdioValidation.validationErrors?.map((error) => error.field)).toEqual(expect.arrayContaining(['name', 'command']))

    const httpValidation = await bridge.saveServer({
      name: 'remote',
      transport: 'http',
      url: 'ftp://example.com',
      auth: 'bearer',
      bearerToken: '   ',
      bearerTokenEnv: '   ',
    })

    expect(httpValidation.success).toBe(false)
    expect(httpValidation.validationErrors?.map((error) => error.field)).toEqual(expect.arrayContaining(['url', 'bearer']))
  })

  test('saveServer normalizes stdio servers and strips http-only fields', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'node',
          args: ['old.js'],
          url: 'https://old.example.com/mcp',
          auth: 'bearer',
          bearerToken: 'old-token',
          bearerTokenEnv: 'OLD_TOKEN',
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.saveServer({
      name: 'local',
      transport: 'stdio',
      command: 'node',
      args: [' index.mjs ', '', ' --verbose '],
      env: {
        '': 'drop-me',
        API_KEY: 'secret',
      },
      cwd: '  ',
      enabled: false,
    })

    expect(response.success).toBe(true)
    expect(response.server?.enabled).toBe(false)

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }

    expect(persisted.mcpServers.local?.command).toBe('node')
    expect(persisted.mcpServers.local?.args).toEqual(['index.mjs', '--verbose'])
    expect(persisted.mcpServers.local?.disabled).toBe(true)
    expect(persisted.mcpServers.local?.env).toEqual({ API_KEY: 'secret' })
    expect(persisted.mcpServers.local?.cwd).toBeUndefined()
    expect(persisted.mcpServers.local?.url).toBeUndefined()
    expect(persisted.mcpServers.local?.auth).toBeUndefined()
    expect(persisted.mcpServers.local?.bearerToken).toBeUndefined()
    expect(persisted.mcpServers.local?.bearerTokenEnv).toBeUndefined()
  })

  test('toServerSummary surfaces directTools as boolean and allowlist forms', async () => {
    await writeConfig({
      mcpServers: {
        promoted: {
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp@latest'],
          directTools: true,
        },
        proxied: {
          command: 'npx',
          args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
          directTools: false,
        },
        allowlisted: {
          command: 'npx',
          args: ['-y', 'some-server'],
          directTools: ['search_repositories', 'get_file_contents'],
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()

    expect(response.success).toBe(true)
    const byName = new Map((response.servers ?? []).map((server) => [server.name, server] as const))
    expect(byName.get('promoted')?.directTools).toBe(true)
    expect(byName.get('proxied')?.directTools).toBe(false)
    expect(byName.get('allowlisted')?.directTools).toEqual(['search_repositories', 'get_file_contents'])
  })

  test('saveServer preserves existing directTools when input omits it', async () => {
    await writeConfig({
      mcpServers: {
        linear: {
          command: 'npx',
          args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
          directTools: false,
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.saveServer({
      name: 'linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
      enabled: true,
      // directTools intentionally omitted — caller has no opinion
    })

    expect(response.success).toBe(true)

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(persisted.mcpServers.linear?.directTools).toBe(false)
  })

  test('saveServer applies directTools when the input explicitly sets it', async () => {
    await writeConfig({
      mcpServers: {
        linear: {
          command: 'npx',
          args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const allowlistResponse = await bridge.saveServer({
      name: 'linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
      enabled: true,
      directTools: ['linear_list_issues'],
    })
    expect(allowlistResponse.success).toBe(true)

    let persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(persisted.mcpServers.linear?.directTools).toEqual(['linear_list_issues'])

    const promotedResponse = await bridge.saveServer({
      name: 'linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
      enabled: true,
      directTools: true,
    })
    expect(promotedResponse.success).toBe(true)

    persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(persisted.mcpServers.linear?.directTools).toBe(true)

    // Setting to false removes the field entirely — no mcp.json noise.
    const proxyResponse = await bridge.saveServer({
      name: 'linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp'],
      enabled: true,
      directTools: false,
    })
    expect(proxyResponse.success).toBe(true)

    persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(persisted.mcpServers.linear?.directTools).toBeUndefined()
  })

  test('toServerSummary trims whitespace from directTools allowlist entries', async () => {
    await writeConfig({
      mcpServers: {
        messy: {
          command: 'npx',
          args: ['-y', 'some-server'],
          directTools: ['  search_repositories  ', '', 'get_file_contents\n', '   '],
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()
    expect(response.success).toBe(true)
    const server = (response.servers ?? []).find((s) => s.name === 'messy')
    expect(server?.directTools).toEqual(['search_repositories', 'get_file_contents'])
  })

  test('saveServer round-trips an empty directTools allowlist as [] (promote none)', async () => {
    await writeConfig({
      mcpServers: {
        proxy_mode: {
          command: 'npx',
          args: ['-y', 'some-server'],
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const saveResponse = await bridge.saveServer({
      name: 'proxy_mode',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'some-server'],
      enabled: true,
      directTools: [],
    })
    expect(saveResponse.success).toBe(true)

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    expect(persisted.mcpServers.proxy_mode?.directTools).toEqual([])

    const roundTrip = await bridge.listServers()
    const server = (roundTrip.servers ?? []).find((s) => s.name === 'proxy_mode')
    expect(server?.directTools).toEqual([])
  })

  test('saveServer allows bearer updates without re-entering an existing inline token', async () => {
    await writeConfig({
      mcpServers: {
        remote: {
          url: 'https://mcp.example.com',
          auth: 'bearer',
          bearerToken: 'existing-inline-token',
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.saveServer({
      name: 'remote',
      transport: 'http',
      url: 'https://mcp.example.com/v2',
      auth: 'bearer',
      bearerTokenEnv: '   ',
    })

    expect(response.success).toBe(true)
    if (response.success && response.server?.summary.transport === 'http') {
      expect(response.server.summary.hasInlineBearerToken).toBe(true)
      expect(response.server.summary.auth).toBe('bearer')
    }

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }

    expect(persisted.mcpServers.remote?.url).toBe('https://mcp.example.com/v2')
    expect(persisted.mcpServers.remote?.bearerToken).toBe('existing-inline-token')
    expect(persisted.mcpServers.remote?.bearerTokenEnv).toBeUndefined()
  })

  test('saveServer normalizes http servers and strips stdio-only fields', async () => {
    await writeConfig({
      mcpServers: {
        remote: {
          command: 'node',
          args: ['stdio.js'],
          cwd: '/tmp/work',
          env: {
            TOKEN: 'secret',
          },
          auth: 'none',
          customField: 'preserve-me',
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })
    const firstSave = await bridge.saveServer({
      name: 'remote',
      transport: 'http',
      url: 'https://mcp.example.com',
      auth: 'bearer',
      bearerTokenEnv: ' MCP_TOKEN ',
      enabled: true,
    })

    expect(firstSave.success).toBe(true)
    if (firstSave.success && firstSave.server?.summary.transport === 'http') {
      expect(firstSave.server.summary.auth).toBe('bearer')
      expect(firstSave.server.summary.bearerTokenEnv).toBe('MCP_TOKEN')
    }

    const secondSave = await bridge.saveServer({
      name: 'remote',
      transport: 'http',
      url: 'https://mcp.example.com/v2',
      auth: 'none',
      bearerTokenEnv: '   ',
      bearerToken: '   ',
    })

    expect(secondSave.success).toBe(true)

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }

    expect(persisted.mcpServers.remote?.url).toBe('https://mcp.example.com/v2')
    expect(persisted.mcpServers.remote?.auth).toBe('none')
    expect(persisted.mcpServers.remote?.customField).toBe('preserve-me')
    expect(persisted.mcpServers.remote?.command).toBeUndefined()
    expect(persisted.mcpServers.remote?.args).toBeUndefined()
    expect(persisted.mcpServers.remote?.env).toBeUndefined()
    expect(persisted.mcpServers.remote?.cwd).toBeUndefined()
    expect(persisted.mcpServers.remote?.bearerToken).toBeUndefined()
    expect(persisted.mcpServers.remote?.bearerTokenEnv).toBeUndefined()
  })

  test('deleteServer removes an existing server and returns not-found for unknown entries', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'node',
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })

    const missing = await bridge.deleteServer('missing')
    expect(missing.success).toBe(false)
    expect(missing.error?.code).toBe('SERVER_NOT_FOUND')

    const deleted = await bridge.deleteServer('local')
    expect(deleted.success).toBe(true)
    expect(deleted.deletedServerName).toBe('local')

    const persisted = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
      mcpServers: Record<string, unknown>
    }
    expect(persisted.mcpServers).toEqual({})
  })

  test('getRuntimeServer returns unredacted stdio and http details', async () => {
    await writeConfig({
      mcpServers: {
        local: {
          command: 'node',
          args: ['server.js'],
          cwd: '/tmp/work',
          env: {
            API_KEY: 'secret-value',
          },
        },
        remote: {
          url: 'https://mcp.example.com',
          auth: 'bearer',
          bearerToken: 'inline-token',
          bearerTokenEnv: 'MCP_TOKEN_ENV',
        },
      },
    })

    const bridge = new McpConfigBridge({ configPath })

    const stdioRuntime = await bridge.getRuntimeServer('local')
    expect(stdioRuntime.success).toBe(true)
    if (stdioRuntime.success && stdioRuntime.server.transport === 'stdio') {
      expect(stdioRuntime.server.env).toEqual({ API_KEY: 'secret-value' })
      expect(stdioRuntime.server.cwd).toBe('/tmp/work')
    }

    const httpRuntime = await bridge.getRuntimeServer('remote')
    expect(httpRuntime.success).toBe(true)
    if (httpRuntime.success && httpRuntime.server.transport === 'http') {
      expect(httpRuntime.server.bearerToken).toBe('inline-token')
      expect(httpRuntime.server.bearerTokenEnv).toBe('MCP_TOKEN_ENV')
      expect(httpRuntime.server.auth).toBe('bearer')
    }

    const missingRuntime = await bridge.getRuntimeServer('missing')
    expect(missingRuntime.success).toBe(false)
    if (!missingRuntime.success) {
      expect(missingRuntime.error.code).toBe('SERVER_NOT_FOUND')
    }
  })

  test('returns CONFIG_UNREADABLE when config path cannot be read', async () => {
    await fs.mkdir(configPath, { recursive: true })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.listServers()

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('CONFIG_UNREADABLE')
  })

  test('returns WRITE_FAILED when filesystem write fails', async () => {
    await writeConfig({ mcpServers: {} })

    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'))

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.saveServer({
      name: 'local',
      transport: 'stdio',
      command: 'node',
    })

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('WRITE_FAILED')
    expect(response.error?.message).toContain('rename failed')

    renameSpy.mockRestore()
  })

  test('returns READBACK_FAILED when written config cannot be parsed on readback', async () => {
    await writeConfig({ mcpServers: {} })

    const originalReadFile = fs.readFile.bind(fs)
    let configReadCount = 0

    const readSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (...args: any[]) => {
      const filePath = args[0]
      if (typeof filePath === 'string' && path.resolve(filePath) === path.resolve(configPath)) {
        configReadCount += 1
        if (configReadCount >= 2) {
          return '{bad-json'
        }
      }

      return (await originalReadFile(...(args as Parameters<typeof fs.readFile>))) as any
    })

    const bridge = new McpConfigBridge({ configPath })
    const response = await bridge.saveServer({
      name: 'local',
      transport: 'stdio',
      command: 'node',
    })

    expect(response.success).toBe(false)
    expect(response.error?.code).toBe('READBACK_FAILED')

    readSpy.mockRestore()
  })

  async function writeConfig(value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(value, null, 2), 'utf8')
  }
})
