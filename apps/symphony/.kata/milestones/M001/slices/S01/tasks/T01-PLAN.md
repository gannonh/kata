---
estimated_steps: 5
estimated_files: 1
---

# T01: Add runtime entity types and agent event enum

**Slice:** S01 — Domain Types and Error Foundation
**Milestone:** M001

## Description

The existing `src/domain.rs` covers §4.1.1–4.1.3 (Issue, WorkflowDefinition, ServiceConfig + all sub-structs). This task adds the remaining spec entities: Workspace (§4.1.4), RunAttempt (§4.1.5), LiveSession (§4.1.6), RetryEntry (§4.1.7), OrchestratorState (§4.1.8), plus the AgentEvent enum (§10.4), OrchestratorSnapshot (S06→S07 boundary), CodexTotals, and RateLimitInfo. It also fixes the `ServerConfig::Default` divergence where `Default` sets host to empty string but `new()` sets it to `"127.0.0.1"`.

## Steps

1. Fix `ServerConfig` — make `Default` impl set `host: "127.0.0.1"` and remove the `new()` method (or make it delegate to Default).
2. Add `Workspace` struct: `path: String`, `workspace_key: String`, `created_now: bool`. Derive `Debug, Clone`.
3. Add `RunAttempt` struct with fields from §4.1.5: `issue_id`, `issue_identifier`, `attempt: Option<u32>` (null for first run), `workspace_path`, `started_at: DateTime<Utc>`, `status: String`, `error: Option<String>`, `worker_host: Option<String>`. Derive `Debug, Clone, Serialize, Deserialize`.
4. Add `LiveSession` struct with all 16 fields from §4.1.6: `session_id`, `thread_id`, `turn_id`, `codex_app_server_pid: Option<String>`, `last_codex_event: Option<String>`, `last_codex_timestamp: Option<DateTime<Utc>>`, `last_codex_message: Option<String>`, `codex_input_tokens: u64`, `codex_output_tokens: u64`, `codex_total_tokens: u64`, `last_reported_input_tokens: u64`, `last_reported_output_tokens: u64`, `last_reported_total_tokens: u64`, `turn_count: u32`, `started_at: DateTime<Utc>`, `worker_host: Option<String>`. Derive `Debug, Clone, Serialize, Deserialize`. Default token counters to 0 with `#[serde(default)]`.
5. Add `RetryEntry` struct: `issue_id`, `identifier`, `attempt: u32`, `due_at_ms: i64` (monotonic), `timer_handle: Option<String>` (opaque placeholder — concrete type wired in S06), `error: Option<String>`, `worker_host: Option<String>`, `workspace_path: Option<String>`. Derive `Debug, Clone`.
6. Add `CodexTotals` struct: `input_tokens: u64`, `output_tokens: u64`, `total_tokens: u64`, `seconds_running: f64`. Derive `Debug, Clone, Serialize, Deserialize, Default`.
7. Add `RateLimitInfo` struct: `data: serde_json::Value` (opaque rate-limit snapshot from agent events). Derive `Debug, Clone, Serialize, Deserialize`.
8. Add `OrchestratorState` struct per §4.1.8: `poll_interval_ms: u64`, `max_concurrent_agents: u32`, `running: HashMap<String, RunAttempt>`, `claimed: HashSet<String>`, `retry_attempts: HashMap<String, RetryEntry>`, `completed: HashSet<String>`, `codex_totals: CodexTotals`, `codex_rate_limits: Option<RateLimitInfo>`. Derive `Debug, Clone`. Import `HashSet`.
9. Add `OrchestratorSnapshot` struct (read-only serializable view for API): same fields as OrchestratorState but uses `BTreeMap` for `running` and `retry_queue: Vec<RetrySnapshotEntry>` for sorted output. Add `RetrySnapshotEntry` with `issue_id`, `identifier`, `attempt`, `due_in_ms: i64`, `error`, `worker_host`, `workspace_path`. Add `PollingSnapshot` with `checking: bool`, `next_poll_in_ms: i64`, `poll_interval_ms: u64`. Derive `Debug, Clone, Serialize, Deserialize`.
10. Add `AgentEvent` enum with variants: `SessionStarted`, `StartupFailed`, `TurnCompleted`, `TurnFailed`, `TurnCancelled`, `TurnEndedWithError`, `TurnInputRequired`, `ApprovalAutoApproved`, `UnsupportedToolCall`, `Notification`, `OtherMessage`, `Malformed`. Each variant carries `timestamp: DateTime<Utc>`, `codex_app_server_pid: Option<String>`, and variant-specific payload fields. Derive `Debug, Clone`.

## Must-Haves

- [ ] `Workspace`, `RunAttempt`, `LiveSession`, `RetryEntry`, `OrchestratorState`, `OrchestratorSnapshot`, `CodexTotals`, `RateLimitInfo`, `AgentEvent` all defined in `domain.rs`
- [ ] `ServerConfig::default().host` equals `"127.0.0.1"`
- [ ] All types are `Send + Sync` (verified by `cargo build` in async context)
- [ ] `cargo build` passes with zero errors and zero warnings
- [ ] Snapshot types use `BTreeMap` for deterministic JSON serialization

## Verification

- `cargo build 2>&1 | grep -c "error\|warning"` outputs `0`
- Spot-check: `ServerConfig::default().host` in a quick test or by reading the code

## Observability Impact

- Signals added/changed: None (pure type definitions)
- How a future agent inspects this: Read `src/domain.rs` — all domain types in one file
- Failure state exposed: Compile errors if types are incorrect

## Inputs

- `src/domain.rs` — existing types covering §4.1.1–4.1.3
- Spec §4.1.4–4.1.8 — field definitions for runtime entities
- Spec §10.4 — agent event variants
- Elixir `orchestrator.ex` State defstruct — runtime state field reference

## Expected Output

- `src/domain.rs` — extended with all runtime entity types, agent events, snapshot types, and `ServerConfig` default fix. Complete coverage of spec §4.1 entities.
