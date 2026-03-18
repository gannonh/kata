---
id: T03
parent: S04
milestone: M001
provides:
  - Verified workspace module with hook execution (ensure_workspace, validate_workspace_path, run_hook, remove_workspace)
  - All 28 slice-level integration tests passing
  - Full slice verification complete — all must-haves confirmed
key_files:
  - src/workspace.rs
  - src/lib.rs
  - tests/workspace_prompt_tests.rs
key_decisions:
  - No new decisions — workspace module was implemented ahead of schedule in T01 with all behavioral contracts already met
patterns_established:
  - No new patterns — all patterns (sh -lc hook execution, thread-based timeout with SIGKILL, segment-by-segment canonicalize) were established in T01
observability_surfaces:
  - "SymphonyError::WorkspaceHookFailed { hook, status } — verified in test_workspace_after_create_hook_failure"
  - "SymphonyError::WorkspaceHookTimeout { hook, timeout_ms } — verified in test_workspace_after_create_hook_timeout"
  - "SymphonyError::WorkspaceOutsideRoot { workspace, root } — verified in test_workspace_rejects_symlink_escape and test_workspace_rejects_root_itself"
  - "tracing::info! on hook start, tracing::warn! on hook failure/timeout with structured fields"
duration: 5m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Verify workspace module with hook execution — final slice verification

**Workspace module already implemented in T01; T03 confirmed all 28 integration tests pass and full slice contract is met with zero build warnings.**

## What Happened

The workspace module (`src/workspace.rs`) was implemented ahead of schedule during T01 because it was needed for test compilation and the implementation was straightforward. T03's nominal scope (implement workspace module) was already complete.

T03 therefore served as the final slice verification gate:

1. Confirmed all 28 `workspace_prompt_tests` pass (6 path_safety + 12 workspace + 3 hook lifecycle + 7 prompt builder)
2. Confirmed `cargo build` produces zero errors and zero warnings
3. Confirmed full test suite (111 tests across all modules) passes
4. Verified observability: structured error variants carry hook name + exit status, tracing spans emit on hook start/failure/timeout

The workspace module provides:
- `ensure_workspace(identifier, config, hooks)` — sanitize id, compute path, canonicalize, validate containment, create/reuse dir, run after_create hook
- `validate_workspace_path(workspace, root)` — three-way check (equals root, starts_with, symlink escape)
- `run_hook(name, command, workspace, timeout_ms)` — sh -lc with cwd, thread-based timeout watchdog, SIGKILL on timeout, 2KB output truncation
- `run_before_run_hook` / `run_after_run_hook` (failure ignored) / `remove_workspace` with before_remove hook

## Verification

**Slice-level verification (all must pass — this is the final task):**

- ✅ `cargo test --test workspace_prompt_tests` — 28/28 passed
  - Path Safety: 6/6
  - Workspace Manager: 12/12
  - Hook Lifecycle: 3/3
  - Prompt Builder: 7/7
- ✅ Observability check: `test_workspace_after_create_hook_failure` verifies error contains hook name ("after_create") and exit status (42)
- ✅ `cargo build` — zero errors, zero warnings
- ✅ `cargo test` — 111 total tests passed (18 unit + 13 config + 33 linear + 19 workflow + 28 workspace_prompt)

## Diagnostics

- `SymphonyError::WorkspaceHookFailed { hook, status }` — match on hook name + exit code
- `SymphonyError::WorkspaceHookTimeout { hook, timeout_ms }` — match on hook name + configured timeout
- `SymphonyError::WorkspaceOutsideRoot { workspace, root }` — match on containment failure paths
- `tracing::info!` emitted on hook start with hook name and workspace path
- `tracing::warn!` emitted on hook failure (with exit status + truncated output) and timeout (with timeout_ms)
- Hook output truncated to 2KB boundary for safe logging

## Deviations

Workspace module was implemented in T01 instead of T03. T03 became a verification-only task confirming the full slice contract. No behavioral deviations.

## Known Issues

None.

## Files Created/Modified

- `src/workspace.rs` — Full workspace manager (250 lines) with hook execution, path validation, timeout enforcement (implemented in T01, verified in T03)
- `tests/workspace_prompt_tests.rs` — 28 integration tests covering all slice must-haves (created in T01, all passing)
- `src/lib.rs` — Module registrations for path_safety, prompt_builder, workspace (done in T01)
