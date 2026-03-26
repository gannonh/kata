# Changelog

## 1.2.1 — Fix multi-turn session continuing after state change

### Critical Fix

- **Multi-turn session now ends when issue state changes** — when an agent moves an issue from one active state to another (e.g. `In Progress` → `Agent Review`), the session now ends so the orchestrator can re-dispatch with the correct per-state prompt. Previously the multi-turn loop continued with the stale prompt because both states were "active," which could lead to the agent taking unauthorized actions (like merging a PR) after running out of meaningful work.

## 1.2.0 — Per-state prompts, dependency ordering, live tool activity

### Per-State Prompt Injection

- **State-driven prompt selection** — orchestrator selects a focused prompt based on the issue's Linear state at dispatch time instead of sending one monolithic prompt. Agents receive only the instructions relevant to their current job.
- **`prompts` config section** — configure `shared`, `by_state`, and `default` prompt file paths in WORKFLOW.md frontmatter. Files are resolved relative to the workflow file.
- **Issue shape detection** — `in-progress.md` prompt uses `children_count` and `parent_identifier` to auto-detect flat tickets, Kata-planned slices, and individual tasks. One workflow handles all three.
- **Project-specific shared prompts** — `shared-symphony.md` (Rust/Cargo) and `shared-cli.md` (TypeScript/Bun) with repo-specific build/test/lint commands.
- **Backward compatible** — without a `prompts` section, the full markdown body after `---` is used as before.
- **Agent Review empty-comments guard** — agents don't advance to Human Review when no PR comments exist yet (reviewers may not have spun up).

### Issue Dependency Ordering (KAT-927)

- **Generalized blocker check** — `is_blocked_by_dependency()` replaces the Todo-only `todo_issue_blocked_by_non_terminal()`. Issues in any active state with non-terminal blockers are held in the queue.
- **Circular dependency detection** — direct A↔B cycles detected and logged as warnings; neither issue dispatched.
- **Cross-project blockers** — blockers with unknown state (cross-project) treated as non-blocking with a log warning.
- **Blocked section in TUI** — new "Blocked" section between Running Sessions and Retry Queue shows blocked issues with their blocker identifiers.
- **Blocked in HTTP dashboard and API** — `blocked` array in `/api/v1/state` JSON and HTML dashboard table.

### Live Tool Activity Stream (KAT-926)

- **Structured tool notification parsing** — `notification_event_summary()` parses `tool_start:`, `tool_end:`, `tool_error:` prefixed messages from the RPC bridge into structured event names and `<tool>: <args_preview>` messages.
- **Tool activity colors in TUI** — `tool_start` → green, `tool_end` → blue, `tool_error` → red status dots.

### Linear Query Enrichment

- **`children_count` and `parent_identifier`** on `Issue` — candidate and by-ID queries now fetch `children.nodes` and `parent.identifier` for issue shape detection.

### Workflow Management

- **Workflow files gitignored** — `WORKFLOW.md` and `WORKFLOW-*.md` at root are gitignored (contain local paths/credentials). Example workflows in `docs/`.
- **Plans in issue descriptions** — slice and task plans stored in Linear issue descriptions instead of separate LinearDocuments. Summaries as issue comments.
- **Workpad protocol improved** — agents must load all context before creating workpad; placeholder content forbidden.
- **Agent Review state transition fixed** — execution phase moves to Agent Review (not Human Review); section headers and instructions aligned.

### Documentation

- **WORKFLOW-REFERENCE.md** — added `prompts` config section with all template variables; removed stale monolith prompt body.
- **AGENTS.md** — added `prompts` config section, `prompt_builder` module in module map.
- **README** — updated with per-state prompt explanation and prompt file table.

## 1.1.0 — Kata CLI backend, per-state model selection, docs overhaul

### Kata CLI Backend (KAT-902, KAT-912)

- **Multi-model agent backend** — new `agent.backend: kata-cli` (aliases: `kata`, `pi`) spawns Kata CLI in RPC mode, enabling any model supported by pi-ai (Anthropic, OpenAI, Google, Mistral, Bedrock, Azure)
- **`kata_agent` config section** (alias: `pi_agent`) — configure command, model, timeouts for the Kata CLI backend
- **Codex backend preserved** — `agent.backend: codex` continues to work unchanged; both backends coexist
- **Backend rename** — `AgentBackend::Pi` → `AgentBackend::KataCli`; YAML accepts `kata-cli`, `kata`, `pi`

### Per-state Model Selection (KAT-914)

- **`model_by_state`** — assign different models to different Linear workflow states (e.g. Opus for implementation, Sonnet for review)
- **Model column in TUI and web dashboard** — active model visible for each running session
- **Centralized model resolver** — `PiAgentConfig::model_for_state()` ensures orchestrator display and RPC launch stay in sync

### RPC Bridge Fixes

- **Handshake timeout fix** — polling loops continue on chunk timeouts instead of failing when Kata CLI takes >2s to start
- **EOF/IO error propagation** — `read_poll_line` helper distinguishes timeouts from subprocess crashes; EOF and IO errors propagate immediately instead of hot-spinning until deadline

### Removed

- **`max_concurrent_agents_by_state`** — removed from code, config, tests, and docs (feature had no valid use case)

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
