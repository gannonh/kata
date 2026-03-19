# M001/S08 — Research

**Date:** 2026-03-19

## Summary

S08 primarily owns **R011 (SSH Remote Worker Extension)** and materially supports **R013 (spec-driven extension conformance)**. It also touches the still-active observability story in **R009** because remote execution only remains debuggable if `worker_host` and remote workspace identity are preserved in runtime events, retries, and snapshots. The good news is that S05/S06 already laid most of the state plumbing: `RunAttempt`, `RetryEntry`, `RetrySnapshotEntry`, and runtime diagnostics all already carry `worker_host`, and retry scheduling already preserves preferred-host context.

The missing work is not just “spawn Codex through ssh.” The current Rust runtime is still entirely **local-workspace + local-hook + local-cwd validated**. `orchestrator.execute_worker_attempt()` always calls `workspace::ensure_workspace()` locally, runs local hooks, and then invokes `app_server::start_session()` which canonicalizes the workspace path against a local root and spawns `bash -lc <codex.command>`. Appendix A explicitly says `workspace.root` is interpreted on the **remote host**, not the orchestrator host, so S08 must introduce a real remote-execution path instead of trying to force current local path checks to accept remote paths.

## Recommendation

Take the **Elixir parity path**: implement a dedicated `src/ssh.rs` helper and refactor the Codex session startup into a **transport seam** that keeps the existing turn protocol intact while swapping only the process-launch layer.

Concretely:
1. Add `src/ssh.rs` for SSH target parsing, `ssh -T` argument construction, `SYMPHONY_SSH_CONFIG` support, remote shell escaping, and async remote process launch.
2. Refactor `src/codex/app_server.rs` so the handshake/turn-stream logic stays shared, but session startup can choose between:
   - local subprocess (`bash -lc <codex.command>`), or
   - ssh subprocess (`ssh -T [-F config] [-p port] host bash -lc '<cd && exec ...>'`).
3. Extend `workspace.rs` with a **remote workspace preparation path** instead of reusing `ensure_workspace()` directly. Remote workspace creation, hook execution, and removal need ssh-backed commands because current implementations are local-only.
4. Add host-selection logic inside the orchestrator using existing `worker_host` persistence as the foundation: pick from `worker.ssh_hosts`, enforce `max_concurrent_agents_per_host`, prefer the previous host on retries, and keep continuation turns on the same host/workspace.

This avoids duplicating S05’s fragile JSON-RPC turn loop while respecting Appendix A’s remote-root semantics.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| SSH target parsing (`host:port`, `user@host:port`, bracketed IPv6, config file support) | Port the Elixir `SymphonyElixir.SSH` rules from `elixir/lib/symphony_elixir/ssh.ex` | The edge cases are already solved and covered by focused tests; these are easy to get subtly wrong. |
| Remote Codex transport | Reuse S05 handshake + turn-stream logic and only swap launch transport | The risky protocol work is already validated in Rust; S08 should not fork the JSON-RPC logic. |
| Preferred-host retry behavior | Reuse S06 retry context (`worker_host`, `workspace_path`, `session_id`) | The runtime already persists host affinity across retries and completions; build selection around that instead of inventing new retry state. |
| Remote workspace preparation | Follow the Elixir remote workspace/hook command pattern from `workspace.ex` | Appendix A makes remote `workspace.root` authoritative; local mkdir/hook execution is incorrect for ssh workers. |

## Existing Code and Patterns

- `src/domain.rs` — `WorkerConfig` already exposes `ssh_hosts` and `max_concurrent_agents_per_host`; `RunAttempt`, `RetryEntry`, and snapshot types already carry `worker_host`.
- `src/config.rs` — worker config parsing is already done; S08 should consume `worker.ssh_hosts` / `worker.max_concurrent_agents_per_host` rather than introducing new config fields.
- `src/orchestrator.rs` — retry scheduling already preserves `worker_host` and `workspace_path`, and `process_due_retries()` already feeds them back into `dispatch_issue(...)`. This is the right seam for host preference on retry.
- `src/orchestrator.rs` — **missing piece:** there is currently no `select_worker_host` or per-host capacity logic at all. New dispatches currently enter `RunAttempt { worker_host: None }`.
- `src/orchestrator.rs` — `execute_worker_attempt()` is local-only today: local workspace creation, local hooks, local `app_server::start_session(...)`.
- `src/codex/app_server.rs` — the shared value to preserve. Handshake, event parsing, approvals, tool calls, token accounting, and shutdown are already correct. S08 should factor launch transport without duplicating `run_turn()`.
- `src/codex/app_server.rs` — `validate_workspace_cwd()` canonicalizes against a local root; this is incompatible with spec Appendix A when the workspace path only exists remotely.
- `src/workspace.rs` — all workspace lifecycle helpers are local filesystem operations plus local `sh -lc` hooks. They cannot be reused unchanged for remote workers.
- `src/lib.rs` — no `pub mod ssh;` exists yet. `src/ssh.rs` is not present.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/ssh.ex` — authoritative reference for ssh command construction, `-T`, `-F`, `-p`, target parsing, and shell escaping.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/codex/app_server.ex` — authoritative reference for the remote-launch command shape: `cd <workspace> && exec <codex.command>` over SSH, while keeping the app-server protocol unchanged.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/orchestrator.ex` — authoritative reference for host-pool selection and capacity behavior.

## Constraints

- **Appendix A semantic constraint:** `workspace.root` is interpreted on the **remote** host. Local canonicalization is insufficient for remote runs.
- **Single-authority orchestrator constraint (D002):** host selection, retries, and slot accounting must remain orchestrator-owned; do not push scheduling authority into workers.
- **Transport constraint from S05:** the Codex protocol is line-delimited JSON over stdio. SSH is only a transport swap; framing behavior must stay line-safe.
- **Current API constraint:** `app_server::start_session(...)` currently requires `workspace_path: &Path` and `workspace_root: &Path`. That signature assumes local filesystem visibility and will need either a transport-specific variant or a more abstract workspace identity input.
- **Observability constraint:** remote runs must continue surfacing `worker_host` in `RunAttempt`, retry entries, and runtime events so S07 APIs remain useful.
- **Tokio process constraint:** using `tokio::process::Command` with piped stdio remains the right model for both local and ssh-backed launches; the `ssh` client itself becomes the child process and stdout can still be consumed through `BufReader`/`AsyncBufReadExt`.

## Common Pitfalls

- **Treating ssh as “just another codex command”** — That misses the bigger issue: remote workspace creation and hooks are also remote concerns. Fix by designing both a remote workspace path and a remote app-server launch path.
- **Using local path canonicalization for remote workspaces** — `validate_workspace_cwd()` will reject or mis-handle remote-only paths. Fix by separating local safety checks from remote command/path validation.
- **Silently falling back to local execution when ssh hosts are full** — Appendix A says dispatch should wait, not quietly switch execution mode. Fix by returning “no worker capacity” and leaving the issue undispatched/retryable.
- **Losing host affinity on retries** — continuation and preferred-host semantics are core S08 scope. Fix by using existing `RetryEntry.worker_host` / `RunAttempt.worker_host` as the source of truth during host selection.
- **Getting ssh target parsing wrong** — `host:port` and bracketed IPv6 cases are easy footguns. Fix by porting the Elixir parsing rules and test cases directly.
- **Duplicating the whole turn loop for ssh** — that would create two protocol implementations. Fix by extracting a launch seam and sharing the existing event/timeout/tool-call pipeline.

## Open Risks

- The current Rust workspace module has no remote mode at all, so S08 is broader than the roadmap’s `ssh.rs` bullet suggests.
- If host-selection logic is bolted on only in retry paths, first-run dispatches will still default to `worker_host: None` and violate per-host caps.
- Startup-failure vs post-side-effect failure semantics are subtle: Appendix A allows failover before meaningful start, but after side effects a different host should count as a new attempt. The current runtime has no explicit “meaningfully started on host X” marker beyond observed session/workspace diagnostics.
- If the `ssh` binary is missing, current error taxonomy has no dedicated ssh variant; S08 must decide whether to add explicit errors or use `Other(...)` consistently.
- Remote cleanup correctness will be easy to under-test unless S08 adds fake-ssh integration tests similar to the Elixir suite.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Tokio / async Rust | `wshobson/agents@rust-async-patterns` | available via `npx skills add wshobson/agents@rust-async-patterns` |
| Tokio process / concurrency | `geoffjay/claude-plugins@tokio-patterns` | available via `npx skills add geoffjay/claude-plugins@tokio-patterns` |
| SSH automation | `openhands/skills@ssh` | available via `npx skills add openhands/skills@ssh` |
| SSH automation | `dicklesworthstone/agent_flywheel_clawdbot_skills_and_integrations@ssh` | available via `npx skills add dicklesworthstone/agent_flywheel_clawdbot_skills_and_integrations@ssh` |
| Rust async testing | `d-o-hub/rust-self-learning-memory@rust-async-testing` | available via `npx skills add d-o-hub/rust-self-learning-memory@rust-async-testing` |

## Suggested Verification Targets for S08

- `tests/ssh_tests.rs`
  - parses `host:port`, `user@host:port`, bracketed IPv6, unbracketed IPv6
  - honors `SYMPHONY_SSH_CONFIG`
  - builds `ssh -T ... bash -lc ...` correctly
  - returns a deterministic error when `ssh` is unavailable
- `tests/codex_tests.rs` additions
  - app-server launches over ssh and preserves the same handshake/turn protocol
  - remote `cwd` / launch command uses `cd <workspace> && exec <codex.command>`
- `tests/orchestrator_tests.rs` additions
  - first dispatch chooses a host from the pool
  - shared per-host cap is enforced across configured hosts
  - preferred host is kept when still under cap
  - all-hosts-full returns no dispatch instead of local fallback
  - continuation retry preserves host/workspace
  - failure retry prefers previous host when available
- `tests/workspace_*` additions
  - remote workspace prepare/create/hook/remove flow runs over ssh and preserves remote path identity

## Sources

- Appendix A defines the actual remote-worker contract, especially remote `workspace.root`, host-pool semantics, no silent local fallback, and host affinity expectations (source: `/Volumes/EVO/kata/openai-symphony/SPEC.md`, Appendix A).
- Current Rust domain/config already include worker-host configuration and diagnostics fields, so S08 should extend rather than redesign state (source: `src/domain.rs`, `src/config.rs`).
- Current Rust orchestrator already preserves host context through retries/completions, but has no host-selection or per-host-cap logic yet (source: `src/orchestrator.rs`).
- Current Rust app-server implementation is reusable above the transport boundary, but its startup validation assumes local filesystem visibility (source: `src/codex/app_server.rs`).
- Elixir reference shows the ssh helper behavior to port: `ssh -T`, optional `-F`, `host:port` parsing, bracketed IPv6 handling, and remote shell escaping (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/ssh.ex`, `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/ssh_test.exs`).
- Elixir reference shows remote app-server launch should be `cd <workspace> && exec <codex.command>` over SSH while keeping the same session lifecycle (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/codex/app_server.ex`, `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/app_server_test.exs`).
- Elixir reference shows remote workspace lifecycle and hooks are ssh-backed, not local filesystem operations (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/workspace.ex`, `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/workspace_and_config_test.exs`).
- Elixir orchestrator tests define the exact host-selection behaviors to preserve in Rust (source: `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/core_test.exs`).
- Tokio docs confirm `tokio::process::Command` + piped stdio + `BufReader`/`AsyncBufReadExt` remains the right primitive for consuming child output, including an `ssh` client process used as a transport wrapper (source: Context7 Tokio docs, `/websites/rs_tokio_tokio`, query: `process::Command Child kill wait_with_output piped stdin stdout async BufReader lines`).
