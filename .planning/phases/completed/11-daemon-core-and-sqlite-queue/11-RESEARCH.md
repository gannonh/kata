# Phase 11: Daemon Core and SQLite Queue - Research

**Researched:** 2026-02-07
**Domain:** Bun subprocess lifecycle management, stdin/stdout JSON-lines IPC, SQLite message queue, exponential backoff process supervision
**Confidence:** HIGH

## Summary

Phase 11 establishes the daemon process infrastructure: a Bun subprocess spawned from Electron's Node.js main process, communicating via newline-delimited JSON over stdin/stdout. The daemon manages its own SQLite database for message queuing, and the Electron main process supervises the daemon with exponential backoff restart logic.

The standard approach uses Node.js `child_process.spawn()` from the Electron main process to launch a Bun script, with `stdin: 'pipe'` and `stdout: 'pipe'` for bidirectional JSON-lines communication. `bun:sqlite` provides zero-dependency SQLite access in the daemon subprocess with WAL mode for concurrent read safety. The supervisor pattern is straightforward: track consecutive failures, compute delay as `min(baseDelay * 2^failures, maxDelay)`, and pause after a failure threshold.

**Primary recommendation:** Build three isolated modules: `DaemonManager` in the Electron main process (`apps/electron/src/main/daemon-manager.ts`), the daemon entry point in shared (`packages/shared/src/daemon/index.ts`), and the SQLite message queue (`packages/shared/src/daemon/message-queue.ts`). Keep the daemon's only responsibility in Phase 11 as: start, accept commands, report status, and store/retrieve queued messages. Channel adapters and plugin loading come in later phases.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| `bun:sqlite` | Built-in (Bun 1.x) | SQLite database access in daemon subprocess | Zero-dependency, synchronous API, WAL mode support, prepared statements. Ships with Bun runtime. |
| `child_process` (Node.js) | Built-in (Electron/Node) | Spawn Bun daemon subprocess from Electron main process | Standard Node.js module. Electron main process runs Node.js, not Bun. |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `zod` | 4.x (already in deps) | Validate JSON-lines messages between processes | Already used throughout the codebase for schema validation. Use for DaemonCommand and DaemonEvent parsing. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| stdin/stdout JSON-lines | Bun native IPC (`ipc` option on `Bun.spawn`) | Bun IPC uses structured clone serialization, but the parent is Electron/Node.js using `child_process.spawn()`, not `Bun.spawn()`. Node.js IPC via `fork()` requires both processes to be Node.js. stdin/stdout JSON-lines works across any runtime combination. |
| stdin/stdout JSON-lines | Electron `utilityProcess` | `utilityProcess` spawns Node.js child processes, not Bun. The daemon needs `bun:sqlite` which requires Bun runtime. |
| `bun:sqlite` | `better-sqlite3` | `better-sqlite3` is a native Node.js addon. Would require electron-rebuild, adds native binary complexity to the build. `bun:sqlite` is zero-cost in the Bun subprocess. |
| Custom supervisor | `pm2` / `forever` | External process managers are designed for server deployment. Overkill for a desktop app child process. 30 lines of supervisor code is simpler and more maintainable. |

**Installation:**
```bash
# No new dependencies needed.
# bun:sqlite is built into Bun.
# child_process is built into Node.js/Electron.
# zod is already in package.json.
```

## Architecture Patterns

### Recommended Project Structure

```
packages/shared/src/daemon/
├── index.ts              # Daemon entry point (runs in Bun subprocess)
├── message-queue.ts      # SQLite message queue (enqueue/dequeue/mark-processed)
├── ipc.ts                # JSON-lines protocol: parse stdin, write stdout
├── types.ts              # Daemon-internal types (re-export core daemon types)
└── __tests__/
    ├── message-queue.test.ts
    └── ipc.test.ts

apps/electron/src/main/
├── daemon-manager.ts     # Spawn/supervise daemon, IPC bridge to renderer
└── __tests__/
    └── daemon-manager.test.ts  (unit test with mocked child_process)
```

### Pattern 1: JSON-Lines Protocol over stdin/stdout

**What:** Newline-delimited JSON messages (NDJSON). Each message is a single JSON object followed by `\n`. The parent writes DaemonCommand objects to the child's stdin. The child writes DaemonEvent objects to its stdout. stderr is reserved for logging/debugging.

**When to use:** Cross-runtime IPC where both processes are not the same runtime (Node.js parent, Bun child).

**Example:**

```typescript
// Parent (Electron main process, Node.js)
import { spawn } from 'child_process';

const daemon = spawn('bun', ['run', 'packages/shared/src/daemon/index.ts'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, KATA_CONFIG_DIR: configDir },
});

// Send command
function sendCommand(cmd: DaemonCommand): void {
  daemon.stdin.write(JSON.stringify(cmd) + '\n');
}

// Receive events (buffered line reader)
let buffer = '';
daemon.stdout.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  let newlineIdx: number;
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx);
    buffer = buffer.slice(newlineIdx + 1);
    if (line.trim()) {
      const event: DaemonEvent = JSON.parse(line);
      handleDaemonEvent(event);
    }
  }
});
```

```typescript
// Child (daemon subprocess, Bun)
// Read commands from stdin
const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let stdinBuffer = '';

async function readCommands(): Promise<void> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stdinBuffer += decoder.decode(value, { stream: true });
    let newlineIdx: number;
    while ((newlineIdx = stdinBuffer.indexOf('\n')) !== -1) {
      const line = stdinBuffer.slice(0, newlineIdx);
      stdinBuffer = stdinBuffer.slice(newlineIdx + 1);
      if (line.trim()) {
        const command: DaemonCommand = JSON.parse(line);
        handleCommand(command);
      }
    }
  }
}

// Send events to parent
function emitEvent(event: DaemonEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}
```

### Pattern 2: Exponential Backoff Supervisor

**What:** Restart a crashed subprocess with increasing delays. Track consecutive failures. Reset the counter on successful operation (e.g., daemon runs for >60 seconds without crashing).

**When to use:** Any long-running subprocess that should auto-recover from transient failures but stop retrying on persistent failures.

**Example:**

```typescript
class DaemonSupervisor {
  private consecutiveFailures = 0;
  private readonly baseDelayMs = 1000;
  private readonly maxDelayMs = 30_000;
  private readonly maxConsecutiveFailures = 5;
  private lastStartTime = 0;
  private stabilityThresholdMs = 60_000; // 60s = "stable"

  getRestartDelay(): number {
    return Math.min(
      this.baseDelayMs * Math.pow(2, this.consecutiveFailures),
      this.maxDelayMs,
    );
  }

  onProcessExit(exitCode: number | null): 'restart' | 'paused' {
    const uptime = Date.now() - this.lastStartTime;
    if (uptime > this.stabilityThresholdMs) {
      // Process ran long enough to consider it recovered
      this.consecutiveFailures = 0;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures > this.maxConsecutiveFailures) {
      return 'paused';
    }
    return 'restart';
  }

  onProcessStart(): void {
    this.lastStartTime = Date.now();
  }

  reset(): void {
    this.consecutiveFailures = 0;
  }
}
```

### Pattern 3: SQLite Message Queue with WAL Mode

**What:** SQLite table acting as a durable message queue. WAL mode enables concurrent reads without blocking writes. Messages have states: `pending` -> `processing` -> `processed` (or `failed`).

**When to use:** When messages must survive process crashes and be processed exactly once.

**Example:**

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('daemon.db');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 5000');

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
    channel_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_messages_pending
  ON messages (direction, status, created_at)
  WHERE status = 'pending'
`);
```

### Pattern 4: PID File for Stale Process Cleanup

**What:** Write daemon PID to a file on startup. On app startup, check if the PID file exists and whether the process is alive. Kill stale processes.

**When to use:** Preventing zombie daemon processes when the Electron app crashes or is force-quit without proper shutdown.

**Example:**

```typescript
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const PID_FILE = join(configDir, 'daemon.pid');

function cleanupStaleDaemon(): void {
  if (!existsSync(PID_FILE)) return;
  const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    unlinkSync(PID_FILE);
    return;
  }
  try {
    // Signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    // Process exists - kill it
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process doesn't exist - stale PID file
  }
  unlinkSync(PID_FILE);
}

function writePidFile(pid: number): void {
  writeFileSync(PID_FILE, String(pid), 'utf-8');
}
```

### Anti-Patterns to Avoid

- **Using Bun IPC from Node.js parent:** `Bun.spawn()` IPC uses structured clone, which is incompatible with Node.js `child_process.spawn()`. The Electron main process runs Node.js. Use stdin/stdout JSON-lines instead.
- **Sharing SQLite file between Bun and Node.js processes:** Would require `better-sqlite3` (native addon) in Electron. Adds electron-rebuild complexity. The daemon should own SQLite exclusively; Electron reads via IPC.
- **Putting supervisor logic in the daemon itself:** The daemon cannot restart itself. The supervisor belongs in the parent process (DaemonManager in Electron main).
- **Using stderr for structured events:** Reserve stderr for human-readable debug logging. All structured communication goes over stdout (events) and stdin (commands).
- **Polling daemon status from Electron:** The daemon should push status changes via events. Electron should not poll.
- **Global singleton daemon:** The brainstorm specifies one daemon per workspace. Switching workspaces stops the old daemon and starts a new one. Do not create a single global daemon.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| JSON-lines parsing | Custom streaming parser | Line-based buffer split on `\n` + `JSON.parse()` | The protocol is simple enough that a few lines of buffer code suffice. No library needed. But do not skip the buffer; chunks from `data` events are not line-aligned. |
| SQLite database access | Custom FFI bindings | `bun:sqlite` (built-in) | Zero dependency, synchronous, fast. Already ships with Bun. |
| Schema validation | `typeof` checks | `zod` (already in deps) | Validates JSON-lines messages at process boundary. Catches protocol mismatches early. |
| Process spawning | `Bun.spawn()` from Electron | `child_process.spawn()` (Node.js) | Electron main process is Node.js. Must use Node.js APIs. |
| Exponential backoff | External library | Inline calculation: `min(base * 2^n, max)` | Three lines of arithmetic. A library would be overkill. |

**Key insight:** This phase has no external dependencies to add. Everything needed is built into the runtime (Bun for SQLite, Node.js for child_process) or already in the project (zod for validation).

## Common Pitfalls

### Pitfall 1: Partial JSON Lines in stdout Buffer

**What goes wrong:** `data` events from `child_process` stdout do not respect message boundaries. A single `data` event may contain half a JSON line, or multiple lines, or a line split across two events.

**Why it happens:** Node.js streams deliver raw byte chunks, not logical messages.

**How to avoid:** Always buffer incoming data and split on `\n`. Only parse complete lines (terminated by newline). Keep the remainder in the buffer for the next `data` event.

**Warning signs:** `SyntaxError: Unexpected end of JSON input` from `JSON.parse()`.

### Pitfall 2: Daemon stdout Pollution

**What goes wrong:** Debug `console.log()` in daemon code writes to stdout, corrupting the JSON-lines protocol. The parent receives non-JSON data and crashes.

**Why it happens:** Bun's `console.log()` writes to stdout by default.

**How to avoid:** In the daemon entry point, redirect all logging to stderr (`console.error()` or a custom logger). Only use `process.stdout.write()` for protocol messages. Consider setting a global `debug()` function that writes to stderr.

**Warning signs:** `SyntaxError: Unexpected token` when parsing daemon events. Intermittent parsing failures that correlate with debug logging.

### Pitfall 3: WAL Checkpoint Starvation

**What goes wrong:** The WAL file grows unbounded because a long-running reader (or a separate process holding a read connection) prevents checkpointing.

**Why it happens:** SQLite cannot checkpoint (merge WAL into main DB) while any reader holds a snapshot.

**How to avoid:** Since only the daemon writes and reads SQLite (Electron reads via IPC, not directly), this is unlikely in Phase 11. If a future phase adds direct SQLite reading from Electron, ensure read connections are short-lived and closed promptly.

**Warning signs:** `daemon.db-wal` file growing continuously (megabytes+).

### Pitfall 4: Zombie Daemon on Electron Crash

**What goes wrong:** Electron crashes or is force-killed (SIGKILL). The daemon subprocess keeps running because it was not sent SIGTERM.

**Why it happens:** SIGKILL is not catchable. The parent cannot run cleanup handlers.

**How to avoid:** PID file pattern. On app startup, check for stale PID file, kill orphaned process. Additionally, the daemon should detect parent death: if stdin closes (EOF), the daemon should exit gracefully.

**Warning signs:** Multiple daemon processes visible in Activity Monitor. Port conflicts (if daemon later uses ports). SQLite lock contention.

### Pitfall 5: Race Condition on Daemon Start/Stop

**What goes wrong:** Rapid workspace switching triggers stop + start in quick succession. The old daemon's exit handler fires after the new daemon starts, corrupting state.

**Why it happens:** `stop()` is async (waits for process exit). If `start()` is called before `stop()` completes, two daemons run simultaneously.

**How to avoid:** Serialize start/stop operations. `DaemonManager.start()` should first await any pending `stop()`. Use a state machine: `stopped -> starting -> running -> stopping -> stopped`. Reject operations that violate state transitions.

**Warning signs:** Multiple daemon processes for the same workspace. Duplicate events in the UI.

### Pitfall 6: SQLite Database Locked on Crash Recovery

**What goes wrong:** Daemon crashes while holding a write lock. On restart, the new daemon instance gets `SQLITE_BUSY` or `SQLITE_LOCKED`.

**Why it happens:** SQLite WAL mode with a crashed writer can leave lock state files (`.db-shm`, `.db-wal`).

**How to avoid:** Set `PRAGMA busy_timeout = 5000` so SQLite retries for 5 seconds before returning BUSY. WAL mode handles crash recovery automatically on the next connection open.

**Warning signs:** `SqliteError: database is locked` on daemon restart.

## Code Examples

### DaemonManager Lifecycle (Electron Main Process)

```typescript
// Source: Pattern derived from existing SessionManager + child_process docs
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import type { DaemonCommand, DaemonEvent, DaemonStatus } from '@craft-agent/core/types';

type DaemonManagerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'paused';

class DaemonManager {
  private process: ChildProcess | null = null;
  private state: DaemonManagerState = 'stopped';
  private stdoutBuffer = '';

  // Supervisor state
  private consecutiveFailures = 0;
  private lastStartTime = 0;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bunPath: string,
    private readonly daemonScript: string,
    private readonly configDir: string,
    private readonly onEvent: (event: DaemonEvent) => void,
  ) {}

  async start(): Promise<void> {
    if (this.state === 'stopping') {
      await this.waitForStop();
    }
    if (this.state === 'running' || this.state === 'starting') return;

    this.state = 'starting';
    this.lastStartTime = Date.now();

    this.process = spawn(this.bunPath, ['run', this.daemonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KATA_CONFIG_DIR: this.configDir,
      },
    });

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.handleStdoutChunk(chunk.toString());
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      // Log daemon debug output
      console.error(`[daemon] ${chunk.toString().trimEnd()}`);
    });

    this.process.on('exit', (code, signal) => {
      this.handleExit(code, signal);
    });

    this.sendCommand({ type: 'start' });
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;
    let idx: number;
    while ((idx = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, idx).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (line) {
        try {
          const event: DaemonEvent = JSON.parse(line);
          if (event.type === 'status_changed' && event.status === 'running') {
            this.state = 'running';
          }
          this.onEvent(event);
        } catch (err) {
          console.error('[daemon] Failed to parse event:', line);
        }
      }
    }
  }

  sendCommand(cmd: DaemonCommand): void {
    if (!this.process?.stdin?.writable) return;
    this.process.stdin.write(JSON.stringify(cmd) + '\n');
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') return;
    this.state = 'stopping';
    this.cancelPendingRestart();
    this.sendCommand({ type: 'stop' });
    // Give daemon 5s to shut down gracefully, then SIGTERM
    const timeout = setTimeout(() => {
      this.process?.kill('SIGTERM');
    }, 5000);
    await this.waitForStop();
    clearTimeout(timeout);
  }
}
```

### SQLite Message Queue Schema

```typescript
// Source: bun:sqlite docs + SQLite queue patterns
import { Database } from 'bun:sqlite';

export function createMessageQueue(dbPath: string): Database {
  const db = new Database(dbPath);

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  db.run('PRAGMA synchronous = NORMAL');  // Safe with WAL mode

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      channel_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      processed_at TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_pending
    ON messages (direction, status, created_at)
    WHERE status = 'pending'
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_channel
    ON messages (channel_id, direction, created_at)
  `);

  return db;
}
```

### Queue Operations

```typescript
// Source: bun:sqlite docs
export class MessageQueue {
  private db: Database;
  private enqueueStmt: ReturnType<Database['query']>;
  private dequeueStmt: ReturnType<Database['query']>;
  private markProcessedStmt: ReturnType<Database['query']>;
  private markFailedStmt: ReturnType<Database['query']>;

  constructor(dbPath: string) {
    this.db = createMessageQueue(dbPath);

    this.enqueueStmt = this.db.query(
      `INSERT INTO messages (direction, channel_id, payload)
       VALUES ($direction, $channelId, $payload)`
    );

    // Atomic dequeue: claim the oldest pending message
    this.dequeueStmt = this.db.query(
      `UPDATE messages
       SET status = 'processing', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = (
         SELECT id FROM messages
         WHERE direction = $direction AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING *`
    );

    this.markProcessedStmt = this.db.query(
      `UPDATE messages SET status = 'processed' WHERE id = $id`
    );

    this.markFailedStmt = this.db.query(
      `UPDATE messages
       SET status = 'failed', error = $error, retry_count = retry_count + 1
       WHERE id = $id`
    );
  }

  enqueue(direction: 'inbound' | 'outbound', channelId: string, payload: unknown): number {
    const result = this.enqueueStmt.run({
      $direction: direction,
      $channelId: channelId,
      $payload: JSON.stringify(payload),
    });
    return result.lastInsertRowid as number;
  }

  dequeue(direction: 'inbound' | 'outbound'): QueuedMessage | null {
    const row = this.dequeueStmt.get({ $direction: direction });
    return row ? { ...row, payload: JSON.parse(row.payload) } : null;
  }

  markProcessed(id: number): void {
    this.markProcessedStmt.run({ $id: id });
  }

  markFailed(id: number, error: string): void {
    this.markFailedStmt.run({ $id: id, $error: error });
  }

  close(): void {
    this.db.close();
  }
}
```

### Daemon Entry Point (Bun Subprocess)

```typescript
// Source: Bun stdin stream docs
const decoder = new TextDecoder();
let stdinBuffer = '';

// All logging goes to stderr to keep stdout clean for protocol
function log(msg: string): void {
  process.stderr.write(`[daemon] ${msg}\n`);
}

function emit(event: DaemonEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

async function main(): Promise<void> {
  log('Starting daemon process');
  emit({ type: 'status_changed', status: 'starting' });

  // Initialize SQLite
  const queue = new MessageQueue(join(configDir, 'daemon.db'));

  emit({ type: 'status_changed', status: 'running' });

  // Read commands from stdin
  const reader = Bun.stdin.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Parent closed stdin - exit gracefully
      log('stdin closed, shutting down');
      break;
    }
    stdinBuffer += decoder.decode(value, { stream: true });
    processBuffer(queue);
  }

  emit({ type: 'status_changed', status: 'stopping' });
  queue.close();
  emit({ type: 'status_changed', status: 'stopped' });
}

main().catch(err => {
  process.stderr.write(`[daemon] Fatal: ${err.message}\n`);
  process.exit(1);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Node.js `child_process.fork()` for IPC | stdin/stdout JSON-lines for cross-runtime IPC | N/A (architectural decision) | Enables Bun child process from Node.js parent without runtime coupling |
| `better-sqlite3` (Node.js native addon) | `bun:sqlite` (built-in) | Bun 1.0 (2023) | Zero-dependency SQLite in Bun runtime. No native rebuild needed. |
| External process managers (pm2, forever) | Inline supervisor in parent process | Desktop app pattern | Simpler, no external deps, full control over restart behavior |

**Deprecated/outdated:**
- `child_process.fork()` with IPC channel: Only works when both parent and child are Node.js. Not applicable for Node.js -> Bun communication.
- `Electron.utilityProcess`: Spawns Node.js children, not Bun. Cannot use `bun:sqlite`.

## Open Questions

1. **Database path: global vs per-workspace**
   - What we know: The brainstorm hybrid report says `~/.kata-agents/workspaces/{id}/daemon.db` (per-workspace). The phase description says `~/.kata-agents/daemon.db` (global).
   - What's unclear: Which is correct for Phase 11.
   - Recommendation: Use `~/.kata-agents/daemon.db` (global) for Phase 11. The daemon process itself is workspace-scoped (one per active workspace), but the queue database can be global with a `workspace_id` column. Switching workspaces restarts the daemon; the new daemon queries only its workspace's messages. This avoids creating SQLite files in every workspace directory.

2. **Bun executable path in packaged app**
   - What we know: The existing agent SDK subprocess uses `customExecutable` from `options.ts` which resolves to the bundled Bun binary. The pattern `process.execPath` with `BUN_BE_BUN=1` is used in packaged builds.
   - What's unclear: Whether the daemon subprocess should use the same Bun binary resolution logic.
   - Recommendation: Reuse the existing `getDefaultOptions()` pattern for resolving the Bun binary path. The daemon is spawned differently (not via the SDK), but the binary resolution is the same problem.

3. **Graceful shutdown ordering**
   - What we know: The daemon should shut down when the Electron app closes. `app.on('before-quit')` is the standard Electron lifecycle hook.
   - What's unclear: How to order daemon shutdown relative to active agent session cleanup.
   - Recommendation: Stop the daemon before cleaning up agent sessions. The daemon is a background service; agent sessions have user-visible state. Daemon shutdown should be fast (<5s).

## Sources

### Primary (HIGH confidence)
- `/oven-sh/bun` (Context7) - Bun.spawn subprocess management, stdin/stdout pipe configuration, onExit callbacks, process lifecycle
- `/oven-sh/bun` (Context7) - bun:sqlite Database class, WAL mode, prepared statements, transactions
- Codebase: `packages/core/src/types/daemon.ts` - Existing DaemonCommand, DaemonEvent, DaemonStatus types (from Phase 10)
- Codebase: `packages/shared/src/agent/mode-types.ts` - Existing `daemon` permission mode, DAEMON_DEFAULT_ALLOWLIST
- Codebase: `packages/shared/src/agent/options.ts` - Existing Bun binary resolution pattern for subprocess spawning
- Codebase: `packages/shared/src/config/paths.ts` - CONFIG_DIR resolution (supports KATA_CONFIG_DIR env var)

### Secondary (MEDIUM confidence)
- Node.js `child_process` documentation - spawn() with stdio pipes, exit handling
- Codebase: `apps/electron/src/main/sessions.ts` - Existing subprocess management patterns in SessionManager

### Tertiary (LOW confidence)
- WebSearch: SQLite message queue schema patterns - Used for schema design inspiration, verified against bun:sqlite API
- WebSearch: Exponential backoff supervisor patterns - Used for restart logic, verified against Node.js child_process API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components are built-in (bun:sqlite, child_process) or already in the project (zod). No new dependencies.
- Architecture: HIGH - Patterns verified against Context7 docs and existing codebase conventions. stdin/stdout JSON-lines is well-established.
- Pitfalls: HIGH - Identified from existing codebase patterns (stdout pollution in agent SDK, process cleanup in SessionManager) and SQLite documentation.

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable; no fast-moving dependencies)
