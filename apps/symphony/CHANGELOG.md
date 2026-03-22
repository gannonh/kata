# Changelog

## 1.0.0 — MVP Release

First public release. Symphony is a headless orchestrator that polls Linear for issues, dispatches parallel agent sessions, and manages the full ticket lifecycle autonomously.

### Core

- **Orchestrator runtime** — poll-dispatch-reconcile loop with configurable concurrency, priority-based dispatch, dependency graph awareness, and exponential backoff retries
- **Multi-turn sessions** — agents continue on the same Codex thread across turns, preserving conversation history. Issue state checked between turns; terminal state stops immediately.
- **Real-time event streaming** — events flow from workers to the orchestrator as they happen via mpsc channel. Dashboard updates live, stall detection uses real activity timestamps.
- **Dynamic config reload** — WORKFLOW.md changes take effect without restart via `Arc<WorkflowStore>`
- **Full PR lifecycle** — agents create PRs, address review feedback (address-comments skill), resolve comment threads, and merge (land skill)
- **Agent Review loop** — agents self-route to Agent Review after opening a PR, address all bot/reviewer comments, then move to Human Review when clean

### Workspace

- **Git strategies** — `clone-local` (fast, hard-links, inherits remotes), `clone-remote` (network clone), `worktree` (lightweight, shared .git), `auto` (picks based on repo URL vs path)
- **Workspace cleanup** — `cleanup_on_done: true` auto-removes workspaces when issues reach terminal state. Worktree strategy runs `git worktree remove`.
- **Branch prefix** — configurable `branch_prefix` for auto-created issue branches
- **Base branch** — `workspace.base_branch` exposed as Liquid template variable in prompts
- **Docker isolation stub** — `isolation: docker` accepted in config (implementation in next release)

### Linear Integration

- **Candidate polling** — filters by project, active states, assignee, priorities, and blocked-by dependencies
- **State writeback** — moves Todo → In Progress on dispatch; preserves other active states (Agent Review, Merging, Rework)
- **Assignee resolution** — `tracker.assignee` accepts `me`, username, email, or UUID
- **GraphQL skill** — bundled Linear skill with correct query patterns injected into agent context

### Dashboard

- **HTTP dashboard** — live session table, token summary (input/output/total), retry queue, completed issues (identifier + title + date), polling stats, rate limits. Auto-refreshes every 2 seconds.
- **TUI dashboard** — `--tui` flag activates Ratatui terminal UI. Running sessions with turn count, last activity, per-session tokens. Coexists with HTTP dashboard.
- **Per-session observability** — turn count, last activity timestamp, per-session token usage on RunAttempt

### Observability

- **Rotating log files** — `--logs-root` writes structured JSON logs to disk with rotation. Stdout shows startup banner only when log files are configured.
- **Startup banner** — clean summary on launch: dashboard URL, log path, project, workers, polling interval
- **Structured logging** — all events emitted as structured JSON via `tracing`

### Workflow

- **Multiple workflow files** — different projects use different workflows. `symphony WORKFLOW.md` vs `symphony cli-WORKFLOW.md`
- **Slice-aware workflow** — `cli-WORKFLOW.md` supports parent/child issue dispatch with context loading protocol (project → milestone → slice → task plans)
- **Skills** — bundled Codex skills: linear, commit, push, pull, land, address-comments, fix-ci, debug
- **Prompt template** — Liquid templates with `{{ issue.identifier }}`, `{{ issue.title }}`, `{{ workspace.base_branch }}`, `{{ attempt }}`

### SSH

- **Remote worker pools** — distribute sessions across SSH hosts with per-host concurrency caps
- **Host selection** — least-loaded eligible host with preference for prior host on retry

### Configuration

- **WORKFLOW.md** — YAML front-matter for all settings, markdown body for agent prompt template
- **Reference template** — `docs/WORKFLOW-REFERENCE.md` with all settings fully documented
- **Environment variable indirection** — `$VAR` syntax in config fields resolves from process environment
- **Hot reload** — config changes take effect without restart

### Testing

- 290 tests across 12 test harnesses
- Unit, integration, and conformance tests
- Clippy clean with `-D warnings`
