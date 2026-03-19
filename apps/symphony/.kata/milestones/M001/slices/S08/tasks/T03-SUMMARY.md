---
id: T03
parent: S08
milestone: M001
provides:
  - start_session with worker_host Option<&str> branch (local vs SSH dispatch)
  - Remote workspace validation via ssh::validate_remote_workspace_cwd in SSH path
  - All 32 codex_tests updated to pass None as worker_host
key_files:
  - src/codex/app_server.rs
  - src/orchestrator.rs
  - tests/codex_tests.rs
key_decisions:
  - validate_remote_workspace_cwd remains in ssh.rs (added in T02); app_server.rs calls it via crate::ssh::validate_remote_workspace_cwd rather than duplicating
  - worker_host parameter added as the last parameter of start_session to minimise diff; None preserves all existing behaviour exactly
patterns_established:
  - match worker_host { None => local bash path, Some(host) => SshRunner::start_process } inside start_session cleanly separates dispatch strategies
observability_surfaces:
  - tracing::info!(worker_host, issue_id, cmd) on remote SSH spawn path
  - SymphonyError::SshLaunchFailed propagates from remote spawn failure
  - SymphonyError::InvalidWorkspaceCwd for empty/relative remote paths
duration: ~15 min
verification_result: passed
completed_at: 2026-03-19
blocker_discovered: false
---

# T03: Add SSH transport branch to `app_server::start_session` and remote workspace validation

**Wired `SshRunner::start_process` into `start_session` via a `worker_host: Option<&str>` branch; all 32 codex_tests pass with `None`, and `test_remote_workspace_validation` passes.**

## What Happened

Added `use crate::ssh::SshRunner` to `app_server.rs` and split `start_session`'s Step 1+2 into a `match worker_host` block:

- `None` (local): unchanged `validate_workspace_cwd` + `tokio::process::Command::new("bash")` path
- `Some(host)` (remote): calls `crate::ssh::validate_remote_workspace_cwd`, then `SshRunner::start_process(host, &cmd_str).await?`, and logs `tracing::info!(worker_host, issue_id, cmd)`. No `current_dir` set (path lives on the remote end).

The remaining function body (pid extraction, stdin/stdout take, handshake, SessionHandle construction) is identical for both paths.

Updated the single `start_session` call in `orchestrator.rs` to pass `None` as the new final argument.

Updated all 33 `start_session` call sites in `tests/codex_tests.rs` to pass `None`. Used `sed` for the bulk of them (pattern `root_dir.path())`) and manual edits for the two that didn't match.

`validate_remote_workspace_cwd` was already implemented in `src/ssh.rs` during T02 and re-exported from `crate::ssh`; no duplication needed.

## Verification

```
cargo build          → zero warnings, zero errors
cargo test --test codex_tests               → 32 passed, 0 failed
cargo test --test ssh_tests test_remote_workspace_validation → 1 passed
```

## Diagnostics

- `tracing::info!` on remote spawn includes `worker_host` and `cmd` fields — grep for `Spawning remote Codex via SSH` in structured logs.
- `SymphonyError::SshLaunchFailed(String)` surfaces host+OS error in the error chain for remote dispatch failures.
- `SymphonyError::InvalidWorkspaceCwd` for empty or relative remote paths.

## Deviations

- `validate_remote_workspace_cwd` not duplicated into `app_server.rs` — it already existed in `ssh.rs` from T02 with the correct semantics; the plan's Step 1 was rendered moot by T02 work.

## Known Issues

none

## Files Created/Modified

- `src/codex/app_server.rs` — `start_session` gains `worker_host: Option<&str>` param; SSH/local dispatch branch; `use crate::ssh::SshRunner`
- `src/orchestrator.rs` — `start_session` call updated to pass `None`
- `tests/codex_tests.rs` — all 33 call sites updated to pass `None`
