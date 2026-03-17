# S04: Workspace Manager and Prompt Builder — UAT

**Milestone:** M001
**Written:** 2026-03-17

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All behaviors are pure-function or filesystem-level operations testable via cargo test with real tempdir/subprocess execution. No running service, no network, no human-visible UI. The 28 integration tests exercise real filesystem operations (symlinks, directory creation, subprocess hooks) — they are not mocked.

## Preconditions

- Rust toolchain installed (`cargo` available)
- Unix-like OS (macOS or Linux — hook execution uses `sh -lc` and `kill(2)`)
- Working directory is the project root

## Smoke Test

```bash
cargo test --test workspace_prompt_tests
```
All 28 tests pass in <1s. This single command validates the entire slice contract.

## Test Cases

### 1. Path Sanitization

1. Run `cargo test --test workspace_prompt_tests -- test_sanitize`
2. **Expected:** 2 tests pass — unsafe chars replaced with `_`, empty string → `"issue"`

### 2. Symlink-Aware Canonicalization

1. Run `cargo test --test workspace_prompt_tests -- test_canonicalize`
2. **Expected:** 4 tests pass — existing paths resolved, non-existent tails preserved, symlinks followed, nested symlinks chained

### 3. Workspace Creation and Reuse

1. Run `cargo test --test workspace_prompt_tests -- test_workspace_creates test_workspace_reuses test_workspace_deterministic test_workspace_replaces`
2. **Expected:** 4 tests pass — missing dirs created, existing dirs reused with files preserved, deterministic paths, files at workspace path replaced with directory

### 4. Workspace Safety: Root Containment

1. Run `cargo test --test workspace_prompt_tests -- test_workspace_rejects test_workspace_canonicalizes`
2. **Expected:** 3 tests pass — symlink escape rejected, root-equals rejected, symlinked root → workspaces under real target

### 5. Hook Execution with Timeout

1. Run `cargo test --test workspace_prompt_tests -- test_workspace_after_create`
2. **Expected:** 3 tests pass — hook creates file in workspace, non-zero exit → WorkspaceHookFailed with hook name + exit status, sleeping hook killed after timeout → WorkspaceHookTimeout

### 6. Hook Lifecycle Semantics

1. Run `cargo test --test workspace_prompt_tests -- test_before_run test_after_run test_hook_output`
2. **Expected:** 3 tests pass — before_run failure is fatal, after_run failure is ignored (Ok returned), output >2KB truncated

### 7. Workspace Cleanup

1. Run `cargo test --test workspace_prompt_tests -- test_workspace_remove`
2. **Expected:** 2 tests pass — directory removed (parent intact), before_remove hook failure ignored and directory still removed

### 8. Prompt Rendering: Basic and DateTime Fields

1. Run `cargo test --test workspace_prompt_tests -- test_render_prompt_basic test_render_prompt_datetime`
2. **Expected:** 2 tests pass — identifier, title, labels, attempt rendered; created_at/updated_at as ISO 8601

### 9. Prompt Rendering: Optional and Collection Fields

1. Run `cargo test --test workspace_prompt_tests -- test_render_prompt_none test_render_prompt_blockers test_render_prompt_attempt`
2. **Expected:** 3 tests pass — None renders as empty, Vec<BlockerRef> iterable in for-loop, attempt None→empty / Some(3)→"3"

### 10. Prompt Rendering: Strict Mode and Error Handling

1. Run `cargo test --test workspace_prompt_tests -- test_render_prompt_strict test_render_prompt_parse`
2. **Expected:** 2 tests pass — unknown variable → TemplateRenderError, unclosed tag → TemplateParseError

## Edge Cases

### Symlink Escape Attack

1. Create tempdir root, create symlink inside root pointing outside root
2. Call ensure_workspace with that identifier
3. **Expected:** `WorkspaceOutsideRoot` error with both workspace and root paths in error

### Hook Timeout with SIGKILL

1. Hook command is `sleep 999`; timeout_ms is 100
2. **Expected:** `WorkspaceHookTimeout` returned, sleep process killed within ~200ms

### Workspace Path Is A File (Not Directory)

1. Create a regular file at the workspace path before calling ensure_workspace
2. **Expected:** File replaced with directory; workspace created successfully

## Failure Signals

- Any of the 28 tests failing indicates a regression in workspace safety, hook lifecycle, or prompt rendering
- `cargo build` warnings on these modules indicate potential type/lifetime issues
- `WorkspaceHookTimeout` test taking >5s indicates SIGKILL mechanism broken
- Prompt tests failing with serialization errors indicate Issue serde derives changed

## Requirements Proved By This UAT

- R004 (Workspace Manager with Safety Invariants) — 21 tests prove: path sanitization (6), workspace creation/reuse (4), root containment + symlink escape (3), hook execution with timeout (3), hook lifecycle semantics (3), cleanup (2)
- R007 (Prompt Builder with Strict Liquid Rendering) — 7 tests prove: basic field rendering, DateTime→ISO 8601, Option→nil, Vec<BlockerRef> iteration, strict unknown variable rejection, parse error surfacing, attempt None/Some

## Not Proven By This UAT

- R004 hook execution under the orchestrator dispatch loop (S06 wiring) — this UAT tests hooks in isolation, not triggered from the orchestrator's per-issue dispatch
- R007 first-run vs continuation vs retry prompt differentiation — the prompt builder renders whatever `attempt` value it receives; the orchestrator (S06) decides what value to pass
- Concurrent workspace creation — tests are single-threaded; concurrent access patterns are S06 scope
- Real Linear issue data in prompt rendering — tests use synthetic Issue objects, not live API data

## Notes for Tester

- All tests use `tempfile::TempDir` for isolation — no cleanup needed, no persistent side effects
- Hook timeout test (`test_workspace_after_create_hook_timeout`) spawns a real `sleep` process and kills it — may be flaky on extremely slow CI runners; increase timeout from 100ms if needed
- The `make_test_issue` helper constructs a fully populated `Issue` with realistic field values for prompt rendering tests
