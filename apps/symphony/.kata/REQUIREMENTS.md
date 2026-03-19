# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — WORKFLOW.md Parsing and Dynamic Reload
- Class: core-capability
- Status: validated
- Description: Parse WORKFLOW.md with YAML front matter + prompt body split, validate config, and dynamically watch/reload/re-apply changes without restart. Invalid reloads keep last known good config.
- Why it matters: The workflow file is the primary user-facing configuration surface. Dynamic reload is spec-required.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: M001/S02 — cargo test proves parsing (4 edge cases) and WorkflowStore hot-reload with real FS writes; last-known-good on invalid YAML confirmed.
- Notes: Spec §5, §6. Uses notify crate for filesystem watching.

### R002 — Typed Config Layer with Defaults and Env Resolution
- Class: core-capability
- Status: validated
- Description: Expose typed getters for all config fields (tracker, polling, workspace, hooks, agent, codex, server, worker). Support `$VAR` env indirection, `~` home expansion, and built-in defaults.
- Why it matters: Config correctness gates dispatch. Env indirection is how secrets are passed.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: M001/S02 — cargo test proves $VAR resolution, ~ expansion, spec §5.3 defaults, and all validation failure modes. api_key redaction from logs verified by grep.
- Notes: Spec §5.3, §6.

### R003 — Linear Issue Tracker Client
- Class: core-capability
- Status: active
- Description: Fetch candidate issues by active states and project slug, fetch issue states by IDs for reconciliation, fetch terminal-state issues for startup cleanup. Paginate, normalize to domain Issue model.
- Why it matters: The tracker client is the input source for all orchestration decisions.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: unmapped
- Notes: Spec §11. GraphQL against Linear API with proper pagination and normalization.

### R004 — Workspace Manager with Safety Invariants
- Class: core-capability
- Status: validated
- Description: Create/reuse per-issue workspaces under configured root. Enforce path sanitization, root containment, and safety invariants. Run lifecycle hooks (after_create, before_run, after_run, before_remove) with timeout enforcement.
- Why it matters: Workspace isolation is the primary safety boundary. Hook execution is how teams customize workspace prep.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: M001/S04 — cargo test proves workspace creation/reuse (4 tests), path sanitization (6 tests), root containment with symlink escape rejection (3 tests), all four lifecycle hooks with timeout enforcement (6 tests), cleanup (2 tests). 21 workspace tests total.
- Notes: Spec §9. Sanitize identifiers to `[A-Za-z0-9._-]`.

### R005 — Codex App-Server Client (JSON-RPC over stdio)
- Class: core-capability
- Status: validated
- Description: Launch Codex app-server subprocess, perform startup handshake (initialize, initialized, thread/start, turn/start), stream turn events, handle approvals/tool-calls/user-input, enforce timeouts (read, turn, stall). Extract token usage and rate limits.
- Why it matters: This is the execution layer — the thing that actually runs coding agent sessions.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: none
- Validation: M001/S05 — cargo test proves subprocess launch, 4-message handshake, turn streaming (completed/failed/cancelled/timeout/exit), approval auto-approve/reject (4 methods), tool call dispatch, user-input handling (MCP approval + freeform + hard-fail), partial-line buffering; 32 tests total.
- Notes: Spec §10. Line-delimited JSON protocol on stdout. Multi-turn continuation on same thread.

### R006 — Orchestrator State Machine
- Class: core-capability
- Status: validated
- Description: Single-authority poll loop: reconcile running issues (stall detection + tracker state refresh), validate config, fetch candidates, sort by priority, dispatch with concurrency control (global + per-state), handle worker exits (continuation retry + exponential backoff), startup terminal cleanup.
- Why it matters: The orchestrator is the core scheduling brain. Correctness here prevents duplicate dispatch, missed retries, and stale state.
- Source: user
- Primary owning slice: M001/S06
- Supporting slices: M001/S05
- Validation: M001/S06 — `cargo test --test orchestrator_tests` proves startup terminal cleanup, reconcile→validate→dispatch tick ordering, candidate sorting/gating, pre-dispatch refresh rejection, continuation+failure retry semantics, stale retry suppression, stall recovery, and snapshot diagnostics.
- Notes: Spec §7, §8. In-memory state, no persistent DB.

### R007 — Prompt Builder with Strict Liquid Rendering
- Class: core-capability
- Status: validated
- Description: Render WORKFLOW.md prompt template with `issue` and `attempt` variables using strict Liquid-compatible engine. Fail on unknown variables/filters. Support first-run vs continuation vs retry prompt semantics.
- Why it matters: The prompt is how the workflow controls agent behavior. Strict rendering prevents silent template bugs.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: M001/S04 — cargo test proves render_prompt with basic fields, DateTime→ISO 8601, Option→nil, Vec<BlockerRef> iteration, strict unknown-variable rejection, parse error surfacing, attempt None/Some handling. 7 prompt tests total.
- Notes: Spec §12. liquid crate already in Cargo.toml.

### R008 — CLI Entry Point
- Class: core-capability
- Status: validated
- Description: Accept optional positional workflow path, `--port`, `--logs-root`, guardrails acknowledgment flag. Validate config at startup. Exit codes for success/failure.
- Why it matters: The CLI is the operator interface for launching the daemon.
- Source: user
- Primary owning slice: M001/S06
- Supporting slices: none
- Validation: M001/S06 — `cargo test --test cli_tests` proves default/override workflow path parsing, missing workflow startup failure, startup validation failure gating, and successful bootstrap path invoking orchestrator startup.
- Notes: Spec §17.7. clap derive already in place.

### R009 — Structured Logging with Issue/Session Context
- Class: operability
- Status: active
- Description: Emit structured logs with `issue_id`, `issue_identifier`, `session_id` context fields. Operator-visible startup/validation/dispatch failures. JSON and human-readable output formats.
- Why it matters: Operators need to see what's happening without attaching a debugger.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S06
- Validation: M001/S06 partial — orchestrator tests assert issue/session context on worker lifecycle events and retry diagnostics; runtime startup failure checks confirm actionable structured bootstrap error fields (`phase`, `stage`, `workflow_path`). Human-readable log-format toggle remains to be proven.
- Notes: Spec §13.1-13.2. tracing + tracing-subscriber already in deps.

### R010 — HTTP Observability Server (Extension)
- Class: operability
- Status: validated
- Description: Optional HTTP server on `--port` or `server.port`. Serve HTML dashboard at `/`, JSON API at `/api/v1/state`, `/api/v1/<issue>`, `POST /api/v1/refresh`. Bind loopback by default.
- Why it matters: The dashboard is how operators monitor multiple concurrent agent runs.
- Source: user
- Primary owning slice: M001/S07
- Supporting slices: M001/S06
- Validation: M001/S07 — `cargo test --test http_server_tests --test cli_tests` proves dashboard shell rendering, live snapshot-backed state/issue APIs, refresh queued/coalesced signaling, API JSON 404/405 envelopes, and CLI `--port` precedence over workflow config.
- Notes: Spec §13.7. Using axum.

### R011 — SSH Remote Worker Extension
- Class: core-capability
- Status: active
- Description: Execute agent sessions on remote hosts via SSH stdio. Pool-based dispatch with per-host concurrency cap. Continuation turns stay on same host. Host preference on retry.
- Why it matters: Enables scaling agent execution across multiple machines.
- Source: user
- Primary owning slice: M001/S08
- Supporting slices: M001/S05, M001/S06
- Validation: unmapped
- Notes: Spec Appendix A.

### R012 — linear_graphql Client-Side Tool Extension
- Class: integration
- Status: validated
- Description: Expose a `linear_graphql` dynamic tool to the Codex session. Execute GraphQL queries/mutations against Linear using Symphony's configured auth. Validate single-operation documents.
- Why it matters: Lets the coding agent read/write Linear tickets without raw API key access.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: none
- Validation: M001/S05 — cargo test proves argument normalisation (string/object/invalid), query validation, variables validation, GraphQL execution via graphql_raw, GraphQL error preservation, transport/auth error formatting, executor injection; 14 linear_graphql tests.
- Notes: Spec §10.5.

### R013 — Spec-Driven Test Suite
- Class: quality-attribute
- Status: active
- Description: Test suite covering all Core Conformance behaviors in Spec §17.1-17.7. Extension Conformance tests for HTTP server, SSH, and linear_graphql. Idiomatic Rust tests (unit + integration).
- Why it matters: The spec's Section 17 defines the validation contract for a conforming implementation.
- Source: user
- Primary owning slice: M001/S09
- Supporting slices: all prior slices contribute tests
- Validation: unmapped
- Notes: Each slice should include tests for its own behaviors. S09 is the integration/conformance sweep.

### R014 — Dispatch Preflight Validation
- Class: failure-visibility
- Status: validated
- Description: Validate workflow/config before dispatch (tracker.kind, api_key, project_slug, codex.command present). Fail startup on validation error. Skip dispatch on per-tick validation failure while keeping reconciliation active.
- Why it matters: Prevents dispatching work with broken config, which wastes agent time and creates confusing failures.
- Source: inferred
- Primary owning slice: M001/S06
- Supporting slices: M001/S02
- Validation: M001/S06 — `test_preflight_validation_failure_skips_dispatch_but_reconcile_continues` proves reconcile still runs while dispatch is skipped on invalid per-tick preflight; CLI startup validation failure path verified in `cli_tests`.
- Notes: Spec §6.3.

### R015 — Token Accounting and Rate Limit Tracking
- Class: operability
- Status: validated
- Description: Track per-session and aggregate token usage (input/output/total). Extract absolute thread totals, compute deltas to avoid double-counting. Track latest rate-limit payload. Expose in status snapshot.
- Why it matters: Token accounting is how operators monitor cost and detect runaway sessions.
- Source: inferred
- Primary owning slice: M001/S05
- Supporting slices: M001/S06, M001/S07
- Validation: M001/S05 + M001/S06 — per-turn delta extraction proven in codex tests; `test_token_totals_and_rate_limits_accumulate_into_snapshot` proves orchestrator aggregate accumulation and latest rate-limit snapshot surface.
- Notes: Spec §13.5.

## Deferred

### R016 — Persistent Retry Queue Across Restarts
- Class: continuity
- Status: deferred
- Description: Persist retry queue and session metadata so restarts don't lose scheduled retries.
- Why it matters: Current design is intentionally in-memory. Spec lists this as a future TODO.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Spec §18.2 TODO item.

### R017 — Pluggable Tracker Adapters Beyond Linear
- Class: integration
- Status: deferred
- Description: Support issue trackers other than Linear (GitHub Issues, Jira, etc.).
- Why it matters: Spec lists this as a future TODO. Current version only needs Linear.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Spec §18.2 TODO item. Current trait-based design should make this possible later.

## Out of Scope

### R018 — Web UI Framework / LiveView Equivalent
- Class: anti-feature
- Status: out-of-scope
- Description: No Phoenix LiveView or SPA framework for the dashboard. Server-rendered HTML with optional auto-refresh is sufficient.
- Why it matters: The Elixir impl uses Phoenix LiveView for real-time updates. The Rust port should use simpler server-rendered HTML or a lightweight JS auto-refresh, not a full frontend framework.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Spec says "server-generated HTML or a client-side app" — we choose server-generated with auto-refresh.

### R019 — Rich Terminal UI (TUI Dashboard)
- Class: anti-feature
- Status: out-of-scope
- Description: No ratatui or crossterm TUI dashboard.
- Why it matters: The Elixir impl has a terminal status dashboard. The Rust port focuses on HTTP dashboard + structured logs.
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The Elixir status_dashboard.ex is 1952 lines of terminal rendering. HTTP dashboard covers observability needs.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S02 | none | M001/S02 cargo test (16 tests: parse + hot-reload + last-known-good) |
| R002 | core-capability | validated | M001/S02 | none | M001/S02 cargo test (7 config tests: $VAR, ~, defaults, validation) |
| R003 | core-capability | active | M001/S03 | none | unmapped |
| R004 | core-capability | validated | M001/S04 | none | M001/S04 cargo test (21 tests: sanitize + canonicalize + workspace + hooks + cleanup) |
| R005 | core-capability | validated | M001/S05 | none | M001/S05 cargo test (32 tests: subprocess launch + handshake + turn streaming + approvals + tool calls + user-input + token accounting) |
| R006 | core-capability | validated | M001/S06 | M001/S05 | M001/S06 cargo test (14 orchestrator tests: startup cleanup, tick ordering, dispatch gating, retries, stall, snapshot diagnostics) |
| R007 | core-capability | validated | M001/S04 | none | M001/S04 cargo test (7 tests: basic + datetime + none + blockers + strict + parse + attempt) |
| R008 | core-capability | validated | M001/S06 | none | M001/S06 cargo test (5 cli tests: default/override path, startup failure gating, orchestrator startup invocation) |
| R009 | operability | active | M001/S03 | M001/S06 | M001/S06 partial: structured startup/runtime JSON logs + issue/session lifecycle context; human-readable format toggle not yet proven |
| R010 | operability | validated | M001/S07 | M001/S06 | M001/S07 tests prove dashboard/API contracts, refresh signaling semantics, and CLI HTTP binding precedence |
| R011 | core-capability | active | M001/S08 | M001/S05,S06 | unmapped |
| R012 | integration | validated | M001/S05 | none | M001/S05 cargo test (14 tests: argument normalisation + query/variables validation + GraphQL error formatting + executor injection) |
| R013 | quality-attribute | active | M001/S09 | all | unmapped |
| R014 | failure-visibility | validated | M001/S06 | M001/S02 | M001/S06 orchestrator+cli tests prove per-tick preflight dispatch skip with reconcile continuity and startup validation failure gating |
| R015 | operability | validated | M001/S05 | M001/S06,S07 | M001/S05+S06 tests prove token delta extraction plus aggregate codex totals/rate-limit snapshot accumulation |

## Coverage Summary

- Active requirements: 4
- Validated requirements: 11
- Mapped to slices: 15
- Validated: 11 (R001, R002, R004, R005, R006, R007, R008, R010, R012, R014, R015)
- Unmapped active requirements: 0
