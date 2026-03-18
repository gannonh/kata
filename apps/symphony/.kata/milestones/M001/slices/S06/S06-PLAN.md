# S06: Orchestrator Core

**Goal:** Implement the orchestrator runtime authority (`src/orchestrator.rs`) and CLI wiring so Symphony can run the full poll → reconcile → dispatch → retry loop with bounded concurrency, retry semantics, stall recovery, and dispatch preflight validation.
**Demo:** `cargo test --test orchestrator_tests --test cli_tests` proves candidate ordering/gating, startup terminal cleanup, reconcile-first tick ordering, per-tick preflight validation behavior, retry scheduling (continuation + exponential backoff), stale retry token suppression, stall detection, aggregate token/rate-limit accounting, and CLI startup/exit semantics.

## Must-Haves

- `src/orchestrator.rs` exists and exports `Orchestrator::new(...)` + `run()` as the runtime authority loop
- Tick ordering is enforced: reconcile running issues first, then dispatch preflight validation, then candidate fetch/dispatch
- Dispatch preflight validation calls `config::validate` on every dispatch cycle; validation failure skips dispatch but reconciliation still runs (R014)
- Candidate eligibility enforces: not already claimed/running/completed, Todo-blocker gating, and active-state membership
- Candidate ordering follows spec intent: priority, created_at, identifier fallback
- Concurrency caps enforced: global `max_concurrent_agents` and per-state `max_concurrent_agents_by_state`
- Startup cleanup removes/marks terminal issues using tracker terminal-state fetch before normal dispatch begins
- Dispatch preflight refresh re-reads issue state by id before starting worker attempt
- Worker completion handling distinguishes continuation retries (attempt 1 after normal completion) vs failure retries (exponential backoff capped by config)
- Retry scheduling ignores stale timer firings via token/nonce matching
- Stall detection uses last Codex activity timestamp and schedules retry on stall timeout
- `OrchestratorSnapshot` reflects running entries, retry queue, codex totals, latest rate-limit payload, and poll status
- Structured logs include issue/session context fields (`issue_id`, `issue_identifier`, `session_id`) on dispatch and worker outcomes (R009 support)
- CLI (`src/main.rs`) validates workflow path, starts orchestrator service, and exits non-zero on startup failure (R008)

## Requirement Coverage (Active requirements this slice owns/supports)

- **Owned:**
  - **R006 Orchestrator State Machine** → T01, T02, T03 (verified by `tests/orchestrator_tests.rs`)
  - **R008 CLI Entry Point** → T01, T04 (verified by `tests/cli_tests.rs`)
  - **R014 Dispatch Preflight Validation** → T01, T02 (verified by `test_preflight_validation_skips_dispatch_but_reconcile_continues`)
- **Supporting:**
  - **R009 Structured Logging** → T03, T04 (verified by context-field assertions and failure-path tests)
  - **R015 Token Accounting + Rate Limits** → T03 (verified by aggregate totals and rate-limit snapshot tests)

## Proof Level

- This slice proves: operational (runtime orchestration behavior with deterministic async integration tests)
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `tests/orchestrator_tests.rs` (created in T01) with real assertions for:
  - startup terminal cleanup
  - reconcile-first tick ordering
  - preflight validation failure skips dispatch but reconciliation still runs
  - candidate sorting + global/per-state concurrency gating
  - Todo-blocker exclusion
  - pre-dispatch state refresh and stale-state rejection
  - continuation retry scheduling (1s) and failure exponential backoff cap
  - stale retry timer suppression
  - stall detection and forced retry scheduling
  - codex token/rate-limit aggregate accumulation into snapshot
  - snapshot includes retry/running diagnostics for failed runs
- `tests/cli_tests.rs` (created in T01) with assertions for:
  - default `WORKFLOW.md` path and optional positional override
  - startup failure on missing workflow file (non-zero path)
  - startup validation failure surfaces error and exits failure
  - successful bootstrap path invokes orchestrator startup
- `cargo test --test orchestrator_tests --test cli_tests`
- `cargo build`

## Observability / Diagnostics

- Runtime signals: structured `tracing` events for tick phase transitions (`reconcile`, `validate`, `dispatch`), worker lifecycle (`started`, `completed`, `failed`, `stalled`), retry scheduling (`retry_kind`, `attempt`, `due_at_ms`, `token`)
- Inspection surfaces: `OrchestratorSnapshot` read API (running map, retry queue, codex totals/rate-limits, poll timing) and deterministic test fakes that expose call history
- Failure visibility: snapshot carries retry attempt/error metadata; logs include issue/session correlation fields; stale retry suppression emits explicit ignored-token event
- Redaction constraints: never log tracker API keys or full config structs (honor D014); only emit field names and safe identifiers

## Integration Closure

- Upstream surfaces consumed:
  - `workflow_store.rs` (`effective_config`, `force_reload`)
  - `config.rs` (`validate` preflight)
  - `linear/adapter.rs` (`TrackerAdapter` reads)
  - `workspace.rs` (`ensure_workspace`, hook helpers)
  - `prompt_builder.rs` (`render_prompt`)
  - `codex/app_server.rs` (`start_session`, `run_turn`, `stop_session`)
  - `domain.rs` (`Issue`, `RunAttempt`, `RetryEntry`, `OrchestratorState`, `OrchestratorSnapshot`, `AgentEvent`)
- New wiring introduced in this slice:
  - orchestrator authority loop with channel-driven worker/retry events
  - worker attempt composition that joins tracker + workspace + prompt + codex layers
  - CLI bootstrap path that instantiates WorkflowStore, tracker adapter, and orchestrator runtime
- What remains before the milestone is truly usable end-to-end:
  - S07 HTTP dashboard/API surfaces on top of orchestrator snapshot and refresh trigger
  - S08 SSH remote worker transport + per-host scheduling
  - S09 full §17 conformance sweep and final integration polish

## Tasks

- [ ] **T01: Author failing orchestrator + CLI conformance tests** `est:45m`
  - Why: Lock the S06 behavioral contract first so implementation is guided by executable proofs (including failure-path diagnostics), not ad hoc runtime debugging.
  - Files: `tests/orchestrator_tests.rs`, `tests/cli_tests.rs`, `src/orchestrator.rs`, `src/lib.rs`, `src/main.rs`
  - Do: Create deterministic test fakes (tracker, workflow-store facade, worker runner) and write failing tests for reconcile/dispatch/retry/stall/token semantics plus CLI startup semantics. Add minimal orchestrator/CLI stubs only as needed so tests compile and fail on assertions.
  - Verify: `cargo test --test orchestrator_tests --test cli_tests` (expected failing assertions for unimplemented runtime behavior)
  - Done when: Test files exist with concrete assertions covering all Must-Haves and owned requirements; failures are behavioral (not compile errors).

- [ ] **T02: Implement orchestrator authority loop, reconciliation, and dispatch gating** `est:60m`
  - Why: This is the core R006/R014 scheduler spine — without deterministic tick ordering, eligibility logic, and slot checks, all downstream worker logic is unstable.
  - Files: `src/orchestrator.rs`, `src/domain.rs`, `src/lib.rs`, `tests/orchestrator_tests.rs`
  - Do: Implement orchestrator state owner loop, startup terminal cleanup, reconcile-first tick pipeline, per-tick `config::validate` preflight, candidate sorting/eligibility, global+per-state slot accounting, and pre-dispatch issue refresh checks. Expose snapshot reads used by tests/S07.
  - Verify: `cargo test --test orchestrator_tests test_reconcile` + `cargo test --test orchestrator_tests test_dispatch`
  - Done when: Dispatch/reconcile/preflight tests pass and no candidate can dispatch when blocked by validation, blockers, stale state, or slot limits.

- [ ] **T03: Add worker lifecycle integration, retries, stall recovery, and token accounting** `est:60m`
  - Why: Completion handling, retries, and observability close the runtime control loop and are the highest-risk correctness surface for S06.
  - Files: `src/orchestrator.rs`, `src/domain.rs`, `tests/orchestrator_tests.rs`, `src/codex/app_server.rs`
  - Do: Wire attempt execution with workspace + prompt + codex runner, ingest `AgentEvent` updates into live session activity timestamps, schedule continuation/failure retries with tokenized timers, ignore stale retry firings, enforce stall timeout retries, and accumulate `TurnResult` token/rate-limit deltas into orchestrator totals.
  - Verify: `cargo test --test orchestrator_tests test_retry` + `cargo test --test orchestrator_tests test_stall` + `cargo test --test orchestrator_tests test_token`
  - Done when: Retry/stall/token tests pass, snapshot exposes retry diagnostics, and failure-path signals include issue/session context.

- [ ] **T04: Wire CLI bootstrap/shutdown semantics and finalize S06 verification** `est:45m`
  - Why: R008 requires a real operator entrypoint; S06 is not complete until the binary can bootstrap orchestrator runtime with deterministic failure behavior.
  - Files: `src/main.rs`, `src/orchestrator.rs`, `tests/cli_tests.rs`, `tests/orchestrator_tests.rs`
  - Do: Replace placeholder main with testable bootstrap function, validate workflow path before startup, instantiate WorkflowStore + Linear adapter + orchestrator, wire graceful shutdown handling, and ensure startup failures return non-zero while preserving structured diagnostics.
  - Verify: `cargo test --test cli_tests --test orchestrator_tests` and `cargo build`
  - Done when: CLI tests pass for default/override/failure/success paths and full S06 test suite is green.

## Files Likely Touched

- `src/orchestrator.rs`
- `src/main.rs`
- `src/lib.rs`
- `src/domain.rs`
- `tests/orchestrator_tests.rs`
- `tests/cli_tests.rs`
- `src/codex/app_server.rs`
