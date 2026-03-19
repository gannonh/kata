# S08: SSH Remote Worker Extension — UAT

**Milestone:** M001
**Written:** 2026-03-19

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All S08 behaviors are encapsulated in 15 deterministic unit/integration tests using a fake-ssh binary. No real SSH host is required to prove arg construction, host-selection logic, dispatch wiring, or remote workspace validation. Human experience (live SSH to a real remote machine) is deferred to operational verification outside M001.

## Preconditions

- `cargo build` succeeds with zero errors and zero warnings
- A shell (bash/sh) is available for the fake-ssh script in `test_fake_ssh_launch`
- `SYMPHONY_SSH_CONFIG` env var is **unset** by default (tests manage it explicitly)

## Smoke Test

```bash
cargo test --test ssh_tests
# Expected: 15 passed; 0 failed
```

## Test Cases

### 1. SSH arg construction — host:port parsing

```bash
cargo test --test ssh_tests test_parse_target
```

- `test_parse_target_plain_host` — `"myhost"` → port 22, destination `"myhost"`
- `test_parse_target_host_port` — `"myhost:2222"` → port 2222, destination `"myhost"`
- `test_parse_target_user_at_host_port` — `"user@host:2200"` → port 2200, destination `"user@host"`
- `test_parse_target_ipv6_bracketed` — `"[::1]:2222"` → port 2222, destination `"[::1]"`
- `test_parse_target_ipv6_unbracketed` — `"::1"` → port 22, destination `"::1"` (treated as bare hostname)

**Expected:** 5 passed; 0 failed

### 2. Shell escaping

```bash
cargo test --test ssh_tests test_shell_escape
```

- `test_shell_escape_plain` — no special chars → single-quoted string unchanged
- `test_shell_escape_with_single_quote` — embedded `'` → POSIX `'"'"'` substitution

**Expected:** 2 passed; 0 failed

### 3. SSH args vector construction

```bash
cargo test --test ssh_tests test_ssh_args
```

- `test_ssh_args_no_config` — no `SYMPHONY_SSH_CONFIG` → no `-F` flag; args contain `-T -p 22 myhost bash -lc ...`
- `test_ssh_args_with_config` — `SYMPHONY_SSH_CONFIG=/tmp/ssh.conf` → `-F /tmp/ssh.conf` present in args

**Expected:** 2 passed; 0 failed

### 4. Fake SSH subprocess launch

```bash
cargo test --test ssh_tests test_fake_ssh_launch
```

- Writes a temp shell script that appends its argv to a trace file
- Prepends the script's dir to `PATH`
- Spawns via `SshRunner::start_process`
- Asserts trace file contains `-T`, `-p`, `2222`, `myhost`, `echo ready`

**Expected:** 1 passed; 0 failed

### 5. Remote workspace validation

```bash
cargo test --test ssh_tests test_remote_workspace_validation
```

- Absolute path (`/workspace/issue-123`) → `Ok`
- Relative path (`workspace/issue-123`) → `Err(InvalidWorkspaceCwd)`
- Empty string → `Err(InvalidWorkspaceCwd)`

**Expected:** 1 passed; 0 failed

### 6. Host-selection logic

```bash
cargo test --test ssh_tests test_select_worker_host
```

- `test_select_worker_host_local_mode` — empty `ssh_hosts` → `WorkerHostSelection::Local`
- `test_select_worker_host_prefers_prior_host` — preferred host under cap → `Remote("preferred-host")`
- `test_select_worker_host_skips_full_host` — preferred host at cap → `Remote("other-host")` (least loaded)
- `test_select_worker_host_blocks_when_all_full` — all hosts at cap → `WorkerHostSelection::NoneAvailable`

**Expected:** 4 passed; 0 failed

## Edge Cases

### IPv6 unbracketed address treated as bare hostname

- Input: `"::1"` (no brackets, no port suffix)
- Expected: `parse_target` returns `("::1", 22)` — treated as bare hostname, default port

### SSH config path injection is environment-driven

- `SYMPHONY_SSH_CONFIG` not set → no `-F` flag emitted
- `SYMPHONY_SSH_CONFIG=/path/to/config` → `-F /path/to/config` is the first two args in the vector

### Pool exhaustion does not fall back to local mode

- All SSH hosts at cap → `NoneAvailable` (not `Local`)
- Dispatch skips the issue and logs `event="ssh_pool_exhausted"`

## Failure Signals

- Any `ssh_tests` failure indicates a regression in SSH arg construction, host-selection, or subprocess launch wiring
- `cargo build` warning about unused imports/variables suggests a deviation from the clean-compile contract
- `test_fake_ssh_launch` flaky failures (intermittent) indicate the 500ms sleep is insufficient on the current machine — increase to 1000ms

## Requirements Proved By This UAT

- R011 (SSH Remote Worker Extension) — All 15 ssh_tests prove: SSH subprocess launch via `SshRunner::start_process`, SSH arg construction with POSIX shell escaping, host:port parsing for all target formats (plain, host:port, user@host:port, IPv6 bracketed/unbracketed), SYMPHONY_SSH_CONFIG injection, per-host concurrency cap enforcement, host-preference on retry, pool-exhaustion blocking with no silent fallback, local-mode when ssh_hosts is empty, and remote workspace absolute path validation.

## Not Proven By This UAT

- Real SSH connection to an actual remote host (authentication, key forwarding, network error handling)
- End-to-end remote agent execution (Codex session on remote machine streaming events back over SSH stdio)
- Pool exhaustion rescheduling behavior under sustained load (retry queue behavior when pool repeatedly exhausted)
- SSH connection timeout behavior (OS TCP timeout applies; no Symphony-level connection timeout)
- Advanced SSH options (ProxyJump, ControlMaster, IdentityFile beyond SYMPHONY_SSH_CONFIG)

## Notes for Tester

- The fake-ssh test (`test_fake_ssh_launch`) depends on a 500ms sleep; on slow CI machines this may be marginal. If it flakes, increase to 1000ms.
- `SYMPHONY_SSH_CONFIG` env var must be unset or explicitly managed in test environments to avoid cross-test pollution in `test_ssh_args_no_config`.
- Host-selection tests use the public `select_worker_host` free function directly — no Orchestrator construction needed. These are pure unit tests with no I/O.
