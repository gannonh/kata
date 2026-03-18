# S06: Orchestrator Core — UAT

**Milestone:** M001
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S06 deliverables are runtime-control and bootstrap semantics with deterministic integration tests plus startup diagnostics, and the slice plan explicitly marks human UAT as non-required.

## Preconditions

- Run from `apps/symphony` with Rust toolchain installed.
- `cargo` is available.
- No external services are required for these checks (tests use deterministic fakes).

## Smoke Test

Run:

`cargo test --test orchestrator_tests --test cli_tests`

Expected: all 19 tests pass.

## Test Cases

### 1. Orchestrator control-loop contract

1. Run `cargo test --test orchestrator_tests`.
2. Confirm tests for startup cleanup, reconcile-first ordering, dispatch gating, retries, stale retry suppression, stall recovery, and snapshot diagnostics pass.
3. **Expected:** 14/14 pass with no failing assertions.

### 2. CLI startup/exit contract

1. Run `cargo test --test cli_tests`.
2. Confirm default/override workflow path parsing tests pass.
3. Confirm missing-workflow and invalid-config startup failure paths pass.
4. **Expected:** 5/5 pass; startup failure paths return deterministic non-zero semantics.

### 3. Structured startup failure visibility

1. Run `RUST_LOG=info cargo run -- missing/WORKFLOW.md`.
2. Inspect output for structured fields (`phase=startup`, `stage=bootstrap`, `workflow_path`, `error`).
3. **Expected:** command exits code 1 and failure reason is immediately actionable.

## Edge Cases

### Stale retry timer firing

1. Run `cargo test --test orchestrator_tests test_stale_retry_timer_is_ignored -- --nocapture`.
2. **Expected:** retry event is ignored via token mismatch and does not consume active retry queue entry.

## Failure Signals

- `cargo test` failures in `orchestrator_tests` around event ordering, retry math, or stall handling.
- Missing `ValidationSkippedDispatch`/`RetryIgnoredStale` events where expected.
- `cargo run` startup failures without `phase/stage/workflow_path` context fields.

## Requirements Proved By This UAT

- R006 — orchestrator state machine behavior is proven by orchestrator integration suite.
- R008 — CLI bootstrap and deterministic startup failure semantics are proven by CLI suite.
- R014 — per-tick preflight validation skip semantics + startup validation gating are proven.
- R015 — aggregate token/rate-limit snapshot accumulation is proven.

## Not Proven By This UAT

- R010 — HTTP dashboard/API routes and rendering are not covered (S07).
- R011 — SSH remote worker execution and host-pool behavior are not covered (S08).
- R009 output-format parity (JSON + human-readable toggle) is not fully proven yet.

## Notes for Tester

- Dead-code warnings in `cli_tests` are expected because tests import `src/main.rs` as a module.
- This UAT intentionally focuses on deterministic artifacts/commands instead of manual UI inspection.
