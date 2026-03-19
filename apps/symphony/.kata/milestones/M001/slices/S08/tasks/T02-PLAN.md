---
estimated_steps: 4
estimated_files: 2
---

# T02: Implement `src/ssh.rs` — arg construction, shell escape, host:port parsing, subprocess launch

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Make the SSH-module tests green by implementing the full `src/ssh.rs` logic. This is a direct port of the Elixir `SSH` module (~100 LOC). No new crates needed — `tokio::process::Command` is already used by `app_server.rs`. The host-selection tests (which depend on orchestrator state) remain red until T04.

## Steps

1. Implement `parse_target(target: &str) -> (String, u16)`:
   - Use a regex or manual suffix scan for `:<digits>$` at the end of the string.
   - Guard: if the part before the last `:` is empty or is not a valid destination (has unbalanced `[`/`]`), treat the whole string as a bare hostname at port 22.
   - IPv6 bracketed `[::1]:2222` → host=`"[::1]"`, port=2222.
   - Unbracketed `::1` (multiple colons, no port digit suffix) → host=`"::1"`, port=22.
   - `user@host:2200` → host=`"user@host"`, port=2200 (last `:digits` suffix rule picks this up naturally).

2. Implement `shell_escape(s: &str) -> String`:
   - Wrap in single quotes: `format!("'{}'", s.replace('\'', "'\"'\"'"))`
   - Matches Elixir: `"'" <> String.replace(s, "'", "'\"'\"'") <> "'"`

3. Implement `ssh_args(host: &str, command: &str) -> Vec<String>`:
   - Call `parse_target(host)` → `(host_part, port)`.
   - Start with `["-o", "StrictHostKeyChecking=no"]` (matching Elixir's default options) if the Elixir reference includes it; otherwise just `["-p", port.to_string()]`.
   - Check `std::env::var("SYMPHONY_SSH_CONFIG")` — if `Ok(path)` and non-empty, push `"-F"` then `path` before the host args.
   - Push `"-p"`, `port.to_string()`, `host_part`.
   - Push `"--"`, `"bash"`, `"-lc"`, `shell_escape(command)`.
   - Return the assembled `Vec<String>`.

4. Implement `SshRunner::start_process(host: &str, command: &str) -> Result<tokio::process::Child>`:
   - Build args via `ssh_args(host, command)`.
   - Spawn `tokio::process::Command::new("ssh").args(&args[..]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()`.
   - Map errors: `NotFound` → `SymphonyError::SshLaunchFailed(format!("ssh binary not found"))`, others → `SymphonyError::SshLaunchFailed(e.to_string())`.

## Must-Haves

- [ ] `parse_target` handles plain host, host:port, user@host:port, `[::1]:port`, and unbracketed IPv6
- [ ] `shell_escape` wraps in single quotes with embedded-quote escaping
- [ ] `ssh_args` includes `-F path` when `SYMPHONY_SSH_CONFIG` is set; omits it otherwise
- [ ] `SshRunner::start_process` spawns via `tokio::process::Command` with piped stdio
- [ ] All 10 SSH-module tests pass (parsing + shell_escape + args + fake-ssh launch)

## Verification

- `cargo test --test ssh_tests test_parse_target test_shell_escape test_ssh_args test_fake_ssh` → all pass
- `cargo build` → zero warnings

## Observability Impact

- Signals added/changed: None yet (logging added in T03 when wired into start_session)
- How a future agent inspects this: test trace file shows exact SSH args the binary would receive
- Failure state exposed: `SymphonyError::SshLaunchFailed` carries the underlying OS error string

## Inputs

- `src/ssh.rs` stubs from T01
- Elixir reference: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/ssh.ex` (parse_target, shell_escape, start_port)
- Elixir tests: `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/ssh_test.exs` (8 cases)

## Expected Output

- `src/ssh.rs` — complete implementation (~80–100 lines)
- 10 ssh_tests tests pass; 5 host-selection tests still red (orchestrator not wired yet)
