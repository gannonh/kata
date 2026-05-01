# Symphony

Symphony is a headless orchestrator that polls a configured issue tracker for
candidate issues and dispatches each one to an agent session running in an
isolated workspace. It supports both Codex app-server and Pi RPC
(`agent.name`), tracks concurrency limits, retries failures with exponential
back-off, reconciles issue state on each poll cycle, and optionally exposes a
live HTTP dashboard and JSON API for observability. SSH remote worker pools are
supported for distributing agent sessions across multiple machines.

## How It Works

1. Symphony polls the configured tracker for issues in active states, such as `Todo` and `In Progress`.
2. For each routable issue, it creates an isolated workspace and starts the configured worker runner.
3. The worker reads the issue, updates the Agent Workpad, changes code, validates, publishes a PR, and advances the tracker state through the configured lifecycle.
4. When the issue reaches a terminal state, Symphony reconciles bookkeeping and optionally cleans up the workspace.

---

## Prerequisites

- **Rust stable toolchain** (install via [rustup](https://rustup.rs/))
- Tracker credentials for the configured backend, such as GitHub token env vars or a Linear personal API key.
- Agent runtime binary reachable on `PATH`:
  - Codex runner: `codex ... app-server`
  - Pi runner: `pi --mode rpc`

Build the release binary:

```sh
cargo build --release
# binary written to: target/release/symphony
```

---

## Running

```sh
symphony [WORKFLOW.md] [--port PORT] [--logs-root PATH] [--no-tui]
```

### CLI Flag Reference

| Flag                       | Type | Default       | Description                                                                                                                                     |
| -------------------------- | ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKFLOW.md` (positional) | path | `WORKFLOW.md` | Path to the WORKFLOW.md configuration file                                                                                                      |
| `--port PORT`              | u16  | `8080`        | Bind the HTTP dashboard and API on this port. Overrides `server.port` in the workflow file.                                                     |
| `--logs-root PATH`         | path | _(none)_      | Directory root for agent log files.                                                                                                             |
| `--no-tui`                 | flag | `false`       | Disable the Ratatui terminal dashboard. Without this flag, TUI is enabled by default and stdout logs are suppressed unless logs write to files. |

### Exit Codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Clean shutdown (Ctrl-C or orchestrator loop returned normally)          |
| `1`  | Startup failure (bad config, missing workflow file, orchestrator error) |
| `2`  | CLI parse error (unrecognised flag, bad argument type)                  |

### Log Verbosity

Symphony emits structured JSON logs via `tracing`. Control verbosity with
`SYMPHONY_LOG`:

```sh
SYMPHONY_LOG=debug symphony WORKFLOW.md
SYMPHONY_LOG=symphony=trace,info symphony WORKFLOW.md   # trace symphony, info everything else
```

Default level is `info`. `RUST_LOG` is still accepted as a legacy fallback
when `SYMPHONY_LOG` is unset.

When `--logs-root` is set, logs write to rotating files under
`<logs-root>/log/symphony.log` and stdout shows only the startup banner.
`SYMPHONY_LOG_ROOT` provides the default logs root when the flag is omitted;
the flag wins when both are set.
Without `--logs-root`, stdout logs are suppressed while the default TUI is
active. Pass `--no-tui` to stream structured JSON logs to stdout instead.

---

## WORKFLOW.md Format

The workflow file is a Markdown document with a YAML front-matter block.
The YAML front matter is parsed as runtime configuration and is never sent to
the worker as prompt text.

The Markdown body after the second `---` is the fallback prompt. When the
`prompts` section is configured and a matching state prompt (or default prompt)
resolves, Symphony sends the configured prompt files instead of the Markdown
body. When `prompts` is absent or no prompt resolves, Symphony sends the
Markdown body for all states.

A fully documented reference template with all settings and inline comments
is at `docs/WORKFLOW-REFERENCE.md`. Copy it to your project root as `WORKFLOW.md` and customize the settings.

### Config Field Reference

#### `tracker` section

| Field                     | Type     | Default                                                    | Description                                                                                                                                                                                                               |
| ------------------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tracker.kind`            | string   | _(required)_                                               | Must be `"linear"`.                                                                                                                                                                                                       |
| `tracker.api_key`         | string   | _(required)_                                               | Linear personal API key. Supports `$VAR` env-var indirection (e.g. `$LINEAR_API_KEY`). Never logged.                                                                                                                      |
| `tracker.project_slug`    | string   | _(required)_                                               | Linear project URL slug (the identifier shown in project URLs). Supports `$VAR` indirection.                                                                                                                              |
| `tracker.workspace_slug`  | string   | `"kata-sh"`                                                | Linear workspace slug used when building dashboard project links (`https://linear.app/<workspace>/project/<slug>`). Supports `$VAR` indirection.                                                                          |
| `tracker.endpoint`        | string   | `https://api.linear.app/graphql`                           | Linear GraphQL endpoint. Override for self-hosted Linear.                                                                                                                                                                 |
| `tracker.assignee`        | string   | _(none)_                                                   | Filter candidate issues to this Linear username. Supports `$VAR` indirection.                                                                                                                                             |
| `tracker.active_states`   | string[] | `["Todo", "In Progress"]`                                  | Issue states that are eligible for dispatch.                                                                                                                                                                              |
| `tracker.terminal_states` | string[] | `["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]` | Issue states that mark an agent run as complete.                                                                                                                                                                          |
| `tracker.exclude_labels`  | string[] | `[]`                                                       | Labels that disqualify an issue from dispatch. Any issue carrying at least one of these labels is skipped (case-insensitive). Use `["kata:task"]` to prevent Kata sub-tasks from being dispatched as independent workers. |

#### `polling` section

| Field                 | Type | Default | Description                    |
| --------------------- | ---- | ------- | ------------------------------ |
| `polling.interval_ms` | u64  | `30000` | Poll interval in milliseconds. |

#### `workspace` section

| Field                         | Type     | Default                       | Description                                                                                                                              |
| ----------------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace.root`              | string   | `$TMPDIR/symphony_workspaces` | Root directory for per-issue agent workspaces. Supports `~` tilde expansion.                                                             |
| `workspace.repo`              | string   | _(none)_                      | Repository URL or local path to bootstrap into each newly-created workspace.                                                             |
| `workspace.git_strategy`      | string   | `"auto"`                      | Git bootstrap strategy: `"clone-local"`, `"clone-remote"`, `"worktree"`, or `"auto"` (detect local path vs remote URL).                  |
| `workspace.strategy`          | string   | _(deprecated)_                | Legacy alias accepted for backward compatibility: `"clone"` maps to `git_strategy: auto`, `"worktree"` maps to `git_strategy: worktree`. |
| `workspace.isolation`         | string   | `"local"`                     | Workspace runtime isolation model: `"local"` or `"docker"` (ephemeral per-issue worker containers).                                      |
| `workspace.branch_prefix`     | string   | `"symphony"`                  | Branch prefix used for auto-created issue branches (`<prefix>/<issue-identifier>`).                                                      |
| `workspace.clone_branch`      | string   | _(none)_                      | Optional source branch for clone-based bootstraps (`clone-local`, `clone-remote`, or `auto` when clone is selected).                     |
| `workspace.base_branch`       | string   | `"main"`                      | Base branch used by workflow instructions for merge/rebase/pull targets (for example `origin/{{ workspace.base_branch }}`).              |
| `workspace.cleanup_on_done`   | bool     | `false`                       | Remove the issue workspace when the issue reaches a terminal state. Runs `hooks.before_remove` and ignores cleanup failures.             |
| `workspace.docker.image`      | string   | `"symphony-worker:latest"`    | Base worker image used by Docker isolation mode.                                                                                         |
| `workspace.docker.setup`      | string   | _(none)_                      | Optional setup script path used to build/cache a derived worker image layer.                                                             |
| `workspace.docker.codex_auth` | string   | `"auto"`                      | Docker Codex auth mode: `auto`, `mount`, or `env`.                                                                                       |
| `workspace.docker.env`        | string[] | `[]`                          | Additional `KEY=value` env entries passed to `docker run`.                                                                               |
| `workspace.docker.volumes`    | string[] | `[]`                          | Additional bind mounts passed to `docker run`.                                                                                           |

#### `agent` section

| Field                         | Type                | Default                   | Description                                                                                              |
| ----------------------------- | ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `agent.max_concurrent_agents` | u32                 | `10`                      | Global cap on simultaneously running agent sessions.                                                     |
| `agent.max_turns`             | u32                 | `20`                      | Maximum prompt turns per session attempt before the worker run ends.                                     |
| `agent.max_retry_backoff_ms`  | u64                 | `300000`                  | Maximum exponential back-off delay (ms) between retries.                                                 |
| `agent.escalation_timeout_ms` | u64                 | `300000`                  | Timeout (ms) to wait for a human escalation response before falling back to auto-cancel/reject behavior. |
| `agent.name`                  | string              | `"pi"`                    | Worker runner: `"pi"` or `"codex"`. This is not the tracker/backend-state backend.                       |
| `agent.command`               | string or string[]  | `["pi", "--mode", "rpc"]` | Complete static launch command. Local workers start with the workspace as process cwd.                   |
| `agent.model`                 | string              | _(none)_                  | Optional default model override passed to runners that support it.                                       |
| `agent.model_by_state`        | map<string, string> | `{}`                      | Optional per-state model overrides. Keys are lowercased state names; falls back to `model`.              |
| `agent.no_session`            | bool                | `true`                    | Pass `--no-session` to Pi.                                                                               |
| `agent.append_system_prompt`  | string              | _(none)_                  | Optional path passed via `--append-system-prompt` to Pi.                                                 |
| `agent.turn_timeout_ms`       | u64                 | `3600000`                 | Hard timeout per Codex turn (1 hour default).                                                            |
| `agent.read_timeout_ms`       | u64                 | `5000`                    | Timeout waiting for runtime process output (ms).                                                         |
| `agent.stall_timeout_ms`      | u64                 | `300000`                  | Time before a non-progressing session is considered stalled (5 min default).                             |
| `agent.approval_policy`       | object              | _(reject all)_            | Codex approval policy.                                                                                   |
| `agent.thread_sandbox`        | string              | `"workspace-write"`       | Codex sandbox mode for the agent thread.                                                                 |
| `agent.turn_sandbox_policy`   | object              | _(none)_                  | Per-turn Codex sandbox policy override.                                                                  |

#### `hooks` section

| Field                 | Type   | Default  | Description                                                          |
| --------------------- | ------ | -------- | -------------------------------------------------------------------- |
| `hooks.after_create`  | string | _(none)_ | Shell command run after the workspace is created.                    |
| `hooks.before_run`    | string | _(none)_ | Shell command run before the agent session starts.                   |
| `hooks.after_run`     | string | _(none)_ | Shell command run after the agent session ends (success or failure). |
| `hooks.before_remove` | string | _(none)_ | Shell command run before the workspace is removed.                   |
| `hooks.timeout_ms`    | u64    | `60000`  | Timeout for each hook invocation (ms).                               |

All hooks receive these environment variables:
`SYMPHONY_ISSUE_ID`, `SYMPHONY_ISSUE_IDENTIFIER`, `SYMPHONY_ISSUE_TITLE`,
`SYMPHONY_WORKSPACE_PATH`.

#### `worker` section (SSH)

| Field                                   | Type     | Default  | Description                                                                                                               |
| --------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `worker.ssh_hosts`                      | string[] | `[]`     | Remote SSH hosts for distributed agent sessions. Format: `host`, `host:port`, `user@host:port`, or `[::1]:2222` for IPv6. |
| `worker.max_concurrent_agents_per_host` | u32      | _(none)_ | Per-host concurrency cap. When absent, hosts are treated as having unlimited capacity.                                    |

#### `server` section

| Field               | Type   | Default       | Description                                                                     |
| ------------------- | ------ | ------------- | ------------------------------------------------------------------------------- |
| `server.port`       | u16    | _(none)_      | HTTP server port. Equivalent to `--port` on the CLI; `--port` takes precedence. |
| `server.host`       | string | `"127.0.0.1"` | HTTP server bind address.                                                       |
| `server.public_url` | string | _(none)_      | Optional external dashboard URL (reserved for future use).                      |

#### `notifications` section

Optional. Configure outbound webhook notifications for events requiring human attention.

| Field                             | Type     | Default  | Description                                                                                                                                                                                                                                                      |
| --------------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications.slack.webhook_url` | string   | _(none)_ | Slack incoming webhook URL. Supports `$VAR` env-var indirection.                                                                                                                                                                                                 |
| `notifications.slack.events`      | string[] | `[]`     | Event filters. State transitions: `todo`, `in_progress`, `agent_review`, `human_review`, `merging`, `rework`, `done`, `closed`, `cancelled`. Runtime events: `stalled`, `failed`. Use `all` for everything. Case-insensitive. Empty list means no notifications. |

When omitted, notifications are disabled. Messages include a clickable link to the Linear issue.

#### `prompts` section (per-state prompt injection)

Optional. When configured, the orchestrator selects a prompt template based on the issue's Linear state instead of using the monolithic markdown body after `---`.

| Field              | Type               | Default  | Description                                                                                                            |
| ------------------ | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `prompts.system`   | string             | _(none)_ | Path to system-level preamble (agent identity, tool guidance). Injected every turn. Relative to WORKFLOW.md directory. |
| `prompts.repo`     | string             | _(none)_ | Path to repository-specific context (build commands, layout). Injected every turn. Relative to WORKFLOW.md directory.  |
| `prompts.by_state` | map<string,string> | `{}`     | Map of Linear state name → prompt file path. State matching is case-insensitive.                                       |
| `prompts.default`  | string             | _(none)_ | Fallback prompt file for states not listed in `by_state`.                                                              |

When `prompts` is absent, the markdown body after `---` is used as the prompt for all states (backward compatible).

Prompt files are concatenated in order: `system` + `repo` + state-specific, separated by `---`.

Example:

```yaml
prompts:
  system: prompts/system.md
  repo: prompts/my-repo.md
  by_state:
    Todo: prompts/in-progress.md
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
  default: prompts/in-progress.md
```

Template variables available: `{{ issue.identifier }}`, `{{ issue.title }}`, `{{ issue.state }}`, `{{ issue.labels }}`, `{{ issue.description }}`, `{{ issue.url }}`, `{{ issue.children_count }}`, `{{ issue.parent_identifier }}`, `{{ attempt }}`, `{{ workspace.base_branch }}`.

The `in-progress.md` prompt uses `{% if issue.children_count > 0 %}` to detect Kata-planned slices vs flat tickets, eliminating the need for separate workflow files.

### Minimal Working Example

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project

workspace:
  root: ~/symphony_workspaces
  repo: https://github.com/example/project.git
  git_strategy: auto
  isolation: local
  branch_prefix: symphony
  clone_branch: elixir-feature-parity
  base_branch: main
  cleanup_on_done: true

codex:
  command: codex app-server
---

# My Workflow

Issues assigned to this project will be dispatched to Codex.
```

### Full Example with All Sections

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: eng-infra
  assignee: alice
  active_states:
    - "In Progress"
    - "Todo"
  terminal_states:
    - "Done"
    - "Cancelled"

polling:
  interval_ms: 15000

workspace:
  root: ~/workspaces/symphony
  repo: /Users/alice/code/kata
  git_strategy: worktree
  isolation: local
  branch_prefix: symphony
  base_branch: main
  cleanup_on_done: true

agent:
  max_concurrent_agents: 5
  max_turns: 30
  max_retry_backoff_ms: 120000

codex:
  command: [codex, app-server]
  turn_timeout_ms: 7200000
  stall_timeout_ms: 600000

hooks:
  before_run: echo "Starting session for $SYMPHONY_ISSUE_IDENTIFIER"
  after_run: notify-send "Session complete"
  timeout_ms: 30000

worker:
  ssh_hosts:
    - worker1.example.com
    - worker2.example.com:2222
    - alice@worker3.example.com
  max_concurrent_agents_per_host: 3

server:
  port: 8080
  host: 0.0.0.0
---
```

---

## Configuration Reference

### Environment Variables

| Variable              | Description                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LINEAR_API_KEY`      | Linear personal API key. Used directly or as the canonical fallback when `tracker.api_key: $LINEAR_API_KEY` is set in the workflow file.                             |
| `GH_TOKEN`            | GitHub classic PAT for GitHub-backed Symphony runs. Required scopes: `repo`, `project`, `workflow`, `read:org`, and `read:discussion`.                               |
| `GITHUB_TOKEN`        | Alternative GitHub PAT env var when `GH_TOKEN` is unset. Use the same scopes as `GH_TOKEN`.                                                                          |
| `SYMPHONY_LOG`        | Log filter directives for `tracing_subscriber`. Examples: `info`, `debug`, `symphony=trace`. Default: `info`.                                                        |
| `SYMPHONY_LOG_ROOT`   | Default directory root for file logs when `--logs-root` is omitted. The active log is `<SYMPHONY_LOG_ROOT>/log/symphony.log`.                                         |
| `RUST_LOG`            | Legacy fallback for log filtering when `SYMPHONY_LOG` is unset. Prefer `SYMPHONY_LOG` in new docs and local setup.                                                   |
| `HOME`                | Used for tilde (`~`) expansion in `workspace.root`.                                                                                                                  |
| `SYMPHONY_SSH_CONFIG` | Path to a custom SSH config file. When set, Symphony passes `-F <path>` to every `ssh` invocation. Useful for custom host keys, ProxyJump, or IdentityFile settings. |

### Hook Environment Variables

The following variables are injected for every lifecycle hook invocation:

| Variable                    | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `SYMPHONY_ISSUE_ID`         | Linear issue UUID.                                        |
| `SYMPHONY_ISSUE_IDENTIFIER` | Human-readable issue identifier (for example, `KAT-800`). |
| `SYMPHONY_ISSUE_TITLE`      | Linear issue title.                                       |
| `SYMPHONY_WORKSPACE_PATH`   | Absolute path to the workspace directory.                 |

### `$VAR` Indirection Pattern

String config fields that accept `$VAR` notation resolve the named environment
variable at startup. If the variable is unset or empty, Symphony logs a warning
and treats the field as absent. Example:

```yaml
tracker:
  api_key: $MY_LINEAR_TOKEN   # resolved from process environment
  project_slug: $PROJECT_SLUG
```

Valid `$VAR` references are bare identifiers (no `/`, spaces, or `:`). A value
like `$HOME/path` is **not** treated as an env reference — use `workspace.root`
with tilde expansion instead.

---

## HTTP Dashboard and API

Enable the HTTP server by passing `--port PORT` on the CLI or setting
`server.port` in the workflow file:

```sh
symphony WORKFLOW.md --port 8080
```

By default the server binds to `127.0.0.1`. Override with `server.host` in the
workflow file (e.g. `0.0.0.0` to bind all interfaces).

### Endpoint Reference

| Method | Path                                      | Description                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/`                                       | HTML dashboard — auto-refreshes every 2 seconds. Shows summary cards, running sessions table (including turn/max-turns, last activity age, and per-session tokens), retry queue table, completed issue list, token breakdown, polling diagnostics, and collapsible rate-limit JSON. |
| `GET`  | `/api/v1/state`                           | Full orchestrator state as JSON.                                                                                                                                                                                                                                                    |
| `GET`  | `/api/v1/events`                          | WebSocket event stream of `SymphonyEventEnvelope` values. Supports server-side query filters (`issue`, `type`, `severity`), emits snapshot bootstrap + heartbeat envelopes, and enforces backpressure close policy.                                                                 |
| `GET`  | `/api/v1/escalations`                     | Returns pending escalation requests (`pending_escalations`) for polling clients.                                                                                                                                                                                                    |
| `POST` | `/api/v1/escalations/:request_id/respond` | Resolves a pending escalation. Body: `{ "response": <json>, "responder_id"?: "..." }`. Returns `200`, `404` (missing/expired), or `409` (already resolved).                                                                                                                         |
| `GET`  | `/api/v1/:issue_identifier`               | Per-issue projection. `:issue_identifier` must match the pattern `TEAM-NNN` (uppercase prefix, hyphen, digits). Returns 404 when the issue is not running or in the retry queue.                                                                                                    |
| `POST` | `/api/v1/refresh`                         | Request an immediate Linear poll. Requests are coalesced — multiple concurrent POSTs result in one actual refresh. Returns 202.                                                                                                                                                     |

### Sample JSON — `GET /api/v1/state`

```json
{
  "poll_interval_ms": 30000,
  "max_concurrent_agents": 10,
  "running": {
    "issue-id-123": {
      "issue_id": "issue-id-123",
      "issue_identifier": "ENG-42",
      "issue_title": "Ship dashboard metrics",
      "status": "running",
      "attempt": 1,
      "error": null,
      "worker_host": null,
      "workspace_path": "/tmp/symphony_workspaces/ENG-42",
      "started_at": "2026-03-22T15:40:00Z",
      "linear_state": "In Progress"
    }
  },
  "running_session_info": {
    "issue-id-123": {
      "turn_count": 3,
      "max_turns": 20,
      "last_activity_ms": 1760000000000,
      "session_tokens": {
        "input_tokens": 1200,
        "output_tokens": 430,
        "total_tokens": 1630
      }
    }
  },
  "claimed": ["issue-id-456"],
  "retry_queue": [
    {
      "issue_id": "issue-id-789",
      "identifier": "ENG-99",
      "attempt": 2,
      "due_in_ms": 30000,
      "error": "stall timeout exceeded",
      "worker_host": null,
      "workspace_path": "/tmp/symphony_workspaces/ENG-99"
    }
  ],
  "completed": [
    {
      "issue_id": "issue-id-001",
      "identifier": "ENG-12",
      "title": "Initial bootstrap",
      "completed_at": "2026-03-22T15:20:00Z"
    }
  ],
  "codex_totals": {
    "total_tokens": 148230,
    "input_tokens": 120000,
    "output_tokens": 28230
  },
  "codex_rate_limits": null,
  "polling": {
    "checking": false,
    "next_poll_in_ms": 15000,
    "poll_interval_ms": 30000,
    "last_poll_at": "2026-03-22T15:45:00Z",
    "poll_count": 12
  }
}
```

### Sample JSON — `GET /api/v1/ENG-42`

```json
{
  "issue": {
    "issue_id": "issue-id-123",
    "issue_identifier": "ENG-42",
    "status": "running",
    "attempt": 1,
    "error": null,
    "worker_host": "worker1.example.com",
    "workspace_path": "/tmp/symphony_workspaces/ENG-42"
  }
}
```

`running` entries in `/api/v1/state` are serialized `RunAttempt` records (which
include fields like `issue_title` and `linear_state`). Dashboard observability
fields (`turn_count`, `max_turns`, `last_activity_ms`, `session_tokens`) are
provided alongside each run in `running_session_info`.

### Sample JSON — `POST /api/v1/refresh`

```json
{
  "queued": true,
  "coalesced": false,
  "pending_requests": 1
}
```

### Escalation lifecycle (`/api/v1/events` + `/api/v1/escalations`)

Escalations are emitted as typed event envelopes:
`escalation_created`, `escalation_responded`, `escalation_timed_out`, and
`escalation_cancelled`.

Example `escalation_created` payload:

```json
{
  "version": "v1",
  "sequence": 128,
  "timestamp": "2026-03-27T12:00:00Z",
  "kind": "escalation_created",
  "severity": "info",
  "issue": "KAT-1161",
  "event": "escalation_created",
  "payload": {
    "request_id": "escalation-1743076800000-1",
    "issue_id": "8f1...",
    "issue_identifier": "KAT-1161",
    "method": "ask_user_questions",
    "preview": "Pick one option",
    "timeout_ms": 300000
  }
}
```

---

## SSH Remote Workers

Symphony can distribute agent sessions across a pool of remote SSH hosts.
Configure hosts in the `worker` section:

```yaml
worker:
  ssh_hosts:
    - worker1.example.com           # default port 22
    - worker2.example.com:2222      # custom port
    - alice@worker3.example.com     # custom user
    - [::1]:2222                    # bracketed IPv6 with port
  max_concurrent_agents_per_host: 3
```

### Host Selection Behaviour

- When `ssh_hosts` is empty, Symphony runs all agent sessions locally.
- When hosts are configured, each dispatch selects the least-loaded eligible
  host (deterministic tiebreak by configuration order).
- If a prior run attempt was on a specific host, Symphony prefers that host
  for continuation when it is still under cap.
- When all hosts are at or above `max_concurrent_agents_per_host`, the issue
  remains in the candidate queue until a slot opens.

### `SYMPHONY_SSH_CONFIG`

Set this environment variable to a custom SSH config file path. Symphony passes
`-F <path>` to every `ssh` invocation, enabling per-host IdentityFile,
ProxyJump, StrictHostKeyChecking, and other OpenSSH options:

```sh
export SYMPHONY_SSH_CONFIG=~/.ssh/symphony_config
symphony WORKFLOW.md
```

### Remote Command Execution

Symphony connects via `ssh -T [-F config] -p <port> <host> bash -lc '<command>'`.
The command string is POSIX single-quote-escaped. The remote host must have
`bash` available and the configured runtime binary on its `PATH`
(`agent.command`).

### Docker Isolation Lifecycle

When `workspace.isolation: docker` is selected:

1. Symphony verifies Docker daemon availability.
2. Symphony resolves the worker image and builds a cached derived image when
   `workspace.docker.setup` is configured.
3. A per-issue container is started via `docker run --rm -d`.
4. Repository bootstrap and hooks execute inside the container (`docker exec`).
5. Agent runtime runs via `docker exec -i <container> sh -lc 'cd /workspace && <agent.command>'`.
6. Container is removed via `docker rm -f` after session completion.

---

## Skills Injection

Symphony automatically injects agent skills into each workspace so that worker
agents have access to workflow-specific capabilities (committing, landing PRs,
addressing review comments, etc.) regardless of whether the target repository
ships its own skills.

### Convention

If a `skills/` directory exists as a sibling of the WORKFLOW.md file, Symphony
copies its contents into `.agents/skills/` inside each newly created workspace
during bootstrap — after the git clone/worktree but before the `after_create`
hook runs.

```
my-project/
├── WORKFLOW.md
├── prompts/
│   ├── system.md
│   └── in-progress.md
└── skills/              ← Symphony auto-injects these
    ├── sym-land/
    │   └── SKILL.md
    ├── sym-commit/
    │   └── SKILL.md
    └── sym-fix-ci/
        └── SKILL.md
```

After injection, the workspace looks like:

```
<workspace>/
├── .agents/
│   └── skills/
│       ├── sym-land/        ← injected by Symphony
│       ├── sym-commit/      ← injected by Symphony
│       ├── repo-custom/     ← already in the target repo (preserved)
│       └── ...
├── src/
└── ...
```

### Behaviour

- **Zero config** — no WORKFLOW.md setting is needed. If `skills/` exists next
  to the workflow file, injection happens automatically.
- **Idempotent** — existing files in `.agents/skills/` from the target repo are
  preserved. Symphony only writes into its own namespaced skill directories.
- **`sym-` prefix** — all Symphony-shipped skills use the `sym-` name prefix
  (e.g. `sym-land`, `sym-commit`, `sym-fix-ci`). This prevents collisions with
  skills that already exist in the target repository's `.agents/skills/`.
- **File overwrite** — if a `sym-*` skill directory already exists in the
  workspace (e.g. from a prior bootstrap), files within it are overwritten with
  the latest version from the workflow directory.
- **Docker isolation** — skills injection is currently supported for local
  workspace isolation only. Docker container injection is planned.

### Bundled Skills

Symphony ships these skills in `apps/symphony/skills/`:

| Skill                  | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `sym-address-comments` | Address PR review comments (human and bot)               |
| `sym-commit`           | Produce clean, well-formed git commits                   |
| `sym-debug`            | Debug stuck runs and agent execution failures            |
| `sym-fix-ci`           | Diagnose and fix failing GitHub Actions CI checks        |
| `sym-land`             | Land a PR: resolve conflicts, wait for CI, squash-merge  |
| `sym-linear`           | Raw Linear GraphQL operations (comment editing, uploads) |
| `sym-pull`             | Pull latest base branch and resolve merge conflicts      |
| `sym-push`             | Push branch to origin and create/update the PR           |

### Referencing Skills in Prompts

Prompt files should reference skills using the `.agents/skills/sym-*` path:

```markdown
Read `.agents/skills/sym-land/SKILL.md` and follow its steps.
```

This path resolves inside the worker's workspace cwd, where the skills have
been injected.

---

## Module Map

Core Rust modules:

| Module                    | Source file                                     | Responsibility                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI/runtime entrypoint    | `src/main.rs`                                   | CLI parsing, startup validation, tracing setup, runtime wiring                                                                                                                                               |
| Orchestrator loop         | `src/orchestrator.rs`                           | Poll/dispatch loop, retries, worker lifecycle, state snapshots                                                                                                                                               |
| Supervisor runtime        | `src/supervisor.rs`                             | Background supervisor lifecycle, stuck/conflict/pattern detection, steering + escalation decisions                                                                                                           |
| HTTP dashboard/API        | `src/http_server.rs`                            | `/`, `/api/v1/state`, `/api/v1/events` websocket stream, `/api/v1/escalations`, `/api/v1/escalations/:request_id/respond`, `/api/v1/:issue_identifier`, refresh endpoint, dashboard Linear project link card |
| Terminal dashboard        | `src/tui.rs`                                    | Ratatui renderer with throughput sparkline, color-coded status dots, keyboard handling, and live snapshot display                                                                                            |
| Workflow/config parser    | `src/workflow.rs`, `src/config.rs`              | Front-matter parsing, env/tilde resolution, typed config defaults                                                                                                                                            |
| Domain model              | `src/domain.rs`                                 | Shared runtime/config structs (`RunAttempt`, snapshots, worker/session info)                                                                                                                                 |
| Tracker adapter/client    | `src/linear/adapter.rs`, `src/linear/client.rs` | Linear GraphQL fetch/update operations and issue normalization                                                                                                                                               |
| Docker runtime helpers    | `src/docker.rs`                                 | Docker availability checks, image resolution/build cache, container lifecycle, auth resolution                                                                                                               |
| Workspace + git bootstrap | `src/workspace.rs`                              | clone/worktree bootstrapping, branch naming, hooks                                                                                                                                                           |
| Codex app-server bridge   | `src/codex/app_server.rs`                       | Session subprocess lifecycle, turn streaming, tool execution                                                                                                                                                 |
| Pi RPC bridge             | `src/pi_agent/rpc_bridge.rs`                    | Kata RPC subprocess lifecycle, turn streaming, token stats integration                                                                                                                                       |
| Pi protocol types         | `src/pi_agent/protocol.rs`                      | Pi RPC command/response/event serde models                                                                                                                                                                   |
| Pi token accounting       | `src/pi_agent/token_accounting.rs`              | Cumulative token stats to per-turn delta tracking                                                                                                                                                            |
| Event stream              | `src/event_stream.rs`                           | Broadcast event hub, WebSocket pub/sub, sequence numbering                                                                                                                                                   |
| Shared context store      | `src/shared_context.rs`                         | In-memory scoped context entries with TTL, pruning, CRUD operations                                                                                                                                          |
| Notifications             | `src/notifications.rs`                          | Slack webhook sender, event filtering, fire-and-forget dispatch                                                                                                                                              |
| Prompt builder            | `src/prompt_builder.rs`                         | Liquid template rendering, per-state prompt resolution, shared context injection                                                                                                                             |
| SSH helpers               | `src/ssh.rs`                                    | Remote target parsing, command escaping, host selection helpers                                                                                                                                              |

---

## Testing

Run the full test suite (529 tests):

```sh
cargo test
```

Run a specific integration harness with output:

```sh
cargo test --test orchestrator_tests -- --nocapture
cargo test --test workflow_config_tests -- --nocapture
```

Lint (zero-warning gate enforced in CI):

```sh
cargo clippy -- -D warnings
```

### Test Harness Layout

| Harness                 | Location                                         | What it covers                                                           |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Unit tests              | inline `#[cfg(test)]` modules in each `src/*.rs` | Individual function contracts                                            |
| `orchestrator_tests`    | `tests/orchestrator_tests.rs`                    | Orchestrator loop, dispatch, retry, reconciliation, spec §17 conformance |
| `workflow_config_tests` | `tests/workflow_config_tests.rs`                 | Config parsing, env-var resolution, key normalisation, validation        |
| `http_server_tests`     | `tests/http_server_tests.rs`                     | HTTP endpoint routes, response shapes, error cases                       |
| `ssh_tests`             | `tests/ssh_tests.rs`                             | SSH arg construction, target parsing, host selection                     |
| `path_safety_tests`     | `tests/path_safety_tests.rs`                     | Workspace path validation, traversal rejection                           |
| Integration / e2e       | `tests/live_e2e_tests.rs`                        | End-to-end with real subprocesses (requires credentials)                 |

---

## Debugging Worker Sessions

When Symphony dispatches a worker using the Pi runner, each session
writes a JSONL log to `~/.kata-cli/sessions/`. The filename includes the
session UUID:

```
~/.kata-cli/sessions/2026-03-27T21-33-04-452Z_38a5b485-06db-441d-86e5-b359d3d860e2.jsonl
```

### Finding session logs

```bash
# List recent sessions (newest first)
ls -lt ~/.kata-cli/sessions/*.jsonl | head -10

# Find sessions for a specific issue
grep -l "KAT-1317" ~/.kata-cli/sessions/*.jsonl
```

### Key fields to inspect

Each line is a JSON object with a `type` field. The most useful:

| Type                       | What to look for                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `session`                  | First line — contains `id`, `cwd` (workspace path)                                    |
| `message` (role=user)      | Prompts sent to the model — check if the initial prompt and continuations are correct |
| `message` (role=assistant) | Model responses — check `content` (empty = problem), `stopReason`, `errorMessage`     |

### Common problems

**Empty assistant responses with `stopReason: "error"`:**

```bash
# Check for model API errors (rate limits, auth failures)
python3 -c "
import json, sys
for line in open(sys.argv[1]):
    d = json.loads(line)
    if d.get('type') == 'message':
        msg = d.get('message', {})
        if msg.get('stopReason') == 'error':
            print(f'ERROR: {msg.get(\"errorMessage\", \"unknown\")}')
        elif msg.get('role') == 'assistant' and not msg.get('content'):
            print(f'EMPTY response (stop={msg.get(\"stopReason\")})')
" ~/.kata-cli/sessions/<session-file>.jsonl
```

If every turn shows `stopReason: "error"` with a rate limit message, the
multi-turn loop is burning turns against a rate limit wall (see KAT-1466).

**Continuation turns with no real work:**

```bash
# Count continuation vs initial prompts
grep -c "Continuation guidance" <session-file>.jsonl
```

If continuation count equals `max_turns - 1` and all assistant responses are
empty, the agent never did any work. Check the first assistant response for
errors.

**Checking what model/provider was used:**

```bash
# Extract model info from assistant messages
python3 -c "
import json, sys
for line in open(sys.argv[1]):
    d = json.loads(line)
    msg = d.get('message', {})
    if msg.get('role') == 'assistant' and msg.get('model'):
        print(f'model={msg[\"model\"]} provider={msg.get(\"provider\",\"?\")} stop={msg.get(\"stopReason\",\"?\")}')
        break
" ~/.kata-cli/sessions/<session-file>.jsonl
```

### Symphony-side logs

Symphony's own structured logs (via `SYMPHONY_LOG`) show the orchestrator
perspective. Cross-reference with session logs using the issue identifier:

```bash
# Symphony sees the worker lifecycle
grep "KAT-1317" symphony.log | grep "event="

# Key events: worker_dispatched, worker_completed, worker_failed, worker_stalled
```

The TUI and HTTP dashboard show live worker state, but model API errors
(rate limits, auth failures) are not currently surfaced there (see KAT-1467).
Check session JSONL logs when a worker appears to be running but producing
no output.

## Development

This file is the source of truth for both human-facing README content and
agent-facing repository instructions. `README.md` is intentionally a symlink to
`AGENTS.md` so the two cannot drift.
