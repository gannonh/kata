---
id: T04
parent: S06
milestone: M001
provides:
  - Replaced placeholder CLI bootstrap with a deterministic startup pipeline that checks workflow existence, validates startup config via WorkflowStore, constructs runtime dependencies, and starts orchestrator runtime with shutdown handling
key_files:
  - src/main.rs
  - tests/cli_tests.rs
  - .kata/DECISIONS.md
  - .kata/milestones/M001/slices/S06/S06-PLAN.md
key_decisions:
  - "D038: Emit JSON-structured startup/runtime lifecycle logs with phase/stage/workflow_path fields so bootstrap failures are machine-inspectable"
patterns_established:
  - "Bootstrap stage-gate pattern: existence check -> startup_validate -> start_orchestrator, with stage-specific error wrapping"
  - "Runtime startup context pattern: load WorkflowStore once, validate effective config, then reuse validated context for runtime construction"
observability_surfaces:
  - "JSON tracing events for bootstrap and runtime lifecycle stages (`phase`, `stage`, `workflow_path`, `reason`)"
  - "Deterministic startup error strings surfaced by execute_cli for missing workflow, invalid startup config, and orchestrator startup failures"
duration: 68m
verification_result: passed
completed_at: 2026-03-18T20:22:18Z
blocker_discovered: false
---

# T04: Wire CLI bootstrap/shutdown semantics and finalize S06 verification

**Implemented a real, testable CLI bootstrap/shutdown path that validates workflow/config through WorkflowStore, constructs orchestrator runtime dependencies, and exits deterministically on startup failure modes.**

## What Happened

- Reworked `src/main.rs` from placeholder behavior into a staged bootstrap flow:
  1. parse args (`WORKFLOW.md` default + positional override)
  2. verify workflow file exists
  3. run startup validation through `WorkflowStore::new(...)` + `config::validate(...)`
  4. construct runtime dependencies (Linear client/adapter + `Orchestrator`)
  5. start orchestrator loop with graceful shutdown handling (`tokio::select!` over runtime and `ctrl_c`)
- Added runtime bootstrap state caching (`StartupContext`) inside `RuntimeBootstrapDeps` so the validated `WorkflowStore`/effective config can be reused by startup.
- Added structured startup/runtime tracing with safe fields only (`phase`, `stage`, `workflow_path`, lifecycle `reason`) and no config dumps/API-key leakage.
- Refactored binary startup into `run_entrypoint(...)` + `init_tracing()` for deterministic parse/startup exit semantics (`2` for parse errors, `1` for startup errors).
- Preserved and satisfied existing CLI conformance tests without weakening contracts.
- Marked T04 complete in `S06-PLAN.md`.
- Appended D038 to `.kata/DECISIONS.md` for bootstrap observability shape.

## Verification

Slice verification commands from the plan:

- `cargo test --test cli_tests --test orchestrator_tests` ✅
  - `cli_tests`: 5/5 passed (default path, override path, missing workflow failure, startup validation failure gating, successful startup call-order)
  - `orchestrator_tests`: 14/14 passed
- `cargo build` ✅

Additional observability checks for this task scope:

- `RUST_LOG=info cargo run -- missing/WORKFLOW.md` ✅
  - emits structured startup logs and exits non-zero with deterministic missing-workflow error
- `RUST_LOG=info cargo run -- /tmp/symphony-invalid-workflow.md` ✅
  - startup validation fails before runtime dispatch path with explicit invalid-config reason
- `RUST_LOG=info cargo run -- /tmp/symphony-valid-workflow.md` ✅
  - successful bootstrap constructs runtime, emits runtime start/stop lifecycle events

## Diagnostics

How to inspect this behavior later:

- Bootstrap contract checks:
  - `cargo test --test cli_tests -- --nocapture`
- Full S06 gate:
  - `cargo test --test cli_tests --test orchestrator_tests`
  - `cargo build`
- Startup/shutdown lifecycle logs:
  - `RUST_LOG=info cargo run -- <workflow-path>`
  - Watch JSON log events for `phase=startup|runtime` and `stage=bootstrap|validate|runtime_init|start|stopped`

## Deviations

None.

## Known Issues

- `tests/cli_tests.rs` compiles `src/main.rs` as a module (`#[path = "../src/main.rs"]`), so Rust reports dead-code warnings for runtime-only symbols in that test context. This is cosmetic and does not affect behavior or verification status.

## Files Created/Modified

- `src/main.rs` — replaced placeholder CLI path with staged bootstrap, WorkflowStore-backed startup validation, runtime construction, graceful shutdown handling, and structured startup diagnostics.
- `.kata/DECISIONS.md` — appended D038 (startup observability/logging shape decision).
- `.kata/milestones/M001/slices/S06/S06-PLAN.md` — marked T04 checkbox as done.
- `.kata/milestones/M001/slices/S06/tasks/T04-SUMMARY.md` — task summary artifact.
