# S08: SSH Remote Worker Extension — Research

**Date:** 2026-03-19

## Summary

S08 delivers the SSH remote worker extension (Spec Appendix A, R011). The scope is narrower than it first appears: the orchestrator already has full `worker_host: Option<String>` plumbing in `RunAttempt`, `RetryEntry`, `RetrySnapshotEntry`, and all lifecycle events — these were stubbed during S06 but never wired to actual SSH dispatch. The work in S08 is:

1. **`src/ssh.rs`** — a thin wrapper around the `ssh` CLI binary that constructs `tokio::process::Command` arguments, handles `host:port` parsing (including `user@host:port`, bracketed IPv6 `[::1]:2222`), shell-escapes the remote command, and optionally injects `SYMPHONY_SSH_CONFIG` via `-F`. This directly mirrors the Elixir `SSH` module (~100 LOC).

2. **`src/orchestrator.rs` — host selection logic** — `select_worker_host()` must be implemented: pick from `worker.ssh_hosts`, prefer the prior host on retries, enforce `max_concurrent_agents_per_host`, return `None` for local-only mode and `:no_worker_capacity` equivalent when all hosts are full (blocking dispatch, not falling back to local).

3. **`src/codex/app_server.rs` — SSH transport variant** — `start_session` currently hard-codes `bash -lc` as a local subprocess. When a `worker_host: Option<&str>` is provided, it must instead spawn `ssh <args> bash -lc <command>` as the subprocess. The session handle and all downstream turn streaming code are identical — only the spawn step changes.

The Elixir reference is authoritative and complete. The Rust port is a direct behavioral match. No new crates are required; `tokio::process::Command` already handles the SSH launch the same way it handles local Codex. The only non-trivial area is the host selection algorithm (prefer-host-on-retry, least-loaded fallback, full-pool blocking) which has clear Elixir pseudocode and three dedicated Elixir core_test.exs cases.

## Recommendation

**Port the Elixir SSH and host-selection logic directly, adapted to Rust idioms.**

- `src/ssh.rs` — implement `ssh_args(host, command)` + `shell_escape()` + `parse_target()` as private helpers; expose `SshRunner::start_process(host: &str, command: &str) -> Result<Child>` that uses `tokio::process::Command`.
- `src/codex/app_server.rs` — add `worker_host: Option<&str>` to `start_session` signature; branch on `Some(host)` to build SSH command via `ssh_args`, `None` for existing local `bash -lc` path.
- `src/orchestrator.rs` — implement `select_worker_host(&self, preferred: Option<&str>) -> Option<WorkerHostSelection>` where `WorkerHostSelection` is either `Local`, `Remote(String)`, or `NoneAvailable`. Wire it into the existing `dispatch_issue` path which already tracks `worker_host` in `RunAttempt`.

Tests: use a fake `ssh` binary on PATH (same pattern Elixir uses) — write a shell script that traces its arguments to a file, then assert on the trace. For host-selection, use pure unit tests on orchestrator state (same approach as S06 orchestrator tests).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| SSH subprocess I/O | `tokio::process::Command` (already used by `app_server.rs`) | SSH is just another subprocess; same piped stdio pattern works |
| Shell escaping | Implement `shell_escape()` matching Elixir's `"'" <> replace("'", "'\"'\"'") <> "'"` | Standard POSIX shell-escape; no crate needed for a single-quote wrapper |
| Host:port parsing | Implement `parse_target()` matching Elixir regex `~r/^(.*):(\d+)$/` with IPv6 bracketing guard | ~15 lines; Elixir reference is a direct model |
| Fake SSH binary for tests | Shell script installed to a temp dir on PATH (Elixir ssh_test.exs pattern) | Proved in Elixir; arg-trace file gives deterministic verification without needing a real SSH daemon |

## Existing Code and Patterns

- `src/codex/app_server.rs:start_session` — the local subprocess spawn lives at lines 122–200. The SSH branch needs to replace lines 144–157 (the `tokio::process::Command::new("bash").args(["-lc", &cmd_str])` block) with SSH command construction when `worker_host` is `Some`. Everything else (stdin/stdout piping, handshake, turn streaming) is unchanged.
- `src/orchestrator.rs:RunAttempt` — already has `pub worker_host: Option<String>` (line 196); `RetryEntry` and `RetrySnapshotEntry` also carry `worker_host`. S08 just needs to populate these fields from the host-selection result.
- `src/orchestrator.rs` dispatch path (around line 695) — `worker_host: None` is hard-coded in the `RunAttempt` insert. S08 replaces this with `select_worker_host()` output.
- `src/domain.rs:WorkerConfig` (lines 200–205) — `ssh_hosts: Vec<String>` and `max_concurrent_agents_per_host: Option<u32>` are already defined and populated by config parsing.
- Elixir `select_worker_host` (orchestrator.ex ~973–1010) — full reference: filter hosts by per-host cap, prefer prior host if available, fall back to least-loaded, return `:no_worker_capacity` when pool is exhausted.
- Elixir `candidate_worker_hosts` (agent_runner.ex ~191–210) — builds retry-ordered host list: `[preferred_host] ++ rest_of_configured_hosts`. The Rust equivalent is the `select_worker_host` + `worker_host` propagation in `RetryEntry`.

## Constraints

- `worker_host` must be propagated from `select_worker_host` → `RunAttempt` → `RetryEntry` on failure/continuation → `select_worker_host` on retry dispatch. This chain already has all the fields; the missing piece is the `select_worker_host` function itself and wiring it into dispatch.
- When `ssh_hosts` is empty, dispatch must use `worker_host: None` (local mode); `start_session` must keep the local `bash -lc` path. No regressions to existing local dispatch.
- When `ssh_hosts` is non-empty and all hosts are at capacity, dispatch must be blocked (the orchestrator's `dispatch_issue` returns early, same as when global concurrency is full). Must NOT fall back to local execution silently.
- `SYMPHONY_SSH_CONFIG` env var: if set, inject `-F <path>` into ssh args. Read from `std::env::var("SYMPHONY_SSH_CONFIG")` at call time (not at startup), matching Elixir behavior.
- `start_session` signature change: adding `worker_host: Option<&str>` is a breaking change to the existing public API. All call sites in `orchestrator.rs` must be updated.
- The Elixir `start_port` used Erlang `Port` with `:line` option for line-buffered reads; the Rust version already uses `BufReader::lines()` which is equivalent — no buffering changes needed for SSH.

## Common Pitfalls

- **`host:port` parsing regex must handle `user@host:port` correctly** — `user@127.0.0.1:2200` → `-p 2200 user@127.0.0.1`. The regex `^(.*):(\d+)$` captures everything left of the last `:digit+` suffix, so `user@host` is preserved. Bracketed IPv6 `[::1]:2222` also works because `[::1]` doesn't fail `valid_port_destination?` (it contains `[` and `]`). Unbracketed `::1:2200` must NOT split — `valid_port_destination?("")` is false, so it's treated as a bare hostname.
- **stderr must merge into stdout on SSH subprocess** — The Elixir `start_port` uses `:stderr_to_stdout`. The local `app_server.rs` drains stderr with a fire-and-forget task. For the SSH subprocess, stderr is mixed (SSH connection errors appear on stderr, not stdout). The same drain-task pattern works; just ensure `Stdio::piped()` on stderr and spawn a drain task as before.
- **Do not re-validate `workspace_cwd` the same way for remote hosts** — `validate_workspace_cwd` calls `path_safety::canonicalize` and `expand_path_no_symlinks` which resolve paths on the local FS. These are meaningless for a remote workspace path string. The Elixir reference validates differently for remote: it just checks the path is non-empty and is absolute. S08 must add a `validate_remote_workspace_cwd(workspace: &str) -> Result<String>` branch (or skip local canonicalization and just validate the string is non-empty and absolute).
- **Least-loaded host selection needs index as tiebreaker** — Elixir uses `Enum.min_by(fn {host, index} -> {count, index} end)` to get deterministic ordering when two hosts have equal load. In Rust, `Iterator::min_by_key` on `(count, index)` tuples achieves the same determinism.
- **Stale retry token fire still fires even when preferred host is full** — The orchestrator checks host capacity at dispatch time, not at retry-schedule time. When a retry fires and the preferred host is full but another host is available, use the alternative. If all are full, re-queue the retry (or defer dispatch until next tick).

## Open Risks

- **SSH process inherits orchestrator environment** — `tokio::process::Command` inherits the parent env by default. If `SYMPHONY_SSH_CONFIG` is set in the orchestrator's env, it's injected. But if other env vars interfere with SSH behavior (e.g., `SSH_AUTH_SOCK`, `HOME`), tests may be environment-sensitive. Fake-ssh tests should isolate `PATH` but leave other env vars intact (matching Elixir pattern).
- **Remote workspace path validation** — The spec says `workspace.root` is interpreted on the remote host. S08 cannot canonicalize or contain-check a remote path. The correct behavior (matching Elixir) is: skip local canonicalization for remote paths, validate only that the path is non-empty and is absolute. This is a behavioral deviation from the local path for which tests must be explicit.
- **No integration test with real SSH daemon** — Like Elixir, we'll use a fake `ssh` script. The SSH framing / JSON-RPC streaming over real SSH is tested by the Elixir live_e2e test but not by unit tests. S08 will have a coverage gap on real SSH framing; the spec conformance sweep (S09) can note this as an operational-only verification.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| SSH subprocess (Rust) | none needed | `tokio::process::Command` is sufficient; no MCP/external skill required |

## Sources

- Elixir `SSH` module: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/ssh.ex` — authoritative host:port parsing, shell_escape, start_port, SYMPHONY_SSH_CONFIG injection
- Elixir `AgentRunner` module: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/agent_runner.ex` — candidate_worker_hosts ordering (prefer prior host, then remaining configured hosts)
- Elixir `Orchestrator` module (select_worker_host): `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/orchestrator.ex` lines 973–1010 — pool selection, per-host cap enforcement, least-loaded tiebreaker
- Elixir `AppServer` module (SSH branch): `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/codex/app_server.ex` lines 212–240 — `start_port` SSH vs local branch
- Elixir `ssh_test.exs`: `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/ssh_test.exs` — 8 test cases for SSH module (fake-ssh-on-PATH pattern, IPv6 bracketing, user@host:port, config injection)
- Elixir `core_test.exs` (select_worker_host tests): `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/core_test.exs` lines 706–751 — 3 host-selection tests (skip full host, no_worker_capacity, prefer preferred host with capacity)
- Spec Appendix A: `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 2122–2175 — authoritative behavioral contract for SSH extension
- Spec §5.3 (worker config): `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 562–565 — `ssh_hosts`, `max_concurrent_agents_per_host` config shape
- Existing `src/domain.rs:WorkerConfig` — `ssh_hosts: Vec<String>`, `max_concurrent_agents_per_host: Option<u32>` already defined
- Existing `src/orchestrator.rs` — `worker_host: Option<String>` already in `RunAttempt`, `RetryEntry`, `RetrySnapshotEntry`; dispatch wiring at line 695 hard-codes `None`
