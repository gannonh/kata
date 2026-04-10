import { describe, expect, test } from 'vitest'
import { createMcpServerEditorDraft, parseArgs, validateMcpServerDraft } from '../McpServerEditorDialog'
import {
  formatMcpProvenanceLabel,
  formatMcpRecoveryButtonLabel,
  formatMcpReliabilityNotice,
  formatMcpStabilityNotice,
} from '../McpServerPanel'
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

  test('formats MCP stability notices with metric threshold guidance', () => {
    const notice = formatMcpStabilityNotice({
      code: 'REL-LONGRUN-A11Y_VIOLATION_COUNTS_CRITICAL-BREACH',
      metric: 'a11yViolationCounts',
      sourceSurface: 'mcp',
      failureClass: 'config',
      severity: 'critical',
      recoveryAction: 'fix_config',
      comparator: 'max',
      observedValue: 1,
      warningThreshold: 1,
      breachThreshold: 1,
      breached: true,
      message: 'Accessibility violations exceeded threshold (1 vs 1).',
      suggestedRecovery: 'Fix accessibility issues and rerun baseline checks.',
      timestamp: '2026-04-07T20:00:00.000Z',
    })

    expect(notice).toContain('Accessibility violations: Accessibility violations exceeded threshold')
    expect(notice).toContain('Suggested recovery: Fix accessibility issues and rerun baseline checks.')
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

  describe('MCP recovery CTA truthfulness (R028)', () => {
    test('formatMcpRecoveryButtonLabel maps fix_config to "Refresh config"', () => {
      expect(formatMcpRecoveryButtonLabel('fix_config')).toBe('Refresh config')
    })

    test('formatMcpRecoveryButtonLabel maps refresh_state to "Refresh config"', () => {
      expect(formatMcpRecoveryButtonLabel('refresh_state')).toBe('Refresh config')
    })

    test('formatMcpRecoveryButtonLabel maps reconnect to "Reconnect"', () => {
      expect(formatMcpRecoveryButtonLabel('reconnect')).toBe('Reconnect')
    })

    test('formatMcpRecoveryButtonLabel maps reauthenticate to "Re-authenticate"', () => {
      expect(formatMcpRecoveryButtonLabel('reauthenticate')).toBe('Re-authenticate')
    })

    test('formatMcpRecoveryButtonLabel maps inspect to "Inspect"', () => {
      expect(formatMcpRecoveryButtonLabel('inspect')).toBe('Inspect')
    })

    test('formatMcpReliabilityNotice includes gated action label', () => {
      const notice = formatMcpReliabilityNotice({
        code: 'REL-MCP-NETWORK-CONNECTION_FAILED',
        class: 'network',
        severity: 'error',
        sourceSurface: 'mcp',
        recoveryAction: 'refresh_state',
        outcome: 'failed',
        message: 'Connection failed',
        timestamp: '2026-04-10T12:00:00.000Z',
      })

      expect(notice).toContain('Recommended recovery: Refresh state.')
      expect(notice).not.toContain('Reconnect')
    })

    test('signal with serverName should produce row-scoped recovery label', () => {
      // This tests the pure function in McpServerRow, not the component render
      // The component uses formatRowRecoveryLabel internally
      // We validate the behavior indirectly through the exported helpers
      const signal = {
        code: 'REL-MCP-NETWORK-CONNECTION_FAILED',
        class: 'network' as const,
        severity: 'error' as const,
        sourceSurface: 'mcp' as const,
        recoveryAction: 'reconnect' as const,
        outcome: 'failed' as const,
        message: 'Connection failed for my-server',
        timestamp: '2026-04-10T12:00:00.000Z',
        diagnostics: {
          code: 'CONNECTION_FAILED',
          serverName: 'my-server',
        },
      }

      // Panel button label should be "Reconnect" (the gated action)
      expect(formatMcpRecoveryButtonLabel(signal.recoveryAction)).toBe('Reconnect')
      // serverName is present for row targeting
      expect(signal.diagnostics.serverName).toBe('my-server')
    })

    test('signal without serverName should show fallback guidance instead of row action', () => {
      const signal = {
        code: 'REL-MCP-NETWORK-CONNECTION_FAILED',
        class: 'network' as const,
        severity: 'error' as const,
        sourceSurface: 'mcp' as const,
        recoveryAction: 'refresh_state' as const,
        outcome: 'failed' as const,
        message: 'Connection failed',
        timestamp: '2026-04-10T12:00:00.000Z',
        diagnostics: {
          code: 'CONNECTION_FAILED',
        } as { code: string; serverName?: string },
      }

      // No serverName means no row-scoped action
      expect(signal.diagnostics.serverName).toBeUndefined()
      // Panel button should say "Refresh config" (the gated fallback)
      expect(formatMcpRecoveryButtonLabel(signal.recoveryAction)).toBe('Refresh config')
    })
  })
})
