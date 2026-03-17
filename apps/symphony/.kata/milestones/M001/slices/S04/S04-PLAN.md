# S04: Workspace Manager and Prompt Builder

**Goal:** Three new modules (`path_safety.rs`, `prompt_builder.rs`, `workspace.rs`) fully implemented and proven with comprehensive tests — workspace creation/reuse with sanitized paths, root containment validation, all four lifecycle hooks with timeout enforcement, and prompt rendering with `issue` + `attempt` variables under strict Liquid mode.

**Demo:** `cargo test --test workspace_prompt_tests` passes all assertions: deterministic workspace paths, path sanitization, symlink escape rejection, root containment, hook execution with timeout and failure handling, workspace reuse vs creation, cleanup, and prompt rendering with all field types including DateTime, Option, Vec<BlockerRef>, strict mode rejection, and parse error surfacing.

## Must-Haves

- `path_safety::sanitize_identifier(id)` replaces non-`[A-Za-z0-9._-]` chars with `_`; nil/empty → `"issue"`
- `path_safety::canonicalize(path)` resolves symlinks segment-by-segment, handles non-existent tail segments (Elixir `PathSafety.canonicalize` parity)
- `workspace::WorkspaceManager` with `ensure_workspace(identifier, config)` that creates or reuses per-issue directories under configured root
- `workspace::validate_workspace_path(workspace, root)` enforces root containment — rejects: equals root, outside root, symlink escape
- All four hooks (`after_create`, `before_run`, `after_run`, `before_remove`) run via `sh -lc <command>` with `cwd=workspace` and `timeout_ms` enforcement
- `after_create` and `before_run` failures are fatal; `after_run` and `before_remove` failures are logged and ignored
- Hook timeout kills the child process and returns `WorkspaceHookTimeout`
- Hook output truncated to 2KB for logging
- `prompt_builder::render_prompt(template, issue, attempt)` renders strict Liquid template with `issue` and `attempt` variables
- `Issue` fields serialize correctly to Liquid objects: `DateTime<Utc>` → ISO 8601 string, `Option<T>` → nil/value, `Vec<BlockerRef>` → iterable array
- Unknown variables in template → `TemplateRenderError`; malformed template → `TemplateParseError`
- Workspace cleanup (`remove_workspace`) validates path before deletion, runs `before_remove` hook

## Proof Level

- This slice proves: contract (unit + integration tests with real filesystem operations and real subprocess execution)
- Real runtime required: yes (tests use tempfile dirs, real `sh -lc` hook execution, real symlink creation)
- Human/UAT required: no

## Verification

All assertions run via `cargo test --test workspace_prompt_tests` against real filesystem and real subprocess execution:

**Path Safety (6 tests):**
- `test_sanitize_identifier_replaces_unsafe_chars` — `"MT/Det"` → `"MT_Det"`, `"S-1"` → `"S-1"`
- `test_sanitize_identifier_nil_or_empty` — empty string → `"issue"`
- `test_canonicalize_existing_path` — resolves to real absolute path
- `test_canonicalize_nonexistent_tail` — resolves existing prefix, preserves non-existent segments
- `test_canonicalize_symlink_resolution` — follows symlinks to real target
- `test_canonicalize_nested_symlink` — resolves chained symlinks

**Workspace Manager (12 tests):**
- `test_workspace_deterministic_path` — same identifier → same path; basename matches sanitized id
- `test_workspace_creates_missing_directory` — new workspace created; `created_now=true`
- `test_workspace_reuses_existing_directory` — existing workspace reused; files preserved; `created_now=false`
- `test_workspace_replaces_non_directory` — file at workspace path → replaced with directory
- `test_workspace_rejects_symlink_escape` — symlink pointing outside root → `WorkspaceOutsideRoot`
- `test_workspace_canonicalizes_symlinked_root` — root itself is a symlink → workspaces created under real target
- `test_workspace_rejects_root_itself` — workspace path == root → rejected
- `test_workspace_after_create_hook_runs` — hook executes; result file exists in workspace
- `test_workspace_after_create_hook_failure` — non-zero exit → `WorkspaceHookFailed`
- `test_workspace_after_create_hook_timeout` — sleeping hook killed after short timeout → `WorkspaceHookTimeout`
- `test_workspace_remove_cleans_directory` — workspace removed; parent root intact
- `test_workspace_remove_runs_before_remove_hook` — hook failure logged and ignored; workspace still removed

**Hook Lifecycle (3 tests):**
- `test_before_run_hook_failure_is_fatal` — non-zero exit → error propagated
- `test_after_run_hook_failure_is_ignored` — non-zero exit → Ok(())
- `test_hook_output_truncation` — >2KB output truncated in log message

**Prompt Builder (7 tests):**
- `test_render_prompt_basic_fields` — identifier, title, labels, attempt rendered correctly
- `test_render_prompt_datetime_fields` — `created_at` and `updated_at` render as ISO 8601
- `test_render_prompt_none_fields` — `None` values render as empty string
- `test_render_prompt_blockers_iterable` — `{% for b in issue.blocked_by %}` iterates `Vec<BlockerRef>`
- `test_render_prompt_strict_unknown_variable` — `{{ missing.field }}` → `TemplateRenderError`
- `test_render_prompt_parse_error` — `{% if issue.id %}` (unclosed) → `TemplateParseError`
- `test_render_prompt_attempt_none_vs_some` — `attempt: None` → empty; `attempt: Some(3)` → `"3"`

**Observability check:**
- `test_workspace_after_create_hook_failure` — verify error contains hook name and exit status

**Build health:**
- `cargo build` — zero errors, zero warnings
- `cargo test` — all existing 80 tests still pass + new ~28 tests pass

## Observability / Diagnostics

- Runtime signals: `tracing::info!` on hook start with hook name, issue context, workspace path; `tracing::warn!` on hook failure/timeout with exit status and truncated output; `tracing::error!` on workspace creation failure
- Inspection surfaces: `SymphonyError` variants (`WorkspaceOutsideRoot`, `WorkspaceHookFailed`, `WorkspaceHookTimeout`, `TemplateParseError`, `TemplateRenderError`) carry structured context fields for programmatic matching
- Failure visibility: hook name, exit status, truncated output (≤2KB), timeout_ms in error/warning logs; workspace path and root path in containment errors
- Redaction constraints: none (workspace paths and hook commands are not secrets; api_key is not in scope for these modules)

## Integration Closure

- Upstream surfaces consumed: `src/domain.rs` → `Issue`, `BlockerRef`, `Workspace`, `WorkspaceConfig`, `HooksConfig`; `src/error.rs` → `WorkspaceOutsideRoot`, `WorkspaceHookFailed`, `WorkspaceHookTimeout`, `TemplateParseError`, `TemplateRenderError`; `src/workflow_store.rs` → `WorkflowDefinition.prompt_template` (consumed by callers, not coupled in prompt_builder)
- New wiring introduced in this slice: three new modules (`path_safety`, `prompt_builder`, `workspace`) registered in `lib.rs`; no runtime composition yet (S06 wires workspace_manager + prompt_builder into orchestrator dispatch loop)
- What remains before the milestone is truly usable end-to-end: S05 (Codex client), S06 (orchestrator loop wiring workspace + prompt into dispatch), S07 (HTTP dashboard), S08 (SSH), S09 (conformance sweep)

## Tasks

- [x] **T01: Write the full test suite and implement path_safety module** `est:45m`
  - Why: Tests define the contract first. `path_safety` is pure-function (no I/O dependencies beyond fs), so tests + implementation fit in one task. Foundation for workspace module.
  - Files: `tests/workspace_prompt_tests.rs`, `src/path_safety.rs`, `src/lib.rs`
  - Do: Create `tests/workspace_prompt_tests.rs` with ALL 28 tests (6 path_safety + 12 workspace + 3 hook lifecycle + 7 prompt). Path safety and prompt tests should compile and pass after this task; workspace tests compile but fail (stubs). Implement `path_safety::sanitize_identifier` and `path_safety::canonicalize` with segment-by-segment symlink resolution matching Elixir PathSafety. Uncomment `pub mod path_safety` in `lib.rs`.
  - Verify: `cargo test --test workspace_prompt_tests -- test_sanitize` and `cargo test --test workspace_prompt_tests -- test_canonicalize` — all 6 path safety tests pass. Workspace/prompt tests compile (may fail at runtime).
  - Done when: all 6 path safety tests pass; all 28 tests compile; `cargo build` zero warnings

- [x] **T02: Implement prompt_builder module** `est:30m`
  - Why: prompt_builder depends only on `liquid` + domain types — no workspace dependency. Completing it early validates the critical `Issue → liquid::Object` serialization path (DateTime, Option, Vec<BlockerRef>).
  - Files: `src/prompt_builder.rs`, `src/lib.rs`
  - Do: Implement `render_prompt(template: &str, issue: &Issue, attempt: Option<u32>) -> Result<String>`. Use `liquid::ParserBuilder::with_stdlib().build()` to parse template. Use `liquid_core::model::to_object` for Issue → Object conversion. Build globals with `liquid::object!({ "issue": issue_obj, "attempt": attempt_val })`. Map liquid errors to `TemplateParseError` / `TemplateRenderError`. Uncomment `pub mod prompt_builder` in `lib.rs`.
  - Verify: `cargo test --test workspace_prompt_tests -- test_render_prompt` — all 7 prompt tests pass
  - Done when: all 7 prompt builder tests pass; `cargo build` zero warnings

- [x] **T03: Implement workspace module with hook execution** `est:45m`
  - Why: The workspace module is the largest piece — directory creation/reuse, path validation, hook execution with subprocess timeout, cleanup. Depends on path_safety (T01).
  - Files: `src/workspace.rs`, `src/lib.rs`
  - Do: Implement `WorkspaceManager` with: `ensure_workspace(identifier: &str, config: &WorkspaceConfig, hooks: &HooksConfig) -> Result<Workspace>` — sanitize id, compute path, canonicalize, validate containment, create/reuse dir, run after_create hook if newly created. `validate_workspace_path(workspace: &Path, root: &Path) -> Result<()>` — three-way check (equals root, starts_with root/, symlink escape). `run_hook(name: &str, command: &str, workspace: &Path, timeout_ms: u64) -> Result<()>` — `sh -lc` with cwd, timeout via thread-based watchdog, kill on timeout, truncate output to 2KB. `run_before_run_hook`, `run_after_run_hook` (ignores failure), `remove_workspace` with `before_remove` hook (ignores failure). Uncomment `pub mod workspace` in `lib.rs`.
  - Verify: `cargo test --test workspace_prompt_tests` — all 28 tests pass; `cargo build` zero warnings; `cargo test` — all 108+ tests pass
  - Done when: all 28 workspace_prompt_tests pass; full test suite green; zero build warnings

## Files Likely Touched

- `src/path_safety.rs` — new file: `sanitize_identifier`, `canonicalize`
- `src/prompt_builder.rs` — new file: `render_prompt`
- `src/workspace.rs` — new file: `WorkspaceManager`, `validate_workspace_path`, hook execution
- `src/lib.rs` — uncomment `pub mod path_safety`, `pub mod prompt_builder`, `pub mod workspace`
- `tests/workspace_prompt_tests.rs` — new file: 28 integration tests
