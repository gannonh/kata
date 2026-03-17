# S02: Workflow Loader and Config Layer

**Goal:** Implement `workflow.rs`, `config.rs`, and `workflow_store.rs` — the three modules that parse WORKFLOW.md, extract typed config with defaults/env-resolution, and hot-reload changes at runtime. The `liquid` strict-mode risk (D004) is retired in this slice.
**Demo:** `cargo test --test workflow_config_tests` passes all assertions: WORKFLOW.md parsing (happy path + edge cases), config extraction with defaults and `$VAR`/`~` resolution, config validation errors, strict Liquid rejection of unknown variables, and `WorkflowStore` hot-reload with last-known-good semantics.

## Must-Haves

- `parse_workflow(path) -> Result<WorkflowDefinition>` splits on `---`, returns typed struct (R001)
- Edge cases: no delimiter (prompt-only), empty YAML, non-map YAML → typed `SymphonyError` (R001)
- `ServiceConfig::from_workflow(def) -> Result<ServiceConfig>` extracts all sub-structs, applies `Default::default()` for missing sections, resolves `$VAR` env indirection and `~` home expansion (R002)
- Config validation: `tracker.kind == "linear"`, `api_key` non-nil, `project_slug` non-nil, `codex.command` non-empty → `ConfigError` on failure (R002, R014)
- Strict Liquid rendering: `liquid::ParserBuilder::with_stdlib()` template with unknown variable → `Err(TemplateError(...))` at render time (R007, D004 retired)
- `WorkflowStore` with `Arc<RwLock<EffectiveConfig>>`, background watcher task, debounced reload (300–500ms), last-known-good on failure, `force_reload()` API (R001)
- `pub mod workflow_store;` uncommented in `lib.rs`
- All 20+ tests in `tests/workflow_config_tests.rs` pass

## Proof Level

- This slice proves: contract + integration (real filesystem ops, real `notify` watcher, real `liquid` rendering)
- Real runtime required: yes — file-watch test uses `tempfile` with real FS writes
- Human/UAT required: no

## Verification

- `cargo test` — zero errors, zero warnings (all crates)
- `cargo test --test workflow_config_tests` — all tests pass
- Key assertions:
  - `test_parse_workflow_happy_path` — parses front matter + prompt correctly
  - `test_parse_workflow_no_delimiter` — whole file becomes prompt, config is default
  - `test_parse_workflow_empty_yaml` — empty front matter → default config, no error
  - `test_parse_workflow_non_map_yaml` — returns `SymphonyError::WorkflowError`
  - `test_config_defaults` — missing sections produce spec §5.3 defaults
  - `test_config_env_var_resolution` — `$LINEAR_API_KEY` resolved from env
  - `test_config_tilde_expansion` — `~/workspaces` expands to absolute path
  - `test_config_validation_missing_api_key` — returns `ConfigError`
  - `test_config_validation_missing_project_slug` — returns `ConfigError`
  - `test_config_validation_bad_tracker_kind` — returns `ConfigError`
  - `test_liquid_unknown_variable_error` — render with missing var → `Err(TemplateError)`
  - `test_liquid_known_variables_render` — render with all vars → success
  - `test_workflow_store_initial_load` — store initializes with parsed config
  - `test_workflow_store_hot_reload` — write new file content → store updates within 1s
  - `test_workflow_store_reload_failure_keeps_last_good` — write invalid YAML → config unchanged

## Observability / Diagnostics

- Runtime signals: `tracing::error!` on reload failure with `path` and `reason` fields; `tracing::info!` on successful reload with `path` field
- Inspection surfaces: `WorkflowStore::effective_config()` returns a clone of current `(WorkflowDefinition, ServiceConfig)` — callers can inspect state at any time
- Failure visibility: reload error is logged with typed `SymphonyError` message; last-known-good config remains observable via `effective_config()`
- Redaction constraints: `api_key` values must not appear in log output (never log `ServiceConfig` directly)

## Integration Closure

- Upstream surfaces consumed: `src/domain.rs` → `WorkflowDefinition`, `ServiceConfig` and all sub-structs; `src/error.rs` → `SymphonyError` variants
- New wiring introduced in this slice: `workflow_store` module uncommented in `lib.rs`; `WorkflowStore` is the live config source S04/S06 will consume
- What remains before the milestone is truly usable end-to-end: S03 (Linear client), S04 (workspace + prompt builder consuming `WorkflowStore`), S06 (orchestrator wiring `WorkflowStore::force_reload()` before each dispatch tick)

## Tasks

- [x] **T01: Write failing test suite for workflow parsing, config extraction, and Liquid rendering** `est:40m`
  - Why: Establishes the objective stopping condition for the slice. Tests must fail red before any implementation exists.
  - Files: `tests/workflow_config_tests.rs`
  - Do: Create the test file with all 15+ test functions covering parse_workflow (happy path, no delimiter, empty YAML, non-map YAML), ServiceConfig extraction (defaults, $VAR, ~ expansion, validation failures), and Liquid strict mode (unknown var error, known vars succeed). Each test should compile but fail at runtime because `workflow.rs` and `config.rs` are stubs. Use `tempfile::NamedTempFile` for file-based tests.
  - Verify: `cargo test --test workflow_config_tests 2>&1 | grep -E "FAILED|error"` — tests compile and fail (not compile errors)
  - Done when: All test functions exist and fail with "not yet implemented" or linker errors — zero tests pass

- [x] **T02: Implement `workflow.rs` — WORKFLOW.md parser** `est:45m`
  - Why: Provides `parse_workflow(path)` — the entry point for all config loading. Must handle all delimiter edge cases from the research doc.
  - Files: `src/workflow.rs`
  - Do: Implement `pub fn parse_workflow(path: &Path) -> Result<WorkflowDefinition>`. Read file to string. Split on lines that are exactly `---`. If fewer than 2 delimiters: treat whole content as prompt with empty config map, deserialize empty `{}` as ServiceConfig default. If 2+ delimiters: first segment is YAML front matter, everything after second `---` is prompt (trimmed). Parse YAML via `serde_yaml::from_str` — non-map top level → `SymphonyError::WorkflowError`. Empty/whitespace YAML → `WorkflowDefinition` with default `ServiceConfig`. Store raw `serde_yaml::Value` in `WorkflowDefinition.config` field for T03 to consume.
  - Verify: `cargo test --test workflow_config_tests test_parse_workflow` — parse tests pass
  - Done when: All 4 `test_parse_workflow_*` tests pass, `cargo build` clean

- [x] **T03: Implement `config.rs` — ServiceConfig extraction, env resolution, and validation** `est:60m`
  - Why: Provides `ServiceConfig::from_workflow(def)` with `$VAR`/`~` resolution and spec §6.3 validation. This is the largest behavioral surface in S02.
  - Files: `src/config.rs`
  - Do: Implement `pub fn from_workflow(def: &WorkflowDefinition) -> Result<ServiceConfig>`. Extract each sub-struct section from `def.config` (a `serde_yaml::Value`) using `serde_yaml::from_value` — on missing section use `Default::default()`. Normalize all map keys to strings. Drop nil/null values before struct assignment. Implement `resolve_env_var(val: &str) -> String`: if value equals `$VARNAME` (whole string), look up env var; if missing fall back to well-known defaults (`LINEAR_API_KEY`, `LINEAR_ASSIGNEE`). Implement `expand_tilde(val: &str) -> String`: if starts with `~/` or equals `~`, replace prefix with `std::env::var("HOME").unwrap_or_default()`. Apply resolution to `tracker.api_key`, `tracker.assignee`, `workspace.root`. Normalize `agent.max_concurrent_agents_by_state` keys to lowercase; drop invalid entries. Implement `pub fn validate(config: &ServiceConfig) -> Result<()>`: check tracker.kind == "linear", api_key non-empty, project_slug non-empty, codex.command non-empty — return `SymphonyError::ConfigError` on failure. Never log api_key values.
  - Verify: `cargo test --test workflow_config_tests test_config` — all config tests pass
  - Done when: All `test_config_*` tests pass, `cargo build` clean

- [x] **T04: Implement `workflow_store.rs` — live-watched singleton with hot-reload** `est:60m`
  - Why: Provides `WorkflowStore` — the runtime config source consumed by S04/S06. Closes the file-watch hot-reload requirement (R001) and retires the notify debounce design choice.
  - Files: `src/workflow_store.rs`, `src/lib.rs`
  - Do: Implement `WorkflowStore` struct holding `Arc<RwLock<EffectiveConfig>>` (tokio RwLock) where `EffectiveConfig = (WorkflowDefinition, ServiceConfig)`. Store the `notify::RecommendedWatcher` handle inside the struct to prevent premature drop. `WorkflowStore::new(path: PathBuf) -> Result<Self>`: do initial parse+validate, return error if initial load fails. Spawn a tokio task that receives notify events via `std::sync::mpsc` channel, debounces by waiting 400ms after last event, then calls `force_reload_inner()`. `force_reload_inner()`: reads file, parses, validates — on success atomically replaces `Arc<RwLock<...>>`; on failure logs `tracing::error!(path=?, reason=?e)` and keeps old value. `pub fn effective_config(&self) -> (WorkflowDefinition, ServiceConfig)`: takes read lock, clones. `pub async fn force_reload(&self) -> Result<()>`: triggers reload directly (for dispatch preflight). Uncomment `pub mod workflow_store;` in `lib.rs`.
  - Verify: `cargo test --test workflow_config_tests test_workflow_store` — all 3 store tests pass; `cargo test` overall clean
  - Done when: All `test_workflow_store_*` tests pass, `cargo test` green with zero warnings

## Files Likely Touched

- `src/workflow.rs`
- `src/config.rs`
- `src/workflow_store.rs` (new)
- `src/lib.rs`
- `tests/workflow_config_tests.rs` (new)
