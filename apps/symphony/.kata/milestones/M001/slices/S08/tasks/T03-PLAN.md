---
estimated_steps: 4
estimated_files: 2
---

# T03: Add SSH transport branch to `app_server::start_session` and remote workspace validation

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Wire `ssh.rs` into the Codex session lifecycle. `start_session` gains a `worker_host: Option<&str>` parameter. When `Some(host)`, it uses `SshRunner::start_process` to spawn the child instead of the local `bash -lc` path. Remote workspace validation skips local FS canonicalization. All existing codex_tests must remain green because the `None` path is unchanged.

## Steps

1. Add `validate_remote_workspace_cwd(workspace: &str) -> Result<String>` to `app_server.rs`:
   - Return `Err(SymphonyError::InvalidWorkspaceCwd("remote workspace path must be non-empty".into()))` if empty.
   - Return `Err(SymphonyError::InvalidWorkspaceCwd("remote workspace path must be absolute".into()))` if path doesn't start with `/`.
   - Otherwise return `Ok(workspace.to_string())`. No local FS operations.

2. Update `start_session` signature: add `worker_host: Option<&str>` after `workspace_root: &Path`.

3. In `start_session`, branch on `worker_host`:
   - `None` (local): existing `validate_workspace_cwd(workspace_path, workspace_root)?` + `tokio::process::Command::new("bash").args(["-lc", &cmd_str])...spawn()` path (unchanged).
   - `Some(host)` (remote): call `validate_remote_workspace_cwd(&workspace_path.to_string_lossy())?`; call `SshRunner::start_process(host, &cmd_str).await?` to get the child. Set `current_dir` is not needed (remote path is on the far end). Log `tracing::info!(worker_host = %host, issue_id = %issue.id, cmd = %cmd_str, "Spawning remote Codex via SSH")`.

4. Update all `start_session` call sites in `src/orchestrator.rs` to pass `worker_host: None` as the final argument (no behavioral change yet — T04 wires real values). Confirm `cargo test --test codex_tests` passes.

## Must-Haves

- [ ] `validate_remote_workspace_cwd` returns error for empty or relative path
- [ ] `start_session` with `worker_host: None` is behaviorally identical to pre-T03 (all 32 codex_tests pass)
- [ ] `start_session` with `worker_host: Some(host)` spawns via `SshRunner::start_process`
- [ ] Remote workspace validation tests in `ssh_tests` pass
- [ ] No compile errors; no regressions in existing test suites

## Verification

- `cargo test --test codex_tests` → 32 tests pass (zero regressions)
- `cargo test --test ssh_tests test_remote_workspace_validation` → passes
- `cargo build` → zero warnings

## Observability Impact

- Signals added/changed: `tracing::info!` on remote spawn with `worker_host` field; `tracing::info!` on local spawn already present; both paths now log the dispatch method
- How a future agent inspects this: structured log line at `INFO` level includes `worker_host` field for remote sessions; `OrchestratorSnapshot.running[*].worker_host` populated after T04
- Failure state exposed: `SymphonyError::SshLaunchFailed` propagates from remote spawn; `SymphonyError::InvalidWorkspaceCwd` for bad remote paths

## Inputs

- `src/codex/app_server.rs` — existing `start_session` implementation (lines 122–200)
- `src/ssh.rs` — `SshRunner::start_process` from T02
- `tests/codex_tests.rs` — 32 existing tests must remain green

## Expected Output

- `src/codex/app_server.rs` — `start_session` with `worker_host: Option<&str>` branch; `validate_remote_workspace_cwd` helper
- `src/orchestrator.rs` — all `start_session` call sites updated to pass `worker_host: None`
- `tests/ssh_tests.rs` — remote workspace validation tests pass; total passing count now 11–12
