import { describe, expect, test } from 'vitest'
import { createMcpServerEditorDraft, parseArgs, validateMcpServerDraft } from '../McpServerEditorDialog'
import { formatMcpProvenanceLabel, formatMcpReliabilityNotice } from '../McpServerPanel'
import {
  formatMcpStatusLabel,
  mcpStatusBadgeVariant,
  summarizeMcpServer,
} from '../McpServerRow'

describe('MCP settings helpers', () => {
  test('formats provenance labels with overlay awareness', () => {
    expect(formatMcpProvenanceLabel('global_only')).toBe('Global shared config')
    expect(formatMcpProvenanceLabel('overlay_present')).toBe('Global config (overlay detected)')
    expect(formatMcpProvenanceLabel(undefined)).toBe('Global shared config')
  })

  test('formats MCP reliability notices with shared recovery language', () => {
    const notice = formatMcpReliabilityNotice({
      code: 'REL-MCP-CONFIG-MALFORMED_CONFIG',
      class: 'config',
      severity: 'warning',
      sourceSurface: 'mcp',
      recoveryAction: 'fix_config',
      outcome: 'pending',
      message: 'Invalid JSON in mcp.json',
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    expect(notice).toContain('Invalid JSON in mcp.json')
    expect(notice).toContain('Recommended recovery: Fix configuration.')
  })

  test('summarizes stdio and http server rows for compact display', () => {
    expect(
      summarizeMcpServer({
        name: 'local',
        transport: 'stdio',
        enabled: true,
        summary: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'mcp-remote'],
          envKeys: [],
        },
      }),
    ).toBe('npx -y mcp-remote')

    expect(
      summarizeMcpServer({
        name: 'remote',
        transport: 'http',
        enabled: true,
        summary: {
          transport: 'http',
          url: 'https://example.com/mcp',
          auth: 'none',
          hasInlineBearerToken: false,
        },
      }),
    ).toBe('https://example.com/mcp')
  })

  test('maps status labels and badge variants for connected/error/unknown states', () => {
    expect(formatMcpStatusLabel(undefined)).toBe('Not checked')
    expect(mcpStatusBadgeVariant(undefined)).toBe('outline')

    expect(
      formatMcpStatusLabel({
        serverName: 'local',
        phase: 'connected',
        checkedAt: new Date().toISOString(),
        toolNames: ['read'],
        toolCount: 1,
      }),
    ).toBe('Connected')

    expect(
      mcpStatusBadgeVariant({
        serverName: 'local',
        phase: 'connected',
        checkedAt: new Date().toISOString(),
        toolNames: ['read'],
        toolCount: 1,
      }),
    ).toBe('default')

    expect(
      formatMcpStatusLabel({
        serverName: 'local',
        phase: 'error',
        checkedAt: new Date().toISOString(),
        toolNames: [],
        toolCount: 0,
        error: {
          code: 'CONNECTION_FAILED',
          message: 'Unable to connect',
        },
      }),
    ).toBe('CONNECTION_FAILED')
  })

  test('builds editor drafts with redacted hints for existing servers', () => {
    const stdioDraft = createMcpServerEditorDraft({
      name: 'local',
      transport: 'stdio',
      enabled: true,
      summary: {
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        envKeys: ['API_KEY'],
      },
    })

    const quotedArgsDraft = createMcpServerEditorDraft({
      name: 'quoted',
      transport: 'stdio',
      enabled: true,
      summary: {
        transport: 'stdio',
        command: 'node',
        args: ['--path', 'C:\\Program Files\\MCP Server\\entry.mjs', '--label="alpha beta"'],
        envKeys: [],
      },
    })

    expect(stdioDraft.name).toBe('local')
    expect(stdioDraft.command).toBe('node')
    expect(stdioDraft.envKeyHints).toEqual(['API_KEY'])

    expect(quotedArgsDraft.argsText).toBe('--path "C:\\Program Files\\MCP Server\\entry.mjs" "--label=\\"alpha beta\\""')

    const httpDraft = createMcpServerEditorDraft({
      name: 'remote',
      transport: 'http',
      enabled: true,
      summary: {
        transport: 'http',
        url: 'https://example.com/mcp',
        auth: 'bearer',
        bearerTokenEnv: 'MCP_TOKEN',
        hasInlineBearerToken: true,
      },
    })

    expect(httpDraft.transport).toBe('http')
    expect(httpDraft.bearerToken).toBe('')
    expect(httpDraft.bearerTokenEnv).toBe('MCP_TOKEN')
    expect(httpDraft.hasStoredInlineBearerToken).toBe(true)
  })

  test('parses quoted argument text without splitting embedded spaces', () => {
    const parsed = parseArgs('--path "C:\\Program Files\\MCP Server\\entry.mjs" --name "alpha beta"')

    expect(parsed).toEqual(['--path', 'C:\\Program Files\\MCP Server\\entry.mjs', '--name', 'alpha beta'])
  })

  test('validates transport-aware editor requirements', () => {
    expect(
      validateMcpServerDraft({
        ...createMcpServerEditorDraft(),
        transport: 'stdio',
      }),
    ).toContain('Server name is required.')

    expect(
      validateMcpServerDraft({
        ...createMcpServerEditorDraft(),
        name: 'remote',
        transport: 'http',
        url: 'notaurl',
      }),
    ).toContain('URL must be valid.')

    expect(
      validateMcpServerDraft({
        ...createMcpServerEditorDraft(),
        name: 'remote',
        transport: 'http',
        url: 'https://example.com/mcp',
        auth: 'bearer',
      }),
    ).toContain('Bearer auth requires a token or token env key.')

    expect(
      validateMcpServerDraft({
        ...createMcpServerEditorDraft(),
        name: 'remote',
        transport: 'http',
        url: 'https://example.com/mcp',
        auth: 'bearer',
        hasStoredInlineBearerToken: true,
      }),
    ).toEqual([])
  })
})
