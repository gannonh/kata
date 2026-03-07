# Phase 13: Plugin Lifecycle and Task Scheduler - Research

**Researched:** 2026-02-08
**Domain:** Plugin enable/disable per workspace, first-party plugin bundling, SQLite-backed task scheduling (cron/interval/one-shot)
**Confidence:** HIGH

## Summary

Phase 13 bridges the existing plugin contract (Phase 10) and channel adapters (Phase 12) with runtime lifecycle management. Three deliverables: (1) a PluginManager that loads first-party plugins at daemon startup and respects per-workspace enable/disable state, (2) first-party Slack and WhatsApp plugins that wrap existing adapters, and (3) a TaskScheduler that persists cron, interval, and one-shot tasks in SQLite and executes them inside the daemon process.

The codebase already has all the building blocks. The `KataPlugin` interface is defined in `packages/shared/src/plugins/types.ts` with `registerChannels()`, `registerTools()`, `registerServices()`, `initialize()`, and `shutdown()` methods. The `ChannelRunner` in `packages/shared/src/daemon/channel-runner.ts` manages adapter lifecycle. The `MessageQueue` in `packages/shared/src/daemon/message-queue.ts` provides the SQLite pattern (WAL mode, prepared statements, `bun:sqlite`). The daemon entry point (`packages/shared/src/daemon/entry.ts`) already has a stubbed `plugin_action` handler referencing Phase 13 explicitly.

**Primary recommendation:** Build a `PluginManager` class that loads bundled plugin modules, calls their registration methods against concrete registry implementations, and filters by per-workspace enabled state stored in `WorkspaceConfig`. Add a `scheduled_tasks` table to daemon.db, use `croner` (zero-dep, Bun-native) for cron expression evaluation, and run a scheduler loop in the daemon entry point alongside the existing ChannelRunner.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| `bun:sqlite` | Built-in (Bun 1.x) | Task scheduler persistence in daemon.db | Already used by MessageQueue. Same process, same DB file. Zero additional dependencies. |
| `croner` | 10.x | Cron expression parsing and next-run calculation | Zero dependencies, explicit Bun >=1.0.0 support, TypeScript native, 6.8KB gzipped. Handles cron + one-shot (Date) + interval natively. |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `zod` | 4.x (existing) | Validate task scheduler payloads and plugin configs | Already in deps. Use for ScheduledTask schema validation. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| `croner` | `cron-parser` | cron-parser only parses expressions (no scheduling). Would need to build the timer loop manually. croner includes scheduling, next-run calculation, pause/resume, and overrun protection. |
| `croner` | `node-cron` | node-cron is Node.js-specific, not explicitly Bun-compatible. croner is cross-runtime by design. |
| SQLite task table | In-memory Map | Tasks would not survive daemon restarts. SQLite persistence is a hard requirement (success criterion #5). |
| Per-workspace enable/disable in WorkspaceConfig | Separate plugins.json file | WorkspaceConfig already has a `defaults` object with per-workspace settings. Adding `enabledPlugins` follows the established pattern. A separate file adds complexity without benefit. |

**Installation:**
```bash
bun add croner
```

## Architecture Patterns

### Recommended Project Structure

```
packages/shared/src/
├── plugins/
│   ├── types.ts              # EXISTING: KataPlugin, registries, context
│   ├── index.ts              # EXISTING: type exports
│   ├── plugin-manager.ts     # NEW: PluginManager (load, register, filter by workspace)
│   ├── registry-impl.ts      # NEW: Concrete ChannelRegistry, ToolRegistry, ServiceRegistry
│   └── builtin/              # NEW: First-party plugin implementations
│       ├── index.ts           # Barrel export of all builtin plugins
│       ├── slack-plugin.ts    # KataPlugin wrapping existing SlackChannelAdapter
│       └── whatsapp-plugin.ts # KataPlugin wrapping existing WhatsAppChannelAdapter
├── daemon/
│   ├── entry.ts              # MODIFY: integrate PluginManager and TaskScheduler
│   ├── message-queue.ts      # MODIFY: add scheduled_tasks table creation
│   ├── task-scheduler.ts     # NEW: TaskScheduler class (SQLite + croner)
│   └── types.ts              # MODIFY: add ScheduledTask, TaskType types
└── channels/
    └── adapters/             # EXISTING: SlackChannelAdapter, WhatsAppChannelAdapter (unchanged)
```

### Pattern 1: PluginManager with Registration Phase

The PluginManager loads bundled plugins, calls their registration methods against concrete registries, then filters the registered capabilities by per-workspace enabled state.

**What:** A class that owns the plugin lifecycle: load, register, initialize, shutdown.
**When to use:** At daemon startup, after MessageQueue initialization but before ChannelRunner startup.

```typescript
// Source: follows existing ChannelRunner pattern in channel-runner.ts
class PluginManager {
  private plugins: Map<string, KataPlugin> = new Map();
  private channelRegistry: ChannelRegistryImpl;
  private toolRegistry: ToolRegistryImpl;
  private serviceRegistry: ServiceRegistryImpl;

  constructor(private enabledPluginIds: Set<string>) {
    this.channelRegistry = new ChannelRegistryImpl();
    this.toolRegistry = new ToolRegistryImpl();
    this.serviceRegistry = new ServiceRegistryImpl();
  }

  /** Load all bundled plugins, but only register capabilities for enabled ones */
  loadBuiltinPlugins(): void {
    for (const plugin of getBuiltinPlugins()) {
      this.plugins.set(plugin.id, plugin);
      if (!this.enabledPluginIds.has(plugin.id)) continue;

      plugin.registerChannels?.(this.channelRegistry);
      plugin.registerTools?.(this.toolRegistry);
      plugin.registerServices?.(this.serviceRegistry);
    }
  }

  /** Get adapter factory for use by ChannelRunner */
  getAdapterFactory(): (type: string) => ChannelAdapter | null {
    return (type) => this.channelRegistry.createAdapter(type);
  }

  async initializeAll(context: PluginContext): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (!this.enabledPluginIds.has(id)) continue;
      await plugin.initialize?.(context);
    }
  }

  async shutdownAll(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      await plugin.shutdown?.();
    }
  }
}
```

### Pattern 2: First-Party Plugin as Adapter Wrapper

Each first-party plugin is a thin wrapper that registers the existing channel adapter via the plugin contract.

```typescript
// Source: wraps existing SlackChannelAdapter from channels/adapters/slack-adapter.ts
import type { KataPlugin, ChannelRegistry } from '../types.ts';
import { SlackChannelAdapter } from '../../channels/adapters/slack-adapter.ts';

export const slackPlugin: KataPlugin = {
  id: 'kata-slack',
  name: 'Slack',
  version: '0.7.0',

  registerChannels(registry: ChannelRegistry): void {
    registry.addAdapter('slack', () => new SlackChannelAdapter());
  },
};
```

### Pattern 3: SQLite-Backed Task Scheduler

The task scheduler stores task definitions in SQLite and uses croner for timing.

```typescript
// Source: extends existing MessageQueue SQLite pattern
interface ScheduledTask {
  id: string;
  workspaceId: string;
  type: 'cron' | 'interval' | 'one-shot';
  /** Cron expression (for cron type), interval in ms (for interval type), ISO 8601 date (for one-shot) */
  schedule: string;
  /** Action payload: message to send, session to trigger, etc. */
  action: TaskAction;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

type TaskAction =
  | { type: 'send_message'; workspaceId: string; sessionKey: string; message: string }
  | { type: 'plugin_action'; pluginId: string; action: string; payload?: unknown };
```

### Pattern 4: Per-Workspace Plugin Enable/Disable

Extend `WorkspaceConfig.defaults` with an `enabledPlugins` array. Default: all first-party plugins enabled.

```typescript
// In packages/shared/src/workspaces/types.ts
interface WorkspaceConfig {
  // ... existing fields ...
  defaults?: {
    // ... existing fields ...
    enabledPlugins?: string[]; // Plugin IDs to enable. Defaults to all bundled plugins.
  };
}
```

The workspace settings IPC handler already supports generic key/value updates via `WORKSPACE_SETTINGS_UPDATE`. Adding `enabledPlugins` follows the exact pattern used by `enabledSourceSlugs`, `permissionMode`, and `thinkingLevel`.

### Anti-Patterns to Avoid

- **Dynamic plugin loading from disk:** Do not scan the filesystem for plugins. First-party only means static imports. The plugin list is known at build time.
- **Plugin-per-workspace isolation:** Do not create separate PluginManager instances per workspace. One PluginManager in the daemon, filtered by per-workspace config when resolving which channels to start.
- **Task scheduler polling loop:** Do not poll SQLite for due tasks. Use croner to compute `msToNext()` and `setTimeout`. The daemon process is long-lived, so timers are stable.
- **Storing cron state in memory only:** All task definitions and last-run timestamps must be in SQLite. The daemon can restart at any time (crash, app restart, sleep/wake).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Cron expression parsing | Custom regex parser | `croner` | Cron syntax has edge cases (DST, leap years, last-day-of-month). croner handles all of them and computes next-run times. |
| Timer management for scheduled tasks | Custom setInterval/setTimeout orchestration | `croner`'s built-in job scheduling | croner already manages timer lifecycle, overrun protection, pause/resume. Reimplementing this is error-prone. |
| SQLite table creation and migration | Custom migration system | Inline `CREATE TABLE IF NOT EXISTS` | The existing MessageQueue uses this pattern. Single-process writes mean no migration coordination needed. |

**Key insight:** The task scheduler's persistence layer is straightforward SQLite CRUD. The hard part is timer management with restart resilience. croner solves the timer side; SQLite solves the persistence side. Combining them requires loading tasks from SQLite on startup, creating croner instances, and writing back `lastRunAt`/`nextRunAt` on each execution.

## Common Pitfalls

### Pitfall 1: Timer Drift After Daemon Restart

**What goes wrong:** After daemon restart, scheduled tasks that were "due" during downtime either fire all at once or get skipped entirely.
**Why it happens:** croner creates fresh timers. If the daemon was down for 3 hours and a task runs every hour, the missed runs are invisible.
**How to avoid:** On startup, compare `nextRunAt` (from SQLite) with current time. If `nextRunAt < now`, fire the task immediately once (catch-up), then schedule the next run normally. For one-shot tasks where `nextRunAt < now`, execute immediately and mark complete.
**Warning signs:** Tasks appear to "never run" after a restart. Users report missed scheduled actions.

### Pitfall 2: Plugin Registration Order Dependencies

**What goes wrong:** A plugin's `initialize()` assumes another plugin is already registered.
**Why it happens:** Bundled plugins load in import order, which is deterministic but not explicitly documented.
**How to avoid:** Registration phase (synchronous) completes for ALL plugins before any `initialize()` (async) calls. Two-phase startup: register all, then initialize all.
**Warning signs:** Intermittent failures where one plugin can't find another's channels.

### Pitfall 3: Workspace Config Race with Daemon

**What goes wrong:** User toggles a plugin off in the UI while the daemon is running. The daemon keeps using the old config.
**Why it happens:** The daemon reads config at startup and caches it. UI writes go to disk. No notification mechanism.
**How to avoid:** Send a `configure_channels` command to the daemon via IPC when workspace settings change. The daemon entry point already handles `configure_channels`. Extend the pattern: when the Electron main process detects a settings change (via ConfigWatcher or IPC handler), send an updated config to the daemon.
**Warning signs:** Toggling a plugin off has no effect until app restart.

### Pitfall 4: SQLite Contention Between MessageQueue and TaskScheduler

**What goes wrong:** MessageQueue and TaskScheduler both write to daemon.db and interfere with each other.
**Why it happens:** SQLite WAL mode supports concurrent readers and a single writer. Both modules share the same Database instance, so writes are serialized by the Bun event loop (single-threaded).
**How to avoid:** Share the same `Database` instance between MessageQueue and TaskScheduler. Both run in the same Bun process, so contention is not a real issue. The existing WAL mode + busy_timeout pragmas handle any edge cases.
**Warning signs:** "database is locked" errors (would indicate a bug, not a design problem).

### Pitfall 5: Plugin Shutdown Ordering

**What goes wrong:** Daemon shuts down while a scheduled task is mid-execution, causing partial state.
**Why it happens:** `TaskScheduler.stop()` is called before all running tasks complete.
**How to avoid:** TaskScheduler tracks in-flight tasks. `stop()` cancels pending timers and awaits in-flight tasks with a timeout. Follow the existing ChannelRunner `stopAll()` pattern.
**Warning signs:** Corrupted task state after abrupt shutdown. Tasks appear "processing" but never complete.

## Code Examples

### Creating the scheduled_tasks Table

```typescript
// Source: follows existing MessageQueue pattern in message-queue.ts
// Add to MessageQueue constructor or separate TaskScheduler class
this.db.run(`
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('cron', 'interval', 'one-shot')),
    schedule TEXT NOT NULL,
    action TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    error TEXT
  )
`);

this.db.run(`
  CREATE INDEX IF NOT EXISTS idx_tasks_enabled
  ON scheduled_tasks (enabled, next_run_at)
  WHERE enabled = 1
`);
```

### TaskScheduler Class Skeleton

```typescript
// Source: combines bun:sqlite pattern from MessageQueue + croner scheduling
import { Cron } from 'croner';
import type { Database } from 'bun:sqlite';

class TaskScheduler {
  private jobs: Map<string, Cron> = new Map();

  constructor(
    private db: Database,
    private onTaskDue: (task: ScheduledTask) => Promise<void>,
    private log: (msg: string) => void = () => {},
  ) {}

  /** Load all enabled tasks from SQLite and create croner instances */
  start(): void {
    const tasks = this.loadEnabledTasks();
    for (const task of tasks) {
      this.scheduleTask(task);
    }
    this.log(`Scheduled ${tasks.length} task(s)`);
  }

  /** Cancel all croner jobs */
  stop(): void {
    for (const [id, job] of this.jobs) {
      job.stop();
      this.log(`Stopped task: ${id}`);
    }
    this.jobs.clear();
  }

  private scheduleTask(task: ScheduledTask): void {
    let cronPattern: string | Date;

    switch (task.type) {
      case 'cron':
        cronPattern = task.schedule;
        break;
      case 'interval':
        // Use croner's interval option with a wildcard pattern
        // Schedule will use the interval parameter
        cronPattern = '* * * * * *';
        break;
      case 'one-shot':
        cronPattern = new Date(task.schedule);
        break;
    }

    const options = task.type === 'interval'
      ? { interval: parseInt(task.schedule, 10) }
      : task.type === 'one-shot'
        ? { maxRuns: 1 }
        : {};

    const job = new Cron(cronPattern, options, async () => {
      try {
        await this.onTaskDue(task);
        this.updateLastRun(task.id, job.nextRun()?.toISOString() ?? null);
      } catch (err) {
        this.markTaskError(task.id, err instanceof Error ? err.message : String(err));
      }
    });

    this.jobs.set(task.id, job);
  }
}
```

### First-Party Plugin Implementation

```typescript
// Source: wraps existing adapters into KataPlugin contract
// packages/shared/src/plugins/builtin/slack-plugin.ts
import type { KataPlugin, ChannelRegistry } from '../types.ts';
import { SlackChannelAdapter } from '../../channels/adapters/slack-adapter.ts';

export const slackPlugin: KataPlugin = {
  id: 'kata-slack',
  name: 'Slack',
  version: '0.7.0',

  registerChannels(registry: ChannelRegistry): void {
    registry.addAdapter('slack', () => new SlackChannelAdapter());
  },
  // No tools or services for Slack in v0.7.0
};

// packages/shared/src/plugins/builtin/whatsapp-plugin.ts
import type { KataPlugin, ChannelRegistry } from '../types.ts';
import { WhatsAppChannelAdapter } from '../../channels/adapters/whatsapp-adapter.ts';

export const whatsAppPlugin: KataPlugin = {
  id: 'kata-whatsapp',
  name: 'WhatsApp',
  version: '0.7.0',

  registerChannels(registry: ChannelRegistry): void {
    registry.addAdapter('whatsapp', () => new WhatsAppChannelAdapter());
  },
};
```

### Workspace Settings Integration for Plugin Toggle

```typescript
// In apps/electron/src/main/ipc.ts, extend WORKSPACE_SETTINGS_UPDATE handler
// Add 'enabledPlugins' to validKeys array:
const validKeys = [
  'name', 'model', 'enabledSourceSlugs', 'permissionMode',
  'cyclablePermissionModes', 'thinkingLevel', 'workingDirectory',
  'localMcpEnabled', 'enabledPlugins', // NEW
];

// After saving config, notify daemon of changed plugin state:
if (key === 'enabledPlugins' && daemonManager) {
  // Recompute channel configs and send to daemon
  daemonManager.sendCommand({
    type: 'configure_channels',
    workspaces: [/* rebuild workspace configs respecting new enabledPlugins */],
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| `node-cron` (Node.js only) | `croner` (cross-runtime) | 2023+ | croner works in Bun natively. node-cron does not guarantee Bun compatibility. |
| `better-sqlite3` in Electron | `bun:sqlite` in subprocess | Architecture decision (Phase 11) | The daemon runs as Bun subprocess, so `bun:sqlite` is the native choice. No native addon compilation needed. |
| Plugin discovery via filesystem scanning | Static imports of bundled plugins | Architecture decision (brainstorm) | First-party only in v0.7.0. No dynamic loading, no plugin marketplace. |

**Deprecated/outdated:**
- `later.js`: Unmaintained. Last commit 2017. Do not use.
- `node-cron` for Bun: No explicit Bun support. Use `croner` instead.

## Open Questions

1. **Task action types beyond send_message**
   - What we know: The brainstorm mentions "cron, interval, and one-shot tasks" but does not specify what actions tasks can trigger beyond channel messages.
   - What's unclear: Should tasks be able to trigger arbitrary plugin actions? Run agent sessions with a specific prompt? Execute MCP tools?
   - Recommendation: Start with `send_message` (triggers a message in a daemon session) and `plugin_action` (sends a command to a specific plugin). This covers the ChatGPT Tasks use case (scheduled prompts) and extensibility for plugins.

2. **Task creation UI**
   - What we know: Phase 14 covers UI integration. Phase 13 focuses on the backend scheduler.
   - What's unclear: How will users create scheduled tasks? Through the chat input? A dedicated tasks panel?
   - Recommendation: Phase 13 builds the scheduler engine and IPC commands for CRUD. Expose a `daemon:task_create` / `daemon:task_list` / `daemon:task_delete` IPC channel. The UI comes in Phase 14.

3. **Maximum concurrent scheduled task executions**
   - What we know: The brainstorm mentions "cap concurrent daemon-triggered agent sessions (3-5)".
   - What's unclear: Does this cap apply to scheduled tasks separately or combined with channel-triggered sessions?
   - Recommendation: Use a shared concurrency limiter for all daemon-initiated sessions (both channel messages and scheduled tasks). Default cap: 3.

## Sources

### Primary (HIGH confidence)
- Context7 `/hexagon/croner` - scheduling API, cron patterns, next-run calculation, Bun compatibility
- Context7 `/oven-sh/bun` - bun:sqlite API, WAL mode, prepared statements, transactions
- Existing codebase analysis: `packages/shared/src/plugins/types.ts`, `packages/shared/src/daemon/entry.ts`, `packages/shared/src/daemon/message-queue.ts`, `packages/shared/src/daemon/channel-runner.ts`

### Secondary (MEDIUM confidence)
- [croner GitHub](https://github.com/Hexagon/croner) - v10.0.1, zero deps, explicit Bun >=1.0.0 support, 6.8KB gzipped
- `.planning/research/ARCHITECTURE.md` - integration points, data flow, plugin registry design

### Tertiary (LOW confidence)
- WebSearch for cron library comparison (multiple sources agree croner is best for Bun)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - croner verified via Context7 + official GitHub, bun:sqlite already proven in codebase
- Architecture: HIGH - all patterns extend existing codebase patterns (PluginManager mirrors ChannelRunner, TaskScheduler mirrors MessageQueue)
- Pitfalls: HIGH - identified from existing daemon restart behavior and established SQLite patterns

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (30 days, stable domain)
