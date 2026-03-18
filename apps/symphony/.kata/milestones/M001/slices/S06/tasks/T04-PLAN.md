---
estimated_steps: 4
estimated_files: 4
---

# T04: Wire CLI bootstrap/shutdown semantics and finalize S06 verification

**Slice:** S06 — Orchestrator Core
**Milestone:** M001

## Description

Replace the placeholder CLI entrypoint with a real bootstrap path that validates workflow input, initializes runtime dependencies, starts the orchestrator service, and returns deterministic success/failure exit behavior. This task closes R008 and finalizes S06 proof commands.

## Steps

1. Refactor `main.rs` into a testable bootstrap function that parses args, validates workflow path existence, and loads workflow/config through `WorkflowStore`.
2. Wire runtime construction (tracker adapter, orchestrator instance, logging setup) and start the orchestrator loop with graceful shutdown handling.
3. Implement startup failure handling and exit-code semantics: missing workflow/config validation failures return non-zero and structured diagnostics.
4. Make `tests/cli_tests.rs` green and run full S06 verification commands (`orchestrator_tests`, `cli_tests`, `cargo build`).

## Must-Haves

- [ ] CLI supports default `WORKFLOW.md` and optional positional override path
- [ ] Missing workflow file fails startup deterministically with non-zero result
- [ ] Startup config validation failure fails startup before dispatch begins
- [ ] Successful bootstrap path constructs and starts orchestrator runtime
- [ ] Structured logs include startup context without exposing secrets
- [ ] S06 verification command set passes end-to-end

## Verification

- `cargo test --test cli_tests --test orchestrator_tests`
- `cargo build`

## Observability Impact

- Signals added/changed: Startup/shutdown lifecycle logs and startup-failure reason logs keyed by workflow path.
- How a future agent inspects this: `cli_tests` provide deterministic startup contract coverage; runtime logs identify bootstrap stage failures.
- Failure state exposed: startup exits now map to explicit error paths (missing file, invalid config) instead of ambiguous println output.

## Inputs

- `src/orchestrator.rs` — runtime loop and constructor from T02/T03
- `src/workflow.rs` / `src/workflow_store.rs` / `src/config.rs` — workflow parsing and validation surfaces
- `tests/cli_tests.rs` — red tests for CLI bootstrap and exit semantics
- `src/main.rs` — current placeholder CLI implementation

## Expected Output

- `src/main.rs` — real bootstrap + shutdown path with deterministic error handling
- `tests/cli_tests.rs` — all CLI behavior tests passing
- `tests/orchestrator_tests.rs` — full S06 suite passing with CLI integration complete
- `src/orchestrator.rs` — final integration touch-ups required by bootstrap wiring
