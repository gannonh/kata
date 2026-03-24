# Changelog

## 1.0.2 — Docker fixes, README overhaul, non-root workers

### Docker

- **Dockerfile.symphony fixes** — added OpenSSL dev libs to builder stage, pinned `rust:slim-bookworm` to match runtime glibc, removed invalid `--host` CLI flag from CMD, added `--no-tui` for headless container operation
- **Docker Compose fixes** — fixed COPY paths for compose build context, removed obsolete `version` key, workflow file now mounts from docker/ directory
- **WORKFLOW-docker.md** — new ready-to-edit template pre-configured for Docker isolation, lives in docker/ directory alongside .env and compose file
- **Docker auth error message** — now tells users to set `OPENAI_API_KEY` instead of referencing non-existent `codex auth` command (interactive login unavailable in containers)
- **Non-root worker containers (KAT-903)** — worker image runs as dedicated non-root user (`node`) by default, auth mount resolves container home path dynamically instead of hardcoding `/root`, setup scripts run as root then restore non-root default user

### Documentation

- **README rewrite** — separated three deployment modes (local, Docker-isolated workers, server deployment), added prerequisites section, explicit quick start with .env.example, clear Docker mode explanation ("you don't manage containers"), CLI flags table
- **WORKFLOW-REFERENCE.md** — corrected Docker git_strategy constraints (only auto/clone-remote), clarified auth modes for containers
- **WORKFLOW-cli.md** — fixed Linear document scoping for slice docs (attached to slice issue, not project) to prevent namespace collisions across milestones
- **Workflow file renames** — `WORKFLOW.md` → `WORKFLOW-symphony.md`, `cli-WORKFLOW.md` → `WORKFLOW-cli.md`

### Fixes

- **go.sh setup script** — fixed checksum verification (Go doesn't serve per-file .sha256 URLs, now fetches from JSON release API)

## 1.0.1 — TUI/dashboard polish + post-patch verification

### Runtime and UX

- **TUI default-on behavior** — terminal dashboard is enabled by default; `--no-tui` is the explicit opt-out. Legacy `--tui` remains accepted as a no-op for compatibility.
- **Throughput sparkline** — TUI summary now includes a compact throughput graph for recent token rate changes.
- **Color-coded status dots** — running-session state indicators use event/staleness-aware colors for faster scanability.
- **Linear project URL visibility** — TUI summary and HTTP dashboard both surface the configured Linear project link.
- **Session-only completed list** — startup terminal-issue discovery no longer pollutes the per-session completed issues list.
- **Startup banner consistency** — banner version line is emitted from the crate package version.

### Verification and docs

- **Quality gate rerun** — validated with `cargo test`, `cargo clippy -- -D warnings`, and `cargo build --release`.
- **Documentation sync** — refreshed README, AGENTS architecture notes, and WORKFLOW reference to match current CLI/TUI/dashboard behavior.

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
