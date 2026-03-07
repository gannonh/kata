/**
 * Tests for daemon permission mode.
 *
 * Daemon mode uses an allowlist (not a blocklist) to restrict tool access.
 * Only explicitly permitted tools can run. This mode is not user-cycleable
 * via SHIFT+TAB and is intended for background daemon sessions.
 */

import { describe, it, expect } from 'bun:test'
import { shouldAllowToolInMode } from '../mode-manager.ts'
import {
  DAEMON_DEFAULT_ALLOWLIST,
  PERMISSION_MODE_ORDER,
  type DaemonAllowlistConfig,
} from '../mode-types.ts'

// ============================================================================
// Daemon mode - default allowlist
// ============================================================================

describe('daemon mode - default allowlist', () => {
  it('allows Read', () => {
    const result = shouldAllowToolInMode('Read', { file_path: '/foo' }, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows Glob', () => {
    const result = shouldAllowToolInMode('Glob', { pattern: '**/*.ts' }, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows Grep', () => {
    const result = shouldAllowToolInMode('Grep', { pattern: 'foo' }, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows WebFetch', () => {
    const result = shouldAllowToolInMode('WebFetch', { url: 'https://example.com' }, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows WebSearch', () => {
    const result = shouldAllowToolInMode('WebSearch', { query: 'test' }, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows Task', () => {
    const result = shouldAllowToolInMode('Task', {}, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows TaskOutput', () => {
    const result = shouldAllowToolInMode('TaskOutput', {}, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('allows TodoWrite', () => {
    const result = shouldAllowToolInMode('TodoWrite', {}, 'daemon')
    expect(result).toEqual({ allowed: true })
  })

  it('blocks Bash', () => {
    const result = shouldAllowToolInMode('Bash', { command: 'ls' }, 'daemon')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toContain('daemon tool allowlist')
    }
  })

  it('blocks Write', () => {
    const result = shouldAllowToolInMode('Write', { file_path: '/foo', content: 'bar' }, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('blocks Edit', () => {
    const result = shouldAllowToolInMode('Edit', { file_path: '/foo' }, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('blocks MultiEdit', () => {
    const result = shouldAllowToolInMode('MultiEdit', {}, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('blocks NotebookEdit', () => {
    const result = shouldAllowToolInMode('NotebookEdit', {}, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('blocks unknown tools', () => {
    const result = shouldAllowToolInMode('SomeRandomTool', {}, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('blocks MCP tools not in patterns', () => {
    const result = shouldAllowToolInMode('mcp__foo__bar', {}, 'daemon')
    expect(result.allowed).toBe(false)
  })
})

// ============================================================================
// Daemon mode - custom allowlist
// ============================================================================

describe('daemon mode - custom allowlist', () => {
  it('allows MCP tools matching custom pattern', () => {
    const customAllowlist: DaemonAllowlistConfig = {
      allowedTools: new Set(['Read']),
      allowedMcpPatterns: [/^mcp__slack__/],
    }
    const result = shouldAllowToolInMode('mcp__slack__send_message', {}, 'daemon', {
      daemonAllowlist: customAllowlist,
    })
    expect(result).toEqual({ allowed: true })
  })

  it('blocks MCP tools not matching custom pattern', () => {
    const customAllowlist: DaemonAllowlistConfig = {
      allowedTools: new Set(['Read']),
      allowedMcpPatterns: [/^mcp__slack__/],
    }
    const result = shouldAllowToolInMode('mcp__github__create_issue', {}, 'daemon', {
      daemonAllowlist: customAllowlist,
    })
    expect(result.allowed).toBe(false)
  })

  it('allows custom tools in allowlist', () => {
    const customAllowlist: DaemonAllowlistConfig = {
      allowedTools: new Set(['Read', 'CustomTool']),
      allowedMcpPatterns: [],
    }
    const result = shouldAllowToolInMode('CustomTool', {}, 'daemon', {
      daemonAllowlist: customAllowlist,
    })
    expect(result).toEqual({ allowed: true })
  })
})

// ============================================================================
// Daemon mode - edge cases
// ============================================================================

describe('daemon mode - edge cases', () => {
  it('blocks all tools when custom allowlist is empty', () => {
    const emptyAllowlist: DaemonAllowlistConfig = {
      allowedTools: new Set(),
      allowedMcpPatterns: [],
    }
    const result = shouldAllowToolInMode('Read', {}, 'daemon', {
      daemonAllowlist: emptyAllowlist,
    })
    expect(result.allowed).toBe(false)
  })

  it('is case-sensitive for tool names', () => {
    const result = shouldAllowToolInMode('read', {}, 'daemon')
    expect(result.allowed).toBe(false)
  })

  it('includes tool name in rejection reason', () => {
    const result = shouldAllowToolInMode('Bash', { command: 'ls' }, 'daemon')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.reason).toContain('Bash')
      expect(result.reason).toContain('daemon tool allowlist')
    }
  })

  it('daemon mode ignores permissionsContext', () => {
    const result = shouldAllowToolInMode('Bash', { command: 'ls' }, 'daemon', {
      permissionsContext: { workspaceId: 'test' } as never,
    })
    expect(result.allowed).toBe(false)
  })

  it('default allowlist contains exactly the expected tools', () => {
    const expectedTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'TaskOutput', 'TodoWrite']
    expect(Array.from(DAEMON_DEFAULT_ALLOWLIST.allowedTools).sort()).toEqual(expectedTools.sort())
  })

  it('default allowlist has no MCP patterns', () => {
    expect(DAEMON_DEFAULT_ALLOWLIST.allowedMcpPatterns).toEqual([])
  })
})

// ============================================================================
// Daemon mode - not in UI cycle
// ============================================================================

describe('daemon mode - not in UI cycle', () => {
  it('daemon is not in PERMISSION_MODE_ORDER', () => {
    expect(PERMISSION_MODE_ORDER).not.toContain('daemon')
  })

  it('PERMISSION_MODE_ORDER has exactly 3 entries', () => {
    expect(PERMISSION_MODE_ORDER).toHaveLength(3)
  })
})
