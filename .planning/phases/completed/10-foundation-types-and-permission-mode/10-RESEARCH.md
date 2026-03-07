# Phase 10: Foundation Types and Permission Mode - Research

**Researched:** 2026-02-07
**Domain:** TypeScript type definitions, permission system extension, plugin contract design
**Confidence:** HIGH

## Summary

Phase 10 is pure type definitions and permission logic. No runtime behavior, no new dependencies, no UI changes. The codebase already has a mature permission system (`safe`/`ask`/`allow-all`) with per-session state management and a `shouldAllowToolInMode()` function that serves as the single source of truth for tool access control. Adding a fourth `daemon` mode follows established patterns exactly.

The plugin contract (`KataPlugin`) and channel adapter interface (`ChannelAdapter`) are new type files that follow the existing `packages/shared/src/sources/types.ts` pattern for interface design. The architecture research document (`.planning/research/ARCHITECTURE.md`) already specifies the exact interface shapes, so this phase is implementation of agreed-upon designs rather than design work.

**Primary recommendation:** Extend `PermissionMode` union with `'daemon'`, add daemon-specific allowlist logic to `shouldAllowToolInMode()`, create new type files in `packages/shared/src/plugins/types.ts` and `packages/shared/src/channels/types.ts`, and add `packages/core/src/types/daemon.ts` for daemon event types. All testable with `bun test`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| TypeScript | strict mode | Type definitions | Already configured project-wide with `strict: true`, `noUncheckedIndexedAccess: true` |
| Zod | existing | Schema validation for permission configs | Already used in `mode-types.ts` for `PermissionsConfigSchema` |
| Bun test | existing | Unit tests | Project test runner, used by all packages |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `@anthropic-ai/claude-agent-sdk` | existing | SDK types for `SdkMcpToolDefinition`, `tool()` | ToolRegistry type references SDK tool type |

### Alternatives Considered

None. This phase uses only existing dependencies. No new packages needed.

## Architecture Patterns

### Recommended File Structure

```
packages/
├── core/src/types/
│   ├── daemon.ts              # NEW: DaemonStatus, DaemonEvent types
│   └── index.ts               # MODIFY: re-export daemon types
├── shared/src/
│   ├── plugins/
│   │   ├── types.ts           # NEW: KataPlugin, ChannelRegistry, ToolRegistry, ServiceRegistry
│   │   └── index.ts           # NEW: exports
│   ├── channels/
│   │   ├── types.ts           # NEW: ChannelAdapter, ChannelMessage, ChannelConfig
│   │   └── index.ts           # NEW: exports
│   └── agent/
│       ├── mode-types.ts      # MODIFY: add 'daemon' to PermissionMode union
│       └── mode-manager.ts    # MODIFY: add daemon mode logic to shouldAllowToolInMode
```

### Pattern 1: Discriminated Union for PermissionMode

The existing `PermissionMode` type is a string literal union. Adding `'daemon'` extends the union.

```typescript
// Source: packages/shared/src/agent/mode-types.ts (existing pattern)
export type PermissionMode = 'safe' | 'ask' | 'allow-all' | 'daemon';
```

The `shouldAllowToolInMode()` function in `mode-manager.ts` already uses `if (mode === 'safe')` / `if (mode === 'ask')` / `if (mode === 'allow-all')` branching. Adding `if (mode === 'daemon')` follows the same pattern.

**Key constraint:** `daemon` mode must NOT be added to `PERMISSION_MODE_ORDER` (the SHIFT+TAB cycling array). It is not user-selectable. Users never see it in the UI. Daemon sessions are created programmatically with `initializeModeState(sessionId, 'daemon')`.

### Pattern 2: Allowlist-Based Tool Filtering for Daemon Mode

Daemon mode uses an explicit allowlist, unlike safe mode which uses a blocklist. This is the inverse approach.

```typescript
// Daemon mode: only tools in the allowlist are permitted
// Everything else is blocked by default
const DAEMON_DEFAULT_ALLOWLIST = new Set([
  'Read', 'Glob', 'Grep',           // File reading (same as ALWAYS_ALLOWED_TOOLS)
  'WebFetch', 'WebSearch',          // Web research
  'Task', 'TaskOutput',             // Agent orchestration
]);

// In shouldAllowToolInMode():
if (mode === 'daemon') {
  // Check explicit allowlist (configurable per-plugin)
  if (daemonAllowlist.has(toolName)) {
    return { allowed: true };
  }
  // MCP tools: allow if in allowlist pattern
  if (toolName.startsWith('mcp__') && matchesDaemonMcpPattern(toolName, config)) {
    return { allowed: true };
  }
  // Everything else blocked
  return { allowed: false, reason: `Tool ${toolName} is not in daemon allowlist.` };
}
```

**Blocked by default:** `Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `computer` (any tool not in allowlist). This satisfies DAEMON-04 and success criterion #4.

### Pattern 3: Plugin Contract with Optional Registration Methods

The `KataPlugin` interface uses optional methods so plugins can register only what they provide.

```typescript
// Source: .planning/research/ARCHITECTURE.md (locked decision)
interface KataPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  registerChannels?(registry: ChannelRegistry): void;
  registerTools?(registry: ToolRegistry): void;
  registerServices?(registry: ServiceRegistry): void;

  initialize?(context: PluginContext): Promise<void>;
  shutdown?(): Promise<void>;
}
```

This follows the existing pattern in the codebase where optional lifecycle hooks are common (e.g., `ModeCallbacks.onStateChange?`).

### Pattern 4: Dual Ingress Channel Adapter

The `ChannelAdapter` interface supports both polling and subscription modes via a `type` discriminant.

```typescript
interface ChannelAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: 'poll' | 'subscribe';

  start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void>;
  stop(): Promise<void>;

  isHealthy(): boolean;
  getLastError(): string | null;
}
```

### Pattern 5: Type-Only Imports

The codebase enforces `verbatimModuleSyntax: true` in tsconfig. All type imports must use `import type` syntax.

```typescript
// Correct (enforced by tsconfig)
import type { PermissionMode } from './mode-types.ts';

// Incorrect (will cause build error)
import { PermissionMode } from './mode-types.ts';
```

### Pattern 6: PERMISSION_MODE_CONFIG Entry for Daemon

Each permission mode has a display configuration entry. Daemon needs one for consistency, even though users do not interact with it directly.

```typescript
// Follows existing pattern in PERMISSION_MODE_CONFIG
'daemon': {
  displayName: 'Daemon',
  shortName: 'Daemon',
  description: 'Background daemon mode. Restricted to explicit tool allowlist.',
  svgPath: '...', // Shield or lock icon
  colorClass: {
    text: 'text-warning',
    bg: 'bg-warning',
    border: 'border-warning',
  },
},
```

### Anti-Patterns to Avoid

- **Do not add `daemon` to `PERMISSION_MODE_ORDER`.** This array drives SHIFT+TAB cycling for users. Daemon mode is programmatic only.
- **Do not create runtime behavior in this phase.** No file I/O, no network calls, no process spawning. Pure types and pure functions.
- **Do not import from `apps/electron/` in `packages/shared/` or `packages/core/`.** Types flow from core -> shared -> electron, never the reverse.
- **Do not use `any` type.** The codebase uses `unknown` with type narrowing. Both tsconfigs have `strict: true`.
- **Do not put daemon-specific types in `packages/core/`** beyond event/status types. The plugin and channel types belong in `packages/shared/` following the source types pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Schema validation for configs | Custom validators | Zod schemas (existing pattern) | `PermissionsConfigSchema` already uses Zod; daemon allowlist config should too |
| Permission mode state management | New state system | `modeManager` singleton (existing) | Per-session state, subscribe/notify, cleanup already solved |
| Tool blocking return format | Custom format | `ToolCheckResult` type (existing) | `shouldAllowToolInMode` returns `{ allowed, reason }` already |
| SDK tool type definitions | Custom tool type | `SdkMcpToolDefinition` from SDK | The SDK `tool()` helper produces this type |

## Common Pitfalls

### Pitfall 1: Breaking the SHIFT+TAB Cycle

**What goes wrong:** Adding `'daemon'` to `PERMISSION_MODE_ORDER` causes users to cycle into daemon mode accidentally.
**Why it happens:** The mode order array and the mode union are separate. Extending the union does not automatically extend the cycle.
**How to avoid:** Keep `PERMISSION_MODE_ORDER` unchanged as `['safe', 'ask', 'allow-all']`. Add `daemon` only to the `PermissionMode` type union.
**Warning signs:** E2E tests for permission cycling (permission.live.e2e.ts) fail.

### Pitfall 2: Exhaustive Switch/If Chains

**What goes wrong:** Existing code that handles all three modes with if/else chains will not get TypeScript errors when a fourth mode is added, since `PermissionMode` is a union of string literals and the existing code uses `if` chains, not `switch` with exhaustive checks.
**Why it happens:** The `shouldAllowToolInMode()` function uses early returns with `if (mode === 'safe')`, `if (mode === 'ask')`, `if (mode === 'allow-all')`. Adding `daemon` requires adding a new `if` block. TypeScript will not warn about the missing branch.
**How to avoid:** Add the `daemon` mode check at the TOP of `shouldAllowToolInMode()` with an early return, before the existing mode checks. This ensures daemon mode is handled before falling through to the default path.
**Warning signs:** Daemon sessions allow tools they should not because the function falls through to the default `return { allowed: true }`.

### Pitfall 3: Forgetting type-only exports in core/types/index.ts

**What goes wrong:** Adding `daemon.ts` to `packages/core/src/types/` but forgetting to re-export from `index.ts` means consumers cannot import the types.
**Why it happens:** The core package uses manual re-exports in `index.ts`, not barrel auto-exports.
**How to avoid:** After creating `daemon.ts`, add `export type { ... } from './daemon.ts'` to `packages/core/src/types/index.ts`.
**Warning signs:** `import type { DaemonStatus } from '@craft-agent/core'` fails.

### Pitfall 4: .ts Extension in Imports

**What goes wrong:** The codebase uses `.ts` extensions in import paths (e.g., `import { debug } from '../utils/debug.ts'`). This is a Bun convention. Omitting the extension causes resolution failures.
**Why it happens:** `moduleResolution: "bundler"` with `allowImportingTsExtensions: true` in tsconfig.
**How to avoid:** Always include `.ts` extension in import paths within `packages/shared` and `packages/core`.

### Pitfall 5: verbatimModuleSyntax violations

**What goes wrong:** Using `import { SomeType }` instead of `import type { SomeType }` for type-only imports causes build errors.
**Why it happens:** Both tsconfigs have `verbatimModuleSyntax: true`, which requires explicit `type` annotations on type-only imports.
**How to avoid:** Use `import type { ... }` for any import that is only used in type positions (type annotations, interface declarations).

## Code Examples

### Daemon Allowlist Configuration Type

```typescript
// packages/shared/src/agent/mode-types.ts addition

/**
 * Daemon mode tool allowlist configuration.
 * Tools not in the allowlist are blocked by default.
 */
export interface DaemonAllowlistConfig {
  /** Explicitly allowed tool names (e.g., 'Read', 'Glob') */
  allowedTools: Set<string>;
  /** MCP tool patterns allowed (regex, applied to full tool name like mcp__slack__send) */
  allowedMcpPatterns: RegExp[];
}

/**
 * Default daemon allowlist - read-only tools only.
 * Plugins extend this with their specific tool requirements.
 */
export const DAEMON_DEFAULT_ALLOWLIST: DaemonAllowlistConfig = {
  allowedTools: new Set([
    'Read', 'Glob', 'Grep',
    'WebFetch', 'WebSearch',
    'Task', 'TaskOutput',
    'TodoWrite',
  ]),
  allowedMcpPatterns: [],
};
```

### shouldAllowToolInMode Daemon Branch

```typescript
// packages/shared/src/agent/mode-manager.ts addition

// Add at the TOP of shouldAllowToolInMode, before existing mode checks:

if (mode === 'daemon') {
  // Daemon mode: allowlist-based. Only explicitly allowed tools can run.
  const daemonConfig = options?.daemonAllowlist ?? DAEMON_DEFAULT_ALLOWLIST;

  // Check explicit tool allowlist
  if (daemonConfig.allowedTools.has(toolName)) {
    return { allowed: true };
  }

  // Check MCP tools against daemon MCP patterns
  if (toolName.startsWith('mcp__')) {
    for (const pattern of daemonConfig.allowedMcpPatterns) {
      if (pattern.test(toolName)) {
        return { allowed: true };
      }
    }
  }

  // Everything else blocked
  return {
    allowed: false,
    reason: `${toolName} is not in the daemon tool allowlist. Daemon mode restricts tool access for safety.`,
  };
}
```

### KataPlugin Interface

```typescript
// packages/shared/src/plugins/types.ts

import type { ChannelAdapter, ChannelConfig } from '../channels/types.ts';

export interface KataPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  registerChannels?(registry: ChannelRegistry): void;
  registerTools?(registry: ToolRegistry): void;
  registerServices?(registry: ServiceRegistry): void;

  initialize?(context: PluginContext): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface ChannelRegistry {
  addAdapter(id: string, factory: () => ChannelAdapter): void;
}

export interface ToolRegistry {
  /** Add a tool using the SDK's SdkMcpToolDefinition type */
  addTool(tool: unknown): void;  // typed as unknown here; Phase 11+ uses SDK import
}

export interface ServiceRegistry {
  addService(id: string, service: PluginService): void;
}

export interface PluginService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PluginContext {
  workspaceRootPath: string;
  getCredential: (sourceSlug: string) => Promise<string | null>;
  logger: PluginLogger;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}
```

### ChannelAdapter Interface

```typescript
// packages/shared/src/channels/types.ts

export interface ChannelAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: 'poll' | 'subscribe';

  start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void>;
  stop(): Promise<void>;

  isHealthy(): boolean;
  getLastError(): string | null;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  source: string;
  timestamp: number;
  content: string;
  metadata: Record<string, unknown>;
  replyTo?: {
    threadId: string;
    messageId: string;
  };
}

export interface ChannelFilter {
  /** Trigger patterns (regex) that activate the agent */
  triggerPatterns?: string[];
  /** Channel/conversation IDs to monitor */
  channelIds?: string[];
}

export interface ChannelConfig {
  slug: string;
  enabled: boolean;
  adapter: string;
  pollIntervalMs?: number;
  credentials: {
    sourceSlug: string;
  };
  filter?: ChannelFilter;
}
```

### Unit Test Pattern for Daemon Mode

```typescript
// packages/shared/src/agent/__tests__/daemon-permission.test.ts

import { describe, it, expect } from 'bun:test';
import { shouldAllowToolInMode } from '../mode-manager.ts';

describe('shouldAllowToolInMode with daemon mode', () => {
  it('allows read-only tools by default', () => {
    const result = shouldAllowToolInMode('Read', { file_path: '/foo' }, 'daemon');
    expect(result.allowed).toBe(true);
  });

  it('blocks Bash by default', () => {
    const result = shouldAllowToolInMode('Bash', { command: 'ls' }, 'daemon');
    expect(result.allowed).toBe(false);
  });

  it('blocks Write by default', () => {
    const result = shouldAllowToolInMode('Write', { file_path: '/foo', content: 'x' }, 'daemon');
    expect(result.allowed).toBe(false);
  });

  it('blocks Edit by default', () => {
    const result = shouldAllowToolInMode('Edit', {}, 'daemon');
    expect(result.allowed).toBe(false);
  });

  it('blocks unknown tools by default', () => {
    const result = shouldAllowToolInMode('SomeRandomTool', {}, 'daemon');
    expect(result.allowed).toBe(false);
  });

  it('allows MCP tools matching daemon allowlist patterns', () => {
    const result = shouldAllowToolInMode('mcp__slack__send_message', {}, 'daemon', {
      daemonAllowlist: {
        allowedTools: new Set(['Read']),
        allowedMcpPatterns: [/^mcp__slack__/],
      },
    });
    expect(result.allowed).toBe(true);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| 3-mode permission system | 4-mode with daemon | Phase 10 (this work) | Enables background agent sessions with restricted tool access |
| No plugin contract | KataPlugin interface | Phase 10 (this work) | Enables first-party plugins for channel adapters |
| No channel concept | ChannelAdapter interface | Phase 10 (this work) | Enables inbound message routing from Slack/WhatsApp |

## Open Questions

1. **ToolRegistry type for SDK tools**
   - What we know: The SDK exports `SdkMcpToolDefinition` from `tool()` helper. ToolRegistry.addTool should accept this type.
   - What's unclear: Whether to import the SDK type directly in `plugins/types.ts` or use `unknown` and cast at the call site. Importing creates a compile-time dependency on the SDK from the plugin types file.
   - Recommendation: Use `unknown` in the interface definition for Phase 10 (pure types). Phase 11+ will import the SDK type in the concrete registry implementation. This keeps the types file dependency-light.

2. **Daemon allowlist extensibility**
   - What we know: Plugins need to extend the default daemon allowlist with their specific tools (e.g., Slack plugin needs `mcp__slack__*`).
   - What's unclear: Whether the allowlist is passed as an option to `shouldAllowToolInMode` or configured once at session creation time.
   - Recommendation: Pass as options parameter to `shouldAllowToolInMode` (consistent with existing `permissionsContext` option pattern). The DaemonManager will build the merged allowlist at session creation time and pass it on each check.

3. **Daemon mode display in session list**
   - What we know: Daemon sessions will appear in the session sidebar alongside user sessions.
   - What's unclear: Whether the `PERMISSION_MODE_CONFIG['daemon']` display properties (icon, color) are needed in Phase 10 or can wait for Phase 14 (UI Integration).
   - Recommendation: Add the config entry in Phase 10 for completeness. It is a few lines of static data and avoids a modification later.

## Sources

### Primary (HIGH confidence)

- `packages/shared/src/agent/mode-types.ts` - Existing PermissionMode type, PERMISSION_MODE_ORDER, PERMISSION_MODE_CONFIG, ModeConfig, SAFE_MODE_CONFIG
- `packages/shared/src/agent/mode-manager.ts` - shouldAllowToolInMode() implementation, ModeManager class, ALWAYS_ALLOWED_TOOLS
- `packages/shared/src/agent/permissions-config.ts` - PermissionsConfigCache, MergedPermissionsConfig, additive merging pattern
- `packages/shared/src/agent/craft-agent.ts` - PreToolUse hook integration, how shouldAllowToolInMode is called
- `packages/shared/src/agent/__tests__/tool-matching.test.ts` - Test patterns (bun:test, describe/it/expect)
- `packages/core/src/types/index.ts` - Type re-export pattern
- `packages/core/src/types/session.ts` - Interface design conventions
- `packages/shared/src/sources/types.ts` - Interface design for external connections
- `.planning/research/ARCHITECTURE.md` - Locked architectural decisions, interface designs
- `.planning/REQUIREMENTS.md` - PLUG-01 and DAEMON-04 requirements
- `.planning/ROADMAP.md` - Phase 10 success criteria
- Context7: Claude Agent SDK - `tool()`, `createSdkMcpServer()`, `CanUseTool` type definitions
- `packages/core/tsconfig.json` - strict: true, verbatimModuleSyntax: true, noUncheckedIndexedAccess: true
- `packages/shared/tsconfig.json` - Same strict settings, path aliases

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` Section 4.2 - Plugin contract design (from brainstorm synthesis, not yet validated by implementation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using only existing dependencies
- Architecture: HIGH - interface designs are locked from brainstorm, implementation follows established codebase patterns
- Pitfalls: HIGH - identified by reading actual code paths that will be modified
- Permission logic: HIGH - shouldAllowToolInMode() is well-understood from reading the 1400-line mode-manager.ts

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable domain, no external dependency changes expected)
