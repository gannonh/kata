---
estimated_steps: 5
estimated_files: 7
---

# T02: Implement SSH helper and remote workspace lifecycle

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Build the transport and workspace foundation for remote execution by adding a dedicated SSH helper plus remote workspace prepare/hook/remove flows. This closes the biggest Appendix A gap: `workspace.root` must be interpreted on the remote host, not locally.

## Steps

1. Add `src/ssh.rs` with Elixir-parity target parsing (`host:port`, `user@host:port`, bracketed IPv6, config-file support), shell escaping, and helpers that build `ssh -T ... bash -lc ...` commands.
2. Expose a launch helper that returns a `tokio::process::Command`/child-ready configuration for SSH-backed subprocesses and a deterministic error when `ssh` is unavailable.
3. Extend `src/workspace.rs` with remote workspace preparation and cleanup helpers that compose SSH commands against remote `workspace.root`, preserving sanitized issue-derived workspace names.
4. Add remote hook execution paths that run `after_create`, `before_run`, `after_run`, and `before_remove` on the remote host with the same timeout/failure semantics expected by the existing local helpers.
5. Make `tests/ssh_tests.rs` and `tests/workspace_tests.rs` pass while preserving all existing local workspace behaviors.

## Must-Haves

- [ ] SSH parsing matches the Appendix A / Elixir cases, including port extraction and bracketed IPv6 support
- [ ] `SYMPHONY_SSH_CONFIG` is honored in SSH command construction without leaking file contents in diagnostics
- [ ] Remote workspace creation and removal use SSH commands against remote `workspace.root`, not local canonicalization
- [ ] Remote hooks preserve timeout/error semantics comparable to local hook execution
- [ ] Existing local workspace tests remain green alongside the new remote-path behavior

## Verification

- `cargo test --test ssh_tests --test workspace_tests`
- Run any targeted existing local workspace tests needed to confirm no regression in local lifecycle behavior

## Observability Impact

- Signals added/changed: Stable SSH launch/build errors and remote hook failure surfaces become explicit instead of being inferred from generic local path failures.
- How a future agent inspects this: SSH helper tests show exact command shape; workspace tests show captured remote commands and timeout/failure behavior.
- Failure state exposed: Missing SSH binary, malformed target parsing, and remote hook/cleanup failures become attributable to named helper paths.

## Inputs

- `src/workspace.rs` — existing local lifecycle helpers and timeout enforcement to mirror
- `src/path_safety.rs` — identifier sanitization rules that remote workspace identity must preserve
- `.kata/milestones/M001/slices/S08/S08-RESEARCH.md` — remote root semantics and Elixir reference guidance
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/ssh.ex` — authoritative SSH helper behavior already summarized in research
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/workspace.ex` — authoritative remote workspace command pattern already summarized in research

## Expected Output

- `src/ssh.rs` — production SSH helper and command-builder module
- `src/workspace.rs` — remote workspace prepare/hook/remove flows
- `tests/ssh_tests.rs` — passing SSH helper contract suite
- `tests/workspace_tests.rs` — passing remote workspace lifecycle assertions
- `src/lib.rs` and any touched domain/path files — exported/supporting surfaces for remote execution
