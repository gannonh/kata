---
estimated_steps: 4
estimated_files: 1
---

# T01: Write failing test suite for workflow parsing, config extraction, and Liquid rendering

**Slice:** S02 — Workflow Loader and Config Layer
**Milestone:** M001

## Description

Create `tests/workflow_config_tests.rs` with the complete set of test functions covering all slice verification items. Tests must compile and fail at runtime (stubs return nothing useful), not fail with compile errors. This file is the objective stopping condition for the slice — later tasks make tests pass one group at a time.

## Steps

1. Add `tempfile` as a dev-dependency in `Cargo.toml` if not already present (`tempfile = "3"`).
2. Create `tests/workflow_config_tests.rs`. Import `symphony::workflow::parse_workflow`, `symphony::config::{from_workflow, validate}`, `symphony::workflow_store::WorkflowStore`, `symphony::error::SymphonyError`, `symphony::domain::*`, and `std::path::Path`. Also import `liquid`.
3. Write parse group (4 tests): `test_parse_workflow_happy_path` — writes a tempfile with `---\ntracker:\n  kind: linear\n---\nHello {{issue.id}}`, calls `parse_workflow`, asserts `prompt_template` contains "Hello" and `config.tracker.kind == "linear"`; `test_parse_workflow_no_delimiter` — full content as prompt, config yields defaults; `test_parse_workflow_empty_yaml` — `---\n\n---\nprompt` succeeds with defaults; `test_parse_workflow_non_map_yaml` — `---\n- list item\n---` returns `Err(SymphonyError::WorkflowError(_))`.
4. Write config group (7 tests): `test_config_defaults` — empty config map → all ServiceConfig fields match spec §5.3 defaults; `test_config_env_var_resolution` — set `LINEAR_API_KEY=test-key` env, WORKFLOW with `api_key: $LINEAR_API_KEY`, assert resolved; `test_config_tilde_expansion` — `workspace.root: ~/workspaces` expands to absolute path starting with `/`; `test_config_validation_missing_api_key` — no api_key → `ConfigError`; `test_config_validation_missing_project_slug` — no project_slug → `ConfigError`; `test_config_validation_bad_tracker_kind` — `kind: github` → `ConfigError`; `test_config_validation_missing_codex_command` — empty command → `ConfigError`.
5. Write Liquid group (2 tests): `test_liquid_unknown_variable_error` — parse `"{{unknown_var}}"`, render with empty globals → `Err(_)`; `test_liquid_known_variables_render` — parse `"{{issue_id}}"`, render with `issue_id = "LIN-1"` → `Ok("LIN-1")`.
6. Write WorkflowStore group (3 tests, async with `#[tokio::test]`): `test_workflow_store_initial_load` — write valid WORKFLOW.md tempfile, construct `WorkflowStore::new`, call `effective_config()`, assert config fields; `test_workflow_store_hot_reload` — after construction, overwrite file, sleep 800ms, assert config changed; `test_workflow_store_reload_failure_keeps_last_good` — overwrite file with invalid YAML, sleep 800ms, assert config unchanged.

## Must-Haves

- [ ] File compiles cleanly (`cargo build --tests` succeeds)
- [ ] All 16 test functions exist
- [ ] Tests fail at runtime (not compile-time) due to missing implementations
- [ ] `tempfile` dev-dependency present in `Cargo.toml`
- [ ] `#[tokio::test]` used for async WorkflowStore tests

## Verification

- `cargo build --tests 2>&1 | grep -v "^$"` — zero compile errors
- `cargo test --test workflow_config_tests 2>&1 | grep -E "FAILED|test result"` — tests exist and fail (not link errors)

## Observability Impact

- Signals added/changed: None (test file only)
- How a future agent inspects this: `cargo test --test workflow_config_tests -- --nocapture` shows individual test failure messages
- Failure state exposed: Each failing test prints which function/assertion failed

## Inputs

- `src/domain.rs` — `WorkflowDefinition`, `ServiceConfig` and sub-structs (from S01)
- `src/error.rs` — `SymphonyError` variants
- `Cargo.toml` — existing deps (`liquid`, `serde_yaml`, `tokio`, `tempfile` to be added)

## Expected Output

- `tests/workflow_config_tests.rs` — 16 test functions, compiles, all fail at runtime
