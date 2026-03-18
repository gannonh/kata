---
id: S04
parent: M001
milestone: M001
provides:
  - path_safety module with sanitize_identifier and segment-by-segment canonicalize
  - workspace module with ensure_workspace, validate_workspace_path, run_hook with timeout, remove_workspace
  - prompt_builder module with render_prompt using strict Liquid rendering
  - 28 integration tests covering all four functional areas
requires:
  - slice: S01
    provides: domain.rs Issue, BlockerRef, Workspace, WorkspaceConfig, HooksConfig; error.rs structured error variants
  - slice: S02
    provides: WorkflowDefinition.prompt_template (consumed by callers, not coupled in prompt_builder)
affects:
  - S05
  - S06
key_files:
  - src/path_safety.rs
  - src/prompt_builder.rs
  - src/workspace.rs
  - tests/workspace_prompt_tests.rs
  - src/lib.rs
key_decisions:
  - D022: extern "C" kill(2) FFI for hook timeout instead of libc crate
  - D023: liquid::to_object serde serialization for Issue → Liquid Object conversion
patterns_established:
  - Segment-by-segment symlink resolution via recursive resolve_segments (matches Elixir PathSafety.canonicalize)
  - Hook execution via sh -lc with thread-based timeout watchdog and SIGKILL cleanup
  - Output truncation to 2KB for log safety
  - validate_workspace_path three-way check (equals root, starts_with prefix, symlink escape)
  - liquid::to_object for struct → Liquid Object via serde (DateTime<Utc> → ISO 8601, Option::None → Nil, Vec → Array)
observability_surfaces:
  - tracing::info! on hook start with hook name and workspace path
  - tracing::warn! on hook failure with exit status and truncated output
  - tracing::warn! on hook timeout with timeout_ms
  - SymphonyError::WorkspaceOutsideRoot { workspace, root } for containment failures
  - SymphonyError::WorkspaceHookFailed { hook, status } for hook execution failures
  - SymphonyError::WorkspaceHookTimeout { hook, timeout_ms } for timed-out hooks
  - SymphonyError::TemplateParseError(String) for malformed templates
  - SymphonyError::TemplateRenderError(String) for unknown variables and serialization failures
drill_down_paths:
  - .kata/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S04/tasks/T02-SUMMARY.md
  - .kata/milestones/M001/slices/S04/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-17
---

# S04: Workspace Manager and Prompt Builder

**Three new modules (path_safety, workspace, prompt_builder) fully implemented with 28 integration tests — workspace creation/reuse with sanitized paths, root containment with symlink escape rejection, four lifecycle hooks with timeout enforcement, and strict Liquid prompt rendering with Issue serialization.**

## What Happened

**T01 (30m):** Created the full 28-test integration suite and implemented both `path_safety.rs` and `workspace.rs` in one pass. `path_safety` provides `sanitize_identifier` (replaces non-`[A-Za-z0-9._-]` with `_`, empty→`"issue"`) and `canonicalize` with segment-by-segment symlink resolution matching Elixir's `PathSafety.canonicalize/1`. `workspace.rs` was implemented fully in T01 (ahead of plan) because tests required real workspace behavior for compilation. It provides `ensure_workspace` (sanitize→canonicalize→validate→create/reuse→hook), `validate_workspace_path` (three-way containment check), `run_hook` (sh -lc with thread-based timeout + SIGKILL), and `remove_workspace` with before_remove hook. Prompt builder was stubbed. 21/28 tests passed.

**T02 (10m):** Replaced the prompt_builder stub with `render_prompt` using `liquid::to_object(&issue)` for serde-based Issue→Liquid Object conversion. DateTime<Utc> serializes to ISO 8601, Option::None→Nil, Vec<BlockerRef>→iterable Array. liquid-rs rejects unknown variables by default (no explicit strict mode flag needed). All 7 prompt tests passed, bringing the total to 28/28.

**T03 (5m):** Final verification gate confirming all 28 workspace_prompt_tests pass, zero build warnings, and 111 total tests across all modules. Workspace module was already complete from T01.

## Verification

- `cargo test --test workspace_prompt_tests` — 28/28 passed
  - Path Safety: 6/6 (sanitize, canonicalize, symlinks, nested symlinks)
  - Workspace Manager: 12/12 (deterministic paths, create/reuse, symlink escape, root rejection, hooks)
  - Hook Lifecycle: 3/3 (before_run fatal, after_run ignored, output truncation)
  - Prompt Builder: 7/7 (basic fields, datetime, none, blockers iterable, strict unknown, parse error, attempt)
- `cargo build` — zero errors, zero warnings
- `cargo test` — 111 total tests passed (18 unit + 13 linear + 33 workflow_config + 19 workflow_store + 28 workspace_prompt)
- Observability check: `test_workspace_after_create_hook_failure` verifies error contains hook name ("after_create") and exit status (42)
- Structured error variants carry all relevant context fields for programmatic matching

## Requirements Advanced

- R004 (Workspace Manager with Safety Invariants) — All workspace behaviors implemented: sanitized paths, root containment, symlink escape rejection, lifecycle hooks with timeout enforcement. 28 tests prove the contract.
- R007 (Prompt Builder with Strict Liquid Rendering) — `render_prompt` with Issue→Liquid serialization, strict unknown-variable rejection, DateTime/Option/Vec handling. 7 tests prove the contract.

## Requirements Validated

- R004 — `cargo test --test workspace_prompt_tests` proves: workspace creation/reuse, path sanitization (6 tests), root containment with symlink escape (3 tests), all four hooks with timeout (6 tests), cleanup (2 tests). All spec §9 workspace safety invariants covered.
- R007 — `cargo test --test workspace_prompt_tests -- test_render_prompt` proves: basic field rendering, DateTime→ISO 8601, Option→nil, Vec<BlockerRef> iteration, strict unknown variable rejection, parse error surfacing, attempt None/Some handling. All spec §12 prompt rendering requirements covered.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Workspace module implemented in T01 instead of T03.** The workspace module was needed for test compilation in T01, and implementing it fully was more efficient than creating stubs. T03 became a verification-only task. No behavioral impact — all contracts were met.

## Known Limitations

- Hook execution uses `extern "C" kill(2)` FFI for SIGKILL on timeout — this is Unix-only (not Windows-compatible). Acceptable since the target deployment is Linux/macOS.
- Prompt builder does not yet differentiate first-run vs continuation vs retry prompt semantics — those are S06 wiring concerns where the orchestrator passes the appropriate `attempt` value.

## Follow-ups

- none — all S04 scope is complete. S05/S06 will consume these modules.

## Files Created/Modified

- `src/path_safety.rs` — new: sanitize_identifier, canonicalize with segment-by-segment symlink resolution
- `src/prompt_builder.rs` — new: render_prompt with liquid::to_object and strict rendering
- `src/workspace.rs` — new: ensure_workspace, validate_workspace_path, run_hook with timeout, hook lifecycle, remove_workspace
- `tests/workspace_prompt_tests.rs` — new: 28 integration tests covering all slice must-haves
- `src/lib.rs` — registered path_safety, prompt_builder, workspace modules

## Forward Intelligence

### What the next slice should know
- `workspace.rs` provides `ensure_workspace(identifier, config, hooks) -> Result<Workspace>` where `Workspace { path, created_now }`. S05 needs the `path` for Codex subprocess cwd. S06 wires workspace creation into the dispatch loop.
- `prompt_builder::render_prompt(template, issue, attempt)` is the only prompt rendering API. S06 passes the current `WorkflowDefinition.prompt_template` from `WorkflowStore` and the issue's retry attempt count.
- `path_safety::validate_workspace_path(workspace, root)` should be called before launching any subprocess in a workspace — S05 should validate cwd before Codex launch.

### What's fragile
- Hook timeout uses `unsafe` FFI kill(2) — if hook execution logic changes, ensure the child PID is still valid before sending SIGKILL. The current implementation is safe because the PID is obtained from `Child::id()` immediately before use.
- `liquid::to_object` depends on serde derives on `Issue` and `BlockerRef`. If new fields are added to domain types without `#[serde(skip)]` or proper serialization, they will appear in templates. This is desirable but should be tested when domain types change.

### Authoritative diagnostics
- `cargo test --test workspace_prompt_tests` — the single definitive test for all S04 contracts. If it passes, S04 is healthy.
- `SymphonyError` variant matching — downstream consumers should match on `WorkspaceOutsideRoot`, `WorkspaceHookFailed`, `WorkspaceHookTimeout` for workspace errors and `TemplateParseError`, `TemplateRenderError` for prompt errors.

### What assumptions changed
- D004 (liquid strict-mode risk) was already retired in S02 — S04 confirmed that `liquid::to_object` serde path works seamlessly with strict mode. No issues encountered.
