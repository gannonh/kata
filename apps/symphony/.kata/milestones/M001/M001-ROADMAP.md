# M001: Full Spec Conformance

**Vision:** A complete, conforming Rust implementation of the Symphony orchestrator spec — single binary that polls Linear, dispatches Codex agent sessions in isolated workspaces with bounded concurrency, retries failures, reconciles state, reloads config dynamically, and exposes operator observability via HTTP dashboard and JSON API.

## Success Criteria

- `symphony WORKFLOW.md` starts, polls Linear, and dispatches agent sessions correctly
- Dynamic WORKFLOW.md reload changes behavior without restart
- Workspace safety invariants enforced (sanitized paths, root containment, cwd validation)
- Exponential backoff retries and continuation retries work correctly
- Stall detection kills inactive sessions and schedules retry
- Reconciliation stops runs for terminal/non-active tracker states
- HTTP dashboard shows running sessions, retry queue, token totals
- JSON API returns state snapshot, per-issue details, and accepts refresh trigger
- SSH remote worker dispatch works with per-host concurrency caps
- All Spec §17 Core Conformance test behaviors pass

## Key Risks / Unknowns

- **Codex app-server protocol shape drift** — field names may vary across versions; need lenient extraction
- **liquid crate strict mode** — must verify unknown-variable rejection works
- **SSH stdio JSON-RPC streaming** — cross-machine buffering may introduce framing issues

## Proof Strategy

- Codex protocol shape drift → retire in S05 by proving multi-turn session with real app-server subprocess
- liquid strict mode → retire in S02 by proving unknown variable rejection in tests
- SSH stdio streaming → retire in S08 by proving remote agent launch with event streaming

## Verification Classes

- Contract verification: unit + integration tests per slice, spec §17 conformance suite
- Integration verification: real Linear API queries, real subprocess launch, real filesystem ops
- Operational verification: full poll→dispatch→retry→reconcile loop under realistic conditions
- UAT / human verification: dashboard visual inspection, end-to-end run with real Linear project

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 9 slices are complete with passing tests
- The orchestrator loop (poll→reconcile→dispatch→retry) works end-to-end
- WORKFLOW.md dynamic reload is proven
- HTTP dashboard + JSON API serve real orchestrator state
- `cargo test` passes all spec conformance tests
- At least one real integration run against Linear has been exercised

## Requirement Coverage

- Covers: R001-R015
- Partially covers: none
- Leaves for later: R016 (persistent retry), R017 (pluggable trackers)
- Orphan risks: none

## Slices

- [x] **S01: Domain Types and Error Foundation** `risk:low` `depends:[]`
  > After this: `cargo build` succeeds with all domain types, error enum, and config structs defined. Existing scaffold is validated and any gaps filled.

- [x] **S02: Workflow Loader and Config Layer** `risk:medium` `depends:[S01]`
  > After this: `cargo test` proves WORKFLOW.md parsing, config extraction with defaults/env-resolution, dynamic file-watch reload, and strict Liquid template rendering with unknown-variable rejection.

- [x] **S03: Linear Tracker Client** `risk:medium` `depends:[S01]`
  > After this: `cargo test` proves candidate issue fetch with pagination, state refresh by IDs, terminal-state fetch, and full normalization (labels lowercase, blockers from inverse relations, priority coercion).

- [x] **S04: Workspace Manager and Prompt Builder** `risk:medium` `depends:[S01,S02]`
  > After this: `cargo test` proves workspace creation/reuse with sanitized paths, root containment validation, all four lifecycle hooks with timeout enforcement, and prompt rendering with issue+attempt variables.

- [x] **S05: Codex App-Server Client** `risk:high` `depends:[S01,S04]`
  > After this: `cargo test` proves subprocess launch, startup handshake, turn streaming with event extraction, approval/tool-call handling, timeout enforcement, token accounting, and linear_graphql dynamic tool.

- [x] **S06: Orchestrator Core** `risk:high` `depends:[S02,S03,S04,S05]`
  > After this: `cargo test` proves the full poll→reconcile→dispatch→retry loop: candidate sorting, concurrency control, stall detection, exponential backoff, continuation retries, startup terminal cleanup, and dispatch preflight validation. CLI starts the service.

- [x] **S07: HTTP Dashboard and JSON API** `risk:low` `depends:[S06]`
  > After this: `symphony WORKFLOW.md --port 8080` serves a live HTML dashboard at `/` and JSON API at `/api/v1/state`, `/api/v1/<issue>`, `POST /api/v1/refresh`.

- [x] **S08: SSH Remote Worker Extension** `risk:medium` `depends:[S05,S06]`
  > After this: `cargo test` proves SSH-based agent launch, per-host concurrency cap, host preference on retry, and continuation turns on same host.

- [x] **S09: Conformance Sweep and Integration Polish** `risk:low` `depends:[S06,S07,S08]`
  > After this: Full spec §17 conformance audit passes. Any gaps found are fixed. README documents build, run, test, and configuration.

## Boundary Map

### S01 → S02, S03, S04, S05, S06

Produces:
- `domain.rs` → `Issue`, `BlockerRef`, `WorkflowDefinition`, `ServiceConfig` and all sub-structs with `Default` impls
- `error.rs` → `SymphonyError` enum with all spec error categories, `Result<T>` alias

Consumes:
- nothing (foundation slice)

### S02 → S04, S06

Produces:
- `workflow.rs` → `parse_workflow(path) -> Result<WorkflowDefinition>`, `watch_workflow(path, callback)` for dynamic reload
- `config.rs` → `ServiceConfig::from_workflow(WorkflowDefinition) -> Result<ServiceConfig>`, env `$VAR` resolution, `~` expansion, validation
- `workflow_store.rs` → `WorkflowStore` that holds current effective config + prompt, supports atomic reload

Consumes from S01:
- `domain.rs` → `WorkflowDefinition`, `ServiceConfig` and sub-structs

### S03 → S06

Produces:
- `linear/client.rs` → `LinearClient::fetch_candidates(config) -> Result<Vec<Issue>>`, `fetch_states_by_ids(ids) -> Result<Vec<Issue>>`, `fetch_by_states(states) -> Result<Vec<Issue>>`
- `linear/adapter.rs` → `TrackerAdapter` trait + Linear implementation
- Structured logging with issue context fields

Consumes from S01:
- `domain.rs` → `Issue`, `BlockerRef`, `TrackerConfig`

### S04 → S05, S06

Produces:
- `workspace.rs` → `WorkspaceManager::ensure_workspace(identifier) -> Result<Workspace>`, `cleanup_workspace(identifier)`, `run_hook(name, workspace_path, timeout_ms)`
- `prompt_builder.rs` → `render_prompt(template, issue, attempt) -> Result<String>` with strict Liquid rendering
- `path_safety.rs` → `sanitize_identifier(id) -> String`, `validate_workspace_path(workspace, root) -> Result<()>`

Consumes from S01:
- `domain.rs` → `WorkspaceConfig`, `HooksConfig`, `Issue`
Consumes from S02:
- `workflow_store.rs` → current prompt template

### S05 → S06, S08

Produces:
- `codex/app_server.rs` → `AppServerClient::start_session(workspace, opts) -> Result<Session>`, `run_turn(session, prompt, issue) -> Result<TurnResult>`, `stop_session(session)`
- `codex/dynamic_tool.rs` → `handle_tool_call(name, args, linear_client) -> ToolResult` including `linear_graphql`
- Event types: `AgentEvent` enum (session_started, turn_completed, turn_failed, approval_auto_approved, notification, etc.)
- Token accounting: per-session and delta extraction from agent events

Consumes from S01:
- `domain.rs` → `CodexConfig`, `Issue`
Consumes from S04:
- `workspace.rs` → workspace path validation
- `path_safety.rs` → cwd validation before launch

### S06 → S07, S08

Produces:
- `orchestrator.rs` → `Orchestrator::new(config_store, tracker, workspace_mgr) -> Self`, `run() -> Result<()>` (main loop)
- Orchestrator runtime state: `OrchestratorState` with running map, claimed set, retry_attempts, codex_totals, rate_limits
- Status snapshot: `OrchestratorSnapshot` for dashboard/API consumption
- CLI integration: `main.rs` wires everything together and starts the service

Consumes from S02:
- `workflow_store.rs` → effective config, dynamic reload notifications
Consumes from S03:
- `linear/client.rs` → candidate fetch, state refresh, terminal fetch
Consumes from S04:
- `workspace.rs` → workspace creation/cleanup
- `prompt_builder.rs` → prompt rendering
Consumes from S05:
- `codex/app_server.rs` → session lifecycle
- `AgentEvent` → worker→orchestrator event channel

### S07 → S09

Produces:
- `http_server.rs` → `start_http_server(state_handle, port, host)` using axum
- Routes: `GET /` (HTML dashboard), `GET /api/v1/state`, `GET /api/v1/:issue`, `POST /api/v1/refresh`
- Static CSS for dashboard styling

Consumes from S06:
- `OrchestratorSnapshot` → state for rendering
- Refresh trigger channel → for `/api/v1/refresh`

### S08 → S09

Produces:
- `ssh.rs` → `SshRunner::launch_remote(host, workspace, command) -> Result<ChildProcess>` with stdio streaming
- SSH host pool: selection, per-host concurrency tracking, host preference on retry

Consumes from S05:
- `codex/app_server.rs` → session protocol (adapted for SSH stdio transport)
Consumes from S06:
- `orchestrator.rs` → dispatch integration, host assignment in running entries

### S09 → (milestone complete)

Produces:
- Conformance test sweep covering all Spec §17 behaviors
- Gap fixes for any missing behaviors found during audit
- README with build, run, test, and configuration docs

Consumes from all prior slices:
- All modules, all test infrastructure
