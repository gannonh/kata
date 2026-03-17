---
id: T01
parent: S02
milestone: M001
provides:
  - tests/workflow_config_tests.rs with 16 test functions covering all S02 verification items
key_files:
  - tests/workflow_config_tests.rs
  - src/domain.rs
key_decisions:
  - Added Default impl for ServiceConfig in domain.rs to support struct-update syntax in tests
  - liquid 0.26 already errors on unknown variables by default — no strict-mode wrapper needed
patterns_established:
  - Test groups mirror slice verification sections (parse / config / liquid / workflow_store)
  - NamedTempFile pattern for all filesystem-dependent tests
  - TrackerConfig struct-update syntax with ..TrackerConfig::default() for minimal config construction
observability_surfaces:
  - none (test file only)
duration: ~20m (resume from crash, files already partially written)
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Write failing test suite for workflow parsing, config extraction, and Liquid rendering

**Created `tests/workflow_config_tests.rs` with all 16 test functions; zero compile errors; 10 tests fail at runtime against stubs, 6 pass (4 validation stubs return Err as expected, 2 liquid tests pass due to library defaults).**

## What Happened

Previous session had already written stub modules (`workflow.rs`, `config.rs`, `workflow_store.rs`, updated `lib.rs`) and confirmed `tempfile` was already in dev-dependencies. This session resumed by verifying those files were correct, then:

1. Added `impl Default for ServiceConfig` to `src/domain.rs` — required for struct-update syntax (`..ServiceConfig::default()`) in validation tests. All sub-struct types already had `Default` implementations; this was the only missing piece.

2. Wrote `tests/workflow_config_tests.rs` with 16 test functions across four groups:
   - **Parse (4):** happy path, no delimiter, empty YAML, non-map YAML
   - **Config (7):** defaults, env var resolution, tilde expansion, missing api_key, missing project_slug, bad tracker kind, missing codex command
   - **Liquid (2):** unknown variable error, known variable render
   - **WorkflowStore (3, async):** initial load, hot-reload, reload-failure-keeps-last-good

3. `cargo build --tests` — zero errors, zero warnings.

4. `cargo test --test workflow_config_tests` — 10 FAILED, 6 passed, 0 link errors. The 10 failures are parse/config/store tests that call stub functions returning `Err("not yet implemented")` where tests expect `Ok(...)`. The 6 passes are: 4 validation tests (stubs return `Err` which is what those tests assert), and 2 liquid tests (liquid 0.26 already errors on unknown variables by default; known variable renders correctly).

## Verification

```
cargo build --tests
# → Finished `dev` profile — zero errors

cargo test --test workflow_config_tests 2>&1 | grep -E "FAILED|passed|test result"
# → test result: FAILED. 6 passed; 10 failed; 0 ignored; 0 measured
```

Failing tests (expected for T01):
- `test_parse_workflow_happy_path` — stub returns Err, expects Ok
- `test_parse_workflow_no_delimiter` — same
- `test_parse_workflow_empty_yaml` — same
- `test_parse_workflow_non_map_yaml` — stub returns WorkflowParseError, test expects WorkflowFrontMatterNotAMap
- `test_config_defaults` — stub returns Err, expects Ok with default fields
- `test_config_env_var_resolution` — same
- `test_config_tilde_expansion` — same
- `test_workflow_store_initial_load` — store::new stub returns Err, unwrap panics
- `test_workflow_store_hot_reload` — same
- `test_workflow_store_reload_failure_keeps_last_good` — same

## Diagnostics

Run with `--nocapture` to see individual failure messages:
```
cargo test --test workflow_config_tests -- --nocapture
```
Each failing test prints which function/assertion failed and the actual value (e.g. `Err(WorkflowParseError("not yet implemented"))`).

## Deviations

**`Default impl for ServiceConfig` added to domain.rs** — The task plan did not explicitly list this, but the validation tests require `ServiceConfig { tracker: TrackerConfig { ... }, ..ServiceConfig::default() }` struct-update syntax. Since all sub-structs already had `Default`, adding it was a zero-risk one-liner.

**liquid 0.26 strict-by-default** — The task plan noted `test_liquid_unknown_variable_error` "fails until strict mode is wired up." In practice, `liquid 0.26` already returns `Err` for unknown variables without any additional configuration, so this test passes in T01. The test is still correct — it validates the contract. Later tasks need not add a strict-mode wrapper for this behavior.

## Known Issues

None.

## Files Created/Modified

- `tests/workflow_config_tests.rs` — 16 test functions covering all S02 verification items; compiles cleanly; 10 fail at runtime against stubs
- `src/domain.rs` — Added `impl Default for ServiceConfig` (enables struct-update syntax in tests)
