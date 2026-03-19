# S08: SSH Remote Worker Extension

**Goal:** Add a real SSH-backed remote worker path that prepares remote workspaces, launches Codex app-server sessions over SSH stdio, and enforces orchestrator-owned host-pool behavior including per-host caps, retry host preference, and same-host continuation.
**Demo:** `cargo test --test ssh_tests --test codex_tests --test orchestrator_tests --test workspace_tests` proves SSH target parsing/command construction, remote workspace lifecycle, app-server handshake over SSH transport, first-dispatch host selection, per-host capacity gating, retry host preference, and continuation turns staying on the same host/workspace.

## Must-Haves

- `src/ssh.rs` exists with SSH target parsing, `SYMPHONY_SSH_CONFIG` support, remote shell escaping, and `ssh -T ... bash -lc ...` launch helpers
- Remote workspace preparation/cleanup and remote hooks execute over SSH against remote `workspace.root` instead of local filesystem helpers
- `src/codex/app_server.rs` gains a transport seam so existing handshake/turn logic works for both local subprocesses and SSH-backed subprocesses without duplicating the JSON-RPC loop
- Orchestrator selects hosts from `worker.ssh_hosts`, enforces `max_concurrent_agents_per_host`, and never silently falls back to local execution when SSH capacity is exhausted
- Retry scheduling and continuation dispatch preserve `worker_host` and remote workspace identity so retries prefer the prior host and continuation turns stay on the same host
- Snapshot/runtime diagnostics continue surfacing `worker_host`, workspace path, and host-capacity failures without exposing secrets or raw SSH auth material

## Requirement Coverage (Active requirements this slice owns/supports)

- **Owned:**
  - **R011 SSH Remote Worker Extension** → T01, T02, T03, T04 (verified by `tests/ssh_tests.rs`, `tests/codex_tests.rs`, `tests/orchestrator_tests.rs`, and `tests/workspace_tests.rs`)
- **Supporting:**
  - **R013 Spec-Driven Test Suite** → T01, T03, T04 (slice-level extension conformance tests added and kept green)
  - **R009 Structured Logging with Issue/Session Context** → T03, T04 (verified by host/session diagnostics assertions in codex/orchestrator tests)

## Proof Level

- This slice proves: operational (real runtime composition of remote workspace prep, SSH transport, and orchestrator host-pool control using executable integration tests)
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `tests/ssh_tests.rs` (created in T01) with real assertions for SSH target parsing, `SYMPHONY_SSH_CONFIG`, remote shell escaping, `ssh -T` command construction, and deterministic launch failure when `ssh` is unavailable
- `tests/workspace_tests.rs` additions asserting remote workspace prepare/hook/remove commands run over SSH and preserve remote workspace path identity
- `tests/codex_tests.rs` additions asserting the app-server handshake/turn protocol runs unchanged over SSH transport and remote launch uses `cd <workspace> && exec <codex.command>`
- `tests/orchestrator_tests.rs` additions asserting first dispatch host selection, per-host cap enforcement, no local fallback when all hosts are full, retry host preference, same-host continuation, and host-aware snapshot diagnostics
- `cargo test --test ssh_tests --test codex_tests --test orchestrator_tests --test workspace_tests`
- `cargo build`

## Observability / Diagnostics

- Runtime signals: structured runtime events/log fields for `worker_host`, host-capacity exhaustion, remote workspace command failures, and SSH session launch failures with issue/session context only
- Inspection surfaces: `tests/orchestrator_tests.rs` snapshot assertions, `tests/codex_tests.rs` SSH transport assertions, and orchestrator snapshot `running` / retry queue fields carrying `worker_host`
- Failure visibility: deterministic `SymphonyError`/runtime-event surfaces for SSH launch failure, all-hosts-full dispatch skip, remote hook failure, and preserved `worker_host` on retries/continuations
- Redaction constraints: never log SSH auth material, config file contents, or raw environment secrets; diagnostics may include target host, port, issue identifiers, and sanitized remote workspace paths only

## Integration Closure

- Upstream surfaces consumed:
  - `src/orchestrator.rs` dispatch/retry/state authority from S06
  - `src/codex/app_server.rs` handshake/turn loop from S05
  - `src/workspace.rs` local lifecycle helpers and workspace identity rules from S04
  - `src/domain.rs` worker config, run/retry snapshot types, and agent events
- New wiring introduced in this slice:
  - SSH helper module and remote command builder
  - Remote workspace execution path wired into worker attempt execution
  - Shared app-server startup seam that selects local vs SSH transport
  - Orchestrator host-pool selection/capacity logic integrated into first dispatch and retry/continuation reuse
- What remains before the milestone is truly usable end-to-end:
  - S09 full §17 conformance sweep and README polish
  - Explicit live integration run against a real remote SSH host remains milestone-level proof, not slice-level automation

## Tasks

- [ ] **T01: Author failing SSH extension conformance tests** `est:50m`
  - Why: Lock the Appendix A boundary contracts first so remote transport, workspace, and host-pool behavior are driven by executable proofs instead of ad hoc implementation.
  - Files: `tests/ssh_tests.rs`, `tests/codex_tests.rs`, `tests/orchestrator_tests.rs`, `tests/workspace_tests.rs`, `src/lib.rs`
  - Do: Add a red-suite covering SSH target parsing/command construction, remote workspace lifecycle, SSH-backed app-server launch shape, and orchestrator host selection/capacity/affinity behavior; add only the minimal module exports/stubs needed so failures are behavioral rather than missing-symbol compile errors.
  - Verify: `cargo test --test ssh_tests --test codex_tests --test orchestrator_tests --test workspace_tests` (expected failing assertions for unimplemented SSH behavior)
  - Done when: All S08 must-haves are represented by concrete assertions and the initial failures are contract-level, not syntax/import failures.
- [ ] **T02: Implement SSH helper and remote workspace lifecycle** `est:75m`
  - Why: Remote workers are invalid until workspace creation, hooks, and cleanup execute on the remote host using Appendix A semantics instead of local filesystem assumptions.
  - Files: `src/ssh.rs`, `src/workspace.rs`, `src/path_safety.rs`, `src/domain.rs`, `src/lib.rs`, `tests/ssh_tests.rs`, `tests/workspace_tests.rs`
  - Do: Add SSH target parsing, config/env-aware command builders, and remote shell escaping; extend workspace handling with remote prepare/hook/remove helpers that use SSH commands against remote `workspace.root` while preserving sanitized workspace identity and hook timeout/error semantics.
  - Verify: `cargo test --test ssh_tests --test workspace_tests`
  - Done when: SSH helper tests pass, remote workspace tests prove hooks/cleanup run over SSH, and no remote path is incorrectly canonicalized as a local filesystem path.
- [ ] **T03: Refactor app-server startup for SSH transport reuse** `est:75m`
  - Why: S08 must keep S05’s validated JSON-RPC loop intact while swapping only the process-launch transport for remote sessions.
  - Files: `src/codex/app_server.rs`, `src/codex/mod.rs`, `src/ssh.rs`, `src/domain.rs`, `tests/codex_tests.rs`, `tests/ssh_tests.rs`
  - Do: Introduce a launch transport seam for local vs SSH child processes, adapt session startup to accept remote workspace identity/host metadata, and reuse the existing handshake/turn/event/token logic unchanged above that seam; add diagnostics for SSH launch/session failures with `worker_host` context.
  - Verify: `cargo test --test codex_tests --test ssh_tests`
  - Done when: Existing local codex tests stay green, new SSH codex tests pass, and remote launch uses `cd <workspace> && exec <codex.command>` over `ssh -T` without a duplicate turn loop.
- [ ] **T04: Wire orchestrator host-pool dispatch, affinity, and snapshot diagnostics** `est:90m`
  - Why: The slice is not real until the scheduler actually chooses SSH hosts, enforces capacity, preserves host affinity across retries/continuations, and surfaces that state to operators.
  - Files: `src/orchestrator.rs`, `src/domain.rs`, `src/workspace.rs`, `src/codex/app_server.rs`, `tests/orchestrator_tests.rs`, `tests/codex_tests.rs`, `tests/workspace_tests.rs`
  - Do: Add orchestrator-owned host selection and per-host slot accounting for first dispatches, retries, and continuation runs; refuse dispatch when all SSH hosts are full instead of falling back locally; wire remote workspace/session startup through worker execution and preserve `worker_host` + workspace path in running/retry snapshot state and runtime diagnostics.
  - Verify: `cargo test --test orchestrator_tests --test codex_tests --test workspace_tests` and `cargo build`
  - Done when: Host-pool behavior is proven by green orchestrator tests, snapshot/runtime diagnostics include `worker_host`, and the full S08 verification suite passes.

## Files Likely Touched

- `src/ssh.rs`
- `src/workspace.rs`
- `src/codex/app_server.rs`
- `src/orchestrator.rs`
- `src/domain.rs`
- `src/path_safety.rs`
- `src/lib.rs`
- `tests/ssh_tests.rs`
- `tests/workspace_tests.rs`
- `tests/codex_tests.rs`
- `tests/orchestrator_tests.rs`
