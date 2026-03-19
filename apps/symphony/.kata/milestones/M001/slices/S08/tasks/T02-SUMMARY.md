---
id: T02
parent: S08
milestone: M001
provides:
  - Full src/ssh.rs implementation (parse_target, shell_escape, ssh_args, validate_remote_workspace_cwd, SshRunner::start_process)
key_files:
  - src/ssh.rs
key_decisions:
  - Elixir reference uses -T flag (not -o StrictHostKeyChecking=no); implementation follows Elixir
  - ssh_args always emits -p even for port 22 (matching Elixir always_put_port when port is present)
  - remote_shell_command helper removed — args built directly in ssh_args to avoid dead code
  - parse_target uses rfind(':') + digit parse rather than regex; matches Elixir regex semantics exactly
patterns_established:
  - valid_port_destination() encodes the two-rule guard (non-empty, colon-only if bracketed IPv6)
observability_surfaces:
  - SymphonyError::SshLaunchFailed(String) carries OS error string or "ssh binary not found"
duration: ~20 min
verification_result: passed
completed_at: 2026-03-19
blocker_discovered: false
---

# T02: Implement `src/ssh.rs` — arg construction, shell escape, host:port parsing, subprocess launch

**Implemented full `src/ssh.rs` logic (parse_target, shell_escape, ssh_args, validate_remote_workspace_cwd, SshRunner::start_process); 11/15 SSH tests now pass, 4 host-selection stubs remain red pending T04.**

## What Happened

Ported the Elixir `SymphonyElixir.SSH` module (~80 LOC) to Rust:

1. **`parse_target`** — `rfind(':')` to locate last colon, parse trailing digits as port, then `valid_port_destination()` gate (non-empty, and if contains `:` must also contain `[`/`]`). Handles plain host, host:port, user@host:port, `[::1]:2222`, and unbracketed `::1`.

2. **`shell_escape`** — `format!("'{}'", s.replace('\'', "'\"'\"'"))` — direct Elixir translation.

3. **`ssh_args`** — emits `[-F config] -T -p <port> <destination> bash -lc <escaped_command>`. Reads `SYMPHONY_SSH_CONFIG` env var; includes `-T` (Elixir reference flag, not `-o StrictHostKeyChecking=no` as the task plan suggested).

4. **`validate_remote_workspace_cwd`** — returns `Err(InvalidWorkspaceCwd)` for empty or non-`/`-prefixed paths.

5. **`SshRunner::start_process`** — `tokio::process::Command::new("ssh")` with piped stdio; maps `NotFound` → `SshLaunchFailed("ssh binary not found")`, other errors → `SshLaunchFailed(e.to_string())`.

## Verification

```
cargo build       → zero warnings, zero errors
cargo test --test ssh_tests → 11 passed, 4 failed (select_worker_host stubs, expected)
```

Tests passing:
- `test_parse_target_plain_host` ✓
- `test_parse_target_host_port` ✓
- `test_parse_target_user_at_host_port` ✓
- `test_parse_target_ipv6_bracketed` ✓
- `test_parse_target_ipv6_unbracketed` ✓
- `test_shell_escape_plain` ✓
- `test_shell_escape_with_single_quote` ✓
- `test_ssh_args_no_config` ✓
- `test_ssh_args_with_config` ✓
- `test_fake_ssh_launch` ✓ (fake ssh script traces args; -T, -p, 2222, myhost, echo ready all present)
- `test_remote_workspace_validation` ✓

Still red (todo!() in test file, not in ssh.rs):
- `test_select_worker_host_local_mode` — orchestrator wiring in T04
- `test_select_worker_host_prefers_prior_host` — orchestrator wiring in T04
- `test_select_worker_host_skips_full_host` — orchestrator wiring in T04
- `test_select_worker_host_blocks_when_all_full` — orchestrator wiring in T04

## Diagnostics

- `cargo test --test ssh_tests` shows which SSH behaviors pass/fail
- `SymphonyError::SshLaunchFailed(String)` exposes OS error in the error chain
- Fake SSH trace file pattern: `ARGV:-T -p 2222 myhost bash -lc 'echo ready'`

## Deviations

- Task plan said args should include `-o StrictHostKeyChecking=no`; Elixir reference uses `-T` instead. Followed Elixir reference (authoritative). The `-T` flag disables pseudo-terminal allocation and is what the fake-ssh test asserts.
- `remote_shell_command` helper function was removed (unused; args built directly in `ssh_args`).

## Known Issues

None.

## Files Created/Modified

- `src/ssh.rs` — complete implementation replacing T01 stubs (~90 lines)
