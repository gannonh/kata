---
id: T03
parent: S02
milestone: M001
provides:
  - src/config.rs with fully-implemented from_workflow(config: &serde_yaml::Value) and validate(config: &ServiceConfig)
key_files:
  - src/config.rs
key_decisions:
  - D015: Intermediate raw serde structs in config.rs (not domain.rs) own the YAML field mapping
  - D016: LINEAR_API_KEY fallback only applies when api_key is explicitly set to a $VAR that resolves to empty
patterns_established:
  - RawXxxConfig pattern — Option<T> serde structs inside config.rs; convert to domain types with defaults after deserialization
  - normalize_keys / resolve_env / expand_tilde as pure private helpers tested via inline unit tests
  - extract_section<T> generic helper encapsulates serde_yaml::from_value with typed ConfigError message
observability_surfaces:
  - SymphonyError::InvalidWorkflowConfig(msg) — msg names the failing section (e.g. "config section 'tracker': ...") or field (e.g. "tracker.api_key is required")
duration: ~25 min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Implement `config.rs` — ServiceConfig extraction, env resolution, and validation

**Implemented `from_workflow` and `validate` in `src/config.rs`: all 7 `test_config_*` tests pass, zero build warnings, `api_key` never in tracing output.**

## What Happened

Implemented the full config layer in `src/config.rs`:

1. **`normalize_keys(val: Value) -> Value`** — recursive walk that coerces all YAML mapping keys to `Value::String` (via `key_to_string`) and drops `Value::Null` entries before struct deserialization.

2. **`resolve_env(val: &str) -> String`** — `$VAR` resolution: strips the `$` prefix, validates the remainder is a bare identifier (no `/`, spaces, `:`), then looks up `std::env::var`. Returns empty string if the var is unset.

3. **`expand_tilde(val: &str) -> String`** — `~` or `~/...` → `$HOME/...`; all other inputs are returned unchanged.

4. **Intermediate raw structs** (`RawTrackerConfig`, `RawPollingConfig`, etc.) — all fields are `Option<T>` with `#[serde(default)]`, enabling serde to deserialize from YAML without requiring all keys to be present. After deserialization, defaults are filled from `ServiceConfig::default()`.

5. **`from_workflow(config: &Value) -> Result<ServiceConfig>`** — calls `normalize_keys`, extracts each section via generic `extract_section<T>`, builds domain structs with defaults, applies `resolve_env` to `tracker.api_key` and `tracker.assignee`, applies `expand_tilde` to `workspace.root`, and normalizes `agent.max_concurrent_agents_by_state` keys to lowercase.

   `LINEAR_API_KEY` fallback: applied inside the `api_key` mapping closure only when an explicit `$VAR` reference was provided but resolved to empty. If `api_key` is absent from YAML entirely, it stays `None` — no implicit env var injection.

6. **`validate(config: &ServiceConfig) -> Result<()>`** — checks `tracker.kind == "linear"`, `tracker.api_key` non-empty, `tracker.project_slug` non-empty, `codex.command` non-empty. All failure messages name the field but never include the key value.

## Verification

```shell
cargo test --test workflow_config_tests test_config
# → 7 passed; 0 failed

cargo build
# → Finished dev profile; 0 warnings

grep -n "api_key" src/config.rs | grep -i "log\|trace\|info\|debug\|error"
# → (no output) — zero matches
```

Slice-level progress: 13/16 tests now pass. Remaining 3 failures are `WorkflowStore` tests (T05 scope):
- `test_workflow_store_initial_load` — FAILED (WorkflowStore stub, T05)
- `test_workflow_store_hot_reload` — FAILED (WorkflowStore stub, T05)
- `test_workflow_store_reload_failure_keeps_last_good` — FAILED (WorkflowStore stub, T05)

## Diagnostics

- `SymphonyError::InvalidWorkflowConfig(msg)` — extraction failure: `msg` names the YAML section (e.g. `"config section 'codex': ..."`) with the serde error appended; callers can match to distinguish section-level deserialization failures from field-level validation failures.
- Validation failure messages name the failing field exactly (`"tracker.api_key is required"`, `"tracker.kind must be 'linear'"`, etc.) without revealing secret values.
- Inline unit tests in `config.rs` (`#[cfg(test)] mod tests`) exercise `normalize_keys`, `resolve_env`, and `expand_tilde` in isolation.

## Deviations

**Signature stays `&serde_yaml::Value`** — the task plan described `from_workflow(def: &WorkflowDefinition)`, but the test file calls `from_workflow(&raw)` where `raw: serde_yaml::Value`. Tests are authoritative; the existing stub signature was correct and was kept.

**No new `ConfigError` variant** — the task plan referenced `SymphonyError::ConfigError` which does not exist in `error.rs`. Used `SymphonyError::InvalidWorkflowConfig` (the existing variant) consistently throughout.

## Known Issues

None.

## Files Created/Modified

- `src/config.rs` — fully implemented; replaced stub with `normalize_keys`, `resolve_env`, `expand_tilde`, `from_workflow`, `validate`, and inline unit tests
- `.kata/DECISIONS.md` — appended D015 (raw serde struct pattern) and D016 (LINEAR_API_KEY fallback scope)
