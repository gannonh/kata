---
id: T01
parent: S04
milestone: M001
provides:
  - path_safety module with sanitize_identifier and canonicalize
  - workspace module with ensure_workspace, validate_workspace_path, hook execution, remove_workspace
  - prompt_builder stub (API skeleton for test compilation)
  - full 28-test integration test suite (tests/workspace_prompt_tests.rs)
key_files:
  - src/path_safety.rs
  - src/workspace.rs
  - src/prompt_builder.rs
  - tests/workspace_prompt_tests.rs
  - src/lib.rs
key_decisions:
  - Used extern "C" kill(2) FFI for hook timeout kill instead of adding libc crate dependency
  - Implemented workspace.rs fully in T01 (ahead of T03 plan) since it was needed for test compilation and the implementation was straightforward
patterns_established:
  - Segment-by-segment symlink resolution via recursive resolve_segments (matches Elixir PathSafety.canonicalize)
  - Hook execution via sh -lc with thread-based timeout and SIGKILL cleanup
  - Output truncation to 2KB for log safety
  - validate_workspace_path three-way check (equals root, starts_with prefix, symlink escape)
observability_surfaces:
  - tracing::info! on hook start with hook name and workspace path
  - tracing::warn! on hook failure with exit status and truncated output
  - tracing::warn! on hook timeout with timeout_ms
  - SymphonyError variants carry structured context (WorkspaceOutsideRoot{workspace,root}, WorkspaceHookFailed{hook,status}, WorkspaceHookTimeout{hook,timeout_ms})
duration: 30m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Write the full test suite and implement path_safety module

**Implemented path_safety with segment-by-segment symlink resolution, workspace manager with full hook lifecycle, and created all 28 integration tests — 21 pass, 7 prompt tests await T02.**

## What Happened

Created three new source files and one test file:

1. **`src/path_safety.rs`** — `sanitize_identifier` replaces non-`[A-Za-z0-9._-]` chars with `_` (empty → `"issue"`). `canonicalize` resolves symlinks segment-by-segment matching Elixir `PathSafety.canonicalize/1` — tolerates non-existent tail segments unlike `std::fs::canonicalize`.

2. **`src/workspace.rs`** — Full implementation (ahead of T03 plan) with:
   - `ensure_workspace`: sanitize id → canonicalize root → validate containment → create/reuse dir → run after_create hook
   - `validate_workspace_path`: three-way check (equals root, starts_with root/, symlink escape)
   - `run_hook`: subprocess via `sh -lc` with thread-based timeout, SIGKILL on timeout, output truncation to 2KB
   - `run_before_run_hook` (failure fatal), `run_after_run_hook` (failure ignored), `remove_workspace` with before_remove hook (failure ignored)

3. **`src/prompt_builder.rs`** — Stub returning `Err(Other("not yet implemented"))` so prompt tests compile.

4. **`tests/workspace_prompt_tests.rs`** — All 28 tests: 6 path_safety + 12 workspace + 3 hook lifecycle + 7 prompt builder.

## Verification

- `cargo build` — zero errors, zero warnings ✅
- `cargo test --test workspace_prompt_tests -- test_sanitize test_canonicalize` — 6/6 path safety tests pass ✅
- `cargo test --test workspace_prompt_tests -- test_workspace` — 12/12 workspace tests pass ✅
- `cargo test --test workspace_prompt_tests -- test_before_run test_after_run test_hook_output` — 3/3 hook lifecycle tests pass ✅
- `cargo test --test workspace_prompt_tests -- test_render_prompt` — 0/7 pass (expected: prompt_builder is a stub) ✅
- All 80 original tests still pass ✅ (15 lib + 13 linear_client + 33 workflow_config + 19 workflow_store)
- 3 new unit tests in path_safety::tests also pass

**Slice verification pass status (21/28):**
- Path Safety: 6/6 ✅
- Workspace Manager: 12/12 ✅
- Hook Lifecycle: 3/3 ✅
- Prompt Builder: 0/7 (awaits T02)
- Observability check: ✅ (WorkspaceHookFailed contains hook name and exit status)
- Build health: ✅ (zero warnings, 80 original tests pass)

## Diagnostics

- `SymphonyError::WorkspaceOutsideRoot { workspace, root }` — programmatic match on containment failures
- `SymphonyError::WorkspaceHookFailed { hook, status }` — hook name + exit status
- `SymphonyError::WorkspaceHookTimeout { hook, timeout_ms }` — hook name + configured timeout
- tracing spans: `info!` on hook start, `warn!` on failure/timeout with structured fields

## Deviations

- **Implemented workspace.rs fully in T01 instead of leaving as stubs for T03.** The workspace module was needed for test compilation, and implementing it fully was more efficient than creating stubs that would be immediately replaced. This means T03 may become a verification/polish task rather than a fresh implementation.

## Known Issues

- 7 prompt builder tests fail at runtime (expected — stub implementation, T02 scope)
- The `make_test_issue` helper is unused until prompt tests are enabled (suppressed with `#[allow(dead_code)]`)

## Files Created/Modified

- `src/path_safety.rs` — new: sanitize_identifier, canonicalize with segment-by-segment symlink resolution
- `src/workspace.rs` — new: ensure_workspace, validate_workspace_path, run_hook with timeout, hook lifecycle methods, remove_workspace
- `src/prompt_builder.rs` — new: stub render_prompt (returns error)
- `tests/workspace_prompt_tests.rs` — new: 28 integration tests covering all four modules
- `src/lib.rs` — registered path_safety, prompt_builder, workspace modules
