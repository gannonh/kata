# S02: Workflow Loader and Config Layer — UAT

**Milestone:** M001
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02 has no user-facing UI, no HTTP endpoints, and no subprocess interactions. All behavior is fully exercised by the automated test suite using real filesystem operations (`tempfile`), real notify-based file watching, and real `liquid` rendering. Human visual inspection or live runtime observation would add no additional signal over `cargo test` output.

## Preconditions

- `cargo build` succeeds with zero warnings
- `notify`, `tempfile`, `liquid`, `serde_yaml` dependencies are present in `Cargo.toml`
- Working directory is `/Volumes/EVO/kata/kata-symphony-rust`

## Smoke Test

```bash
cargo test --test workflow_config_tests
# Expected: 16 passed; 0 failed; finished in ~1s
```

## Test Cases

### 1. WORKFLOW.md happy-path parsing

```bash
cargo test --test workflow_config_tests test_parse_workflow_happy_path -- --nocapture
```

Expected: Test passes. `WorkflowDefinition.prompt_template` matches the body after the second `---`. `WorkflowDefinition.config` is a YAML mapping containing the keys from the front matter.

### 2. WORKFLOW.md with no delimiter (prompt-only file)

```bash
cargo test --test workflow_config_tests test_parse_workflow_no_delimiter -- --nocapture
```

Expected: Test passes. `prompt_template` equals the entire file content (trimmed). Config is an empty YAML mapping (default).

### 3. WORKFLOW.md with empty front matter

```bash
cargo test --test workflow_config_tests test_parse_workflow_empty_yaml -- --nocapture
```

Expected: Test passes. Parsing succeeds (no error). Config is an empty mapping. `prompt_template` is the body after the second delimiter.

### 4. WORKFLOW.md with non-map YAML front matter

```bash
cargo test --test workflow_config_tests test_parse_workflow_non_map_yaml -- --nocapture
```

Expected: Test passes. Returns `Err(SymphonyError::WorkflowFrontMatterNotAMap)`.

### 5. ServiceConfig extraction with spec §5.3 defaults

```bash
cargo test --test workflow_config_tests test_config_defaults -- --nocapture
```

Expected: Test passes. All sub-structs populated with their default values when absent from YAML.

### 6. $VAR env-var resolution

```bash
cargo test --test workflow_config_tests test_config_env_var_resolution -- --nocapture
```

Expected: Test passes. `tracker.api_key` set to env var value when YAML contains `$LINEAR_API_KEY`.

### 7. ~ tilde home expansion

```bash
cargo test --test workflow_config_tests test_config_tilde_expansion -- --nocapture
```

Expected: Test passes. `workspace.root` expands `~/workspaces` to `$HOME/workspaces` (absolute path).

### 8. Config validation — missing api_key

```bash
cargo test --test workflow_config_tests test_config_validation_missing_api_key -- --nocapture
```

Expected: Test passes. Returns `Err(SymphonyError::InvalidWorkflowConfig(...))` with message naming `tracker.api_key`.

### 9. Config validation — missing project_slug

```bash
cargo test --test workflow_config_tests test_config_validation_missing_project_slug -- --nocapture
```

Expected: Test passes. Returns `Err(SymphonyError::InvalidWorkflowConfig(...))`.

### 10. Config validation — bad tracker kind

```bash
cargo test --test workflow_config_tests test_config_validation_bad_tracker_kind -- --nocapture
```

Expected: Test passes. Returns `Err(SymphonyError::InvalidWorkflowConfig(...))` with message naming `tracker.kind`.

### 11. Liquid strict rendering — unknown variable error

```bash
cargo test --test workflow_config_tests test_liquid_unknown_variable_error -- --nocapture
```

Expected: Test passes. `liquid::ParserBuilder::with_stdlib()` template with an undefined variable returns `Err(...)` at render time. No panics.

### 12. Liquid strict rendering — known variable renders successfully

```bash
cargo test --test workflow_config_tests test_liquid_known_variables_render -- --nocapture
```

Expected: Test passes. Template with known variables renders to expected output string.

### 13. WorkflowStore initial load

```bash
cargo test --test workflow_config_tests test_workflow_store_initial_load -- --nocapture
```

Expected: Test passes. `WorkflowStore::new(path)` succeeds with valid WORKFLOW.md file. `effective_config()` returns `(WorkflowDefinition, ServiceConfig)` with correct values.

### 14. WorkflowStore hot-reload

```bash
cargo test --test workflow_config_tests test_workflow_store_hot_reload -- --nocapture
```

Expected: Test passes. Writing new content to the watched file causes `effective_config()` to return the updated config within 800ms. No restart required.

### 15. WorkflowStore reload-failure keeps last known good

```bash
cargo test --test workflow_config_tests test_workflow_store_reload_failure_keeps_last_good -- --nocapture
```

Expected: Test passes. Writing invalid YAML to the watched file leaves `effective_config()` returning the last valid config. No panic or crash.

## Edge Cases

### Non-map YAML scalar at top level

Passing `"just a string\n"` as front matter returns `WorkflowFrontMatterNotAMap`, not a parse crash.

**Expected:** `Err(SymphonyError::WorkflowFrontMatterNotAMap)` — not `WorkflowParseError`.

### $VAR with no matching env var

`resolve_env` returns empty string when the env var is unset. api_key stays `None` when YAML is absent (no implicit injection).

**Expected:** `from_workflow` succeeds; `validate` returns `InvalidWorkflowConfig("tracker.api_key is required")` when api_key resolves to empty.

### WorkflowStore watcher drop

When `WorkflowStore` is dropped (end of test scope), the background thread exits cleanly. No resource leak.

**Expected:** No "thread panicked" or "watcher error" in test output.

## Failure Signals

- Any test in `cargo test --test workflow_config_tests` showing FAILED
- `cargo build` producing warnings (treat as failures in this slice)
- `grep -n "api_key" src/config.rs | grep -i "trace\|log\|info\|debug\|error"` returning output (api_key leak)
- `test_workflow_store_hot_reload` timing out (> 800ms) — may indicate notify backend issue on the host OS

## Requirements Proved By This UAT

- R001 — WORKFLOW.md Parsing and Dynamic Reload: Proved by `test_parse_workflow_*` (parsing) and `test_workflow_store_*` (dynamic reload with real FS writes, last-known-good fallback).
- R002 — Typed Config Layer with Defaults and Env Resolution: Proved by `test_config_defaults`, `test_config_env_var_resolution`, `test_config_tilde_expansion`, and all `test_config_validation_*` tests.
- R007 (partial) — Prompt Builder with Strict Liquid Rendering: The strict Liquid contract (unknown variable rejection) is proved by `test_liquid_unknown_variable_error` and `test_liquid_known_variables_render`. The full `render_prompt` function is S04 scope.
- R014 (partial) — Dispatch Preflight Validation: The `validate()` function is proved for all documented failure modes. Wiring into the orchestrator dispatch-preflight is S06 scope.

## Not Proven By This UAT

- `render_prompt` with `issue` and `attempt` variables — S04 scope (prompt_builder.rs)
- WorkflowStore integration with the orchestrator `force_reload()` before dispatch tick — S06 scope
- Dynamic reload under real operator conditions (concurrent agent sessions running while config changes) — S06/S09 scope
- api_key values do not appear in production structured log output — verified by grep in this slice but not exercised under load
- The 400ms debounce behavior under rapid successive file writes (e.g. editor save-on-every-keystroke) — not tested; single write per test only
