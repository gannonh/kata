---
estimated_steps: 5
estimated_files: 6
---

# T03: Refactor app-server startup for SSH transport reuse

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Introduce a launch-transport seam in the Codex app-server client so SSH-backed sessions reuse the already-validated JSON-RPC handshake, turn streaming, approvals, tool calls, and token accounting. This task closes the most protocol-sensitive part of S08 without forking S05 logic.

## Steps

1. Refactor `src/codex/app_server.rs` so session startup chooses a launch transport (local subprocess or SSH subprocess) while keeping the handshake and turn loop shared above that seam.
2. Adjust workspace identity inputs so remote sessions can launch against a remote workspace path/host without forcing local root canonicalization that only makes sense for local workers.
3. Wire SSH transport startup to use the `src/ssh.rs` helpers and remote launch command `cd <workspace> && exec <codex.command>` over `ssh -T`.
4. Emit or preserve host-aware diagnostics/events on session start and SSH launch failure so `worker_host` survives through codex-side observability surfaces.
5. Make `tests/codex_tests.rs` and any SSH helper transport assertions pass without regressing the existing local codex test matrix.

## Must-Haves

- [ ] The JSON-RPC handshake/turn loop remains single-source and is not duplicated for SSH
- [ ] Remote launch uses `cd <workspace> && exec <codex.command>` over SSH transport with the helper-built command shape
- [ ] Remote session startup does not rely on local filesystem visibility of the remote workspace path
- [ ] Existing local codex tests continue passing unchanged in behavior
- [ ] SSH launch/session failures include `worker_host` or equivalent host context in diagnostics

## Verification

- `cargo test --test codex_tests --test ssh_tests`
- Confirm pre-existing local codex cases still pass along with the new SSH transport coverage

## Observability Impact

- Signals added/changed: Session start/failure surfaces gain host-aware context for SSH-backed runs while retaining the S05 event vocabulary.
- How a future agent inspects this: `tests/codex_tests.rs` isolates whether failures come from launch transport, handshake, or turn streaming.
- Failure state exposed: SSH launch failure, remote cwd misuse, and transport-specific start issues become distinguishable from generic port-exit failures.

## Inputs

- `src/codex/app_server.rs` — validated local transport, handshake, and turn loop from S05
- `src/ssh.rs` — SSH command-builder helpers from T02
- `.kata/milestones/M001/slices/S05/S05-SUMMARY.md` — non-negotiable protocol behaviors and fragility notes
- `.kata/milestones/M001/slices/S08/S08-RESEARCH.md` — required remote launch shape and target pitfalls

## Expected Output

- `src/codex/app_server.rs` — shared launch transport seam with SSH-backed startup support
- `tests/codex_tests.rs` — passing SSH transport launch/handshake assertions alongside existing local cases
- `src/codex/mod.rs` / `src/domain.rs` / `src/ssh.rs` — supporting exports and host-aware startup inputs
