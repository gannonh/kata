---
estimated_steps: 5
estimated_files: 5
---

# T01: Author failing SSH extension conformance tests

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Create the S08 red-suite first so Appendix A host-pool, SSH transport, and remote workspace behavior are locked before implementation. The tests should compile against minimal exported surfaces and fail on meaningful contract assertions.

## Steps

1. Add `tests/ssh_tests.rs` covering SSH target parsing, `SYMPHONY_SSH_CONFIG`, shell escaping, command construction, and missing-ssh failure behavior.
2. Extend `tests/workspace_tests.rs` with remote workspace prepare/hook/remove assertions using a fake SSH harness or command capture fixture.
3. Extend `tests/codex_tests.rs` with SSH transport startup assertions proving remote launch uses `cd <workspace> && exec <codex.command>` while the turn protocol remains the same.
4. Extend `tests/orchestrator_tests.rs` with failing host-pool assertions for first-dispatch selection, per-host caps, no-local-fallback, retry preferred host, and same-host continuation.
5. Add only the minimal `src/lib.rs`/module stubs or exported symbols required so failures are behavioral rather than unresolved imports.

## Must-Haves

- [ ] `tests/ssh_tests.rs` exists and covers parsing, config, escaping, command shape, and unavailable-ssh behavior
- [ ] Workspace, codex, and orchestrator test suites each gain at least one failing S08-specific assertion
- [ ] Host-pool tests assert both positive selection behavior and negative all-hosts-full behavior
- [ ] Minimal compile surfaces are added without prematurely implementing S08 behavior
- [ ] The red baseline fails on contract assertions, not compiler or module-resolution errors

## Verification

- `cargo test --test ssh_tests --test codex_tests --test orchestrator_tests --test workspace_tests`
- Confirm the failing output points to S08 behavior gaps (SSH parsing/launch/host-pool assertions), not unresolved symbols or syntax errors

## Observability Impact

- Signals added/changed: The tests require explicit host-affinity and capacity diagnostics to become durable runtime surfaces instead of ad hoc debug text.
- How a future agent inspects this: `cargo test --test ssh_tests --test codex_tests --test orchestrator_tests --test workspace_tests -- --nocapture`
- Failure state exposed: SSH command drift, remote workspace lifecycle gaps, and lost host affinity will fail with targeted assertion messages.

## Inputs

- `.kata/milestones/M001/slices/S08/S08-RESEARCH.md` — Appendix A contract, known pitfalls, and suggested verification targets
- `.kata/milestones/M001/slices/S05/S05-SUMMARY.md` — existing codex transport and event-loop seam constraints to preserve
- `.kata/milestones/M001/slices/S06/S06-SUMMARY.md` — orchestrator retry/state/snapshot behavior that S08 extends
- `src/domain.rs` — worker config and worker_host-bearing runtime types already available for assertions
- `tests/codex_tests.rs` / `tests/orchestrator_tests.rs` / `tests/workspace_tests.rs` — existing deterministic integration harness patterns to extend

## Expected Output

- `tests/ssh_tests.rs` — failing SSH helper/launch contract suite for S08
- `tests/workspace_tests.rs` — remote workspace lifecycle assertions
- `tests/codex_tests.rs` — SSH-backed app-server launch assertions
- `tests/orchestrator_tests.rs` — host-pool and host-affinity assertions
- `src/lib.rs` — minimal exported compile surface for the new SSH module
