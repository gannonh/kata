---
estimated_steps: 6
estimated_files: 1
---

# T03: Implement `config.rs` — ServiceConfig extraction, env resolution, and validation

**Slice:** S02 — Workflow Loader and Config Layer
**Milestone:** M001

## Description

Implement `from_workflow(def: &WorkflowDefinition) -> Result<ServiceConfig>` and `validate(config: &ServiceConfig) -> Result<()>` in `src/config.rs`. This is the most behavioral task in S02: typed extraction from raw YAML, key normalization, nil-dropping, `$VAR` env indirection, `~` home expansion, and spec §6.3 validation. Must never log `api_key` values.

## Steps

1. Add imports: `std::env`, `serde_yaml::{self, Value}`, `crate::domain::*`, `crate::error::{SymphonyError, Result}`.
2. Implement `fn normalize_keys(val: Value) -> Value`: recursively walk `Value::Mapping`, coerce all keys to `Value::String` (via `.to_string()` on any key type), drop entries where the value is `Value::Null`. Return normalized value.
3. Implement `fn resolve_env(val: &str) -> String`: if `val` starts with `$` and the rest is a valid identifier (no `/` or spaces), look up `std::env::var(&val[1..])` — return env value if present and non-empty, else return empty string. Otherwise return `val.to_string()`. For `tracker.api_key` specifically: if result is empty, also try `LINEAR_API_KEY` env var as canonical fallback.
4. Implement `fn expand_tilde(val: &str) -> String`: if `val == "~"` or starts with `~/`, replace leading `~` with `std::env::var("HOME").unwrap_or_default()`. Otherwise return `val.to_string()`.
5. Implement `pub fn from_workflow(def: &WorkflowDefinition) -> Result<ServiceConfig>`: call `normalize_keys` on `def.raw_config` (or `def.config`). For each sub-section (`tracker`, `polling`, `workspace`, `hooks`, `agent`, `codex`, `server`, `worker`): extract the sub-map `Value` if present, else use `Value::Mapping(Default::default())`; deserialize via `serde_yaml::from_value::<SubStruct>(sub_val)` — on serde error return `SymphonyError::ConfigError(format!("config section '{section}': {e}"))`. After deserialization: apply `resolve_env` to `tracker.api_key`, `tracker.assignee`; apply `expand_tilde` to `workspace.root`. Normalize `agent.max_concurrent_agents_by_state` keys to lowercase. Return assembled `ServiceConfig`.
6. Implement `pub fn validate(config: &ServiceConfig) -> Result<()>`: check `config.tracker.kind == "linear"` (else `ConfigError("tracker.kind must be 'linear'")`), `!config.tracker.api_key.is_empty()` (else `ConfigError("tracker.api_key is required")`), `!config.tracker.project_slug.is_empty()` (else `ConfigError("tracker.project_slug is required")`), `!config.codex.command.is_empty()` (else `ConfigError("codex.command is required")`). Return `Ok(())` if all pass.

## Must-Haves

- [ ] `pub fn from_workflow(def: &WorkflowDefinition) -> Result<ServiceConfig>` exported
- [ ] `pub fn validate(config: &ServiceConfig) -> Result<()>` exported
- [ ] `$VAR` resolution for `tracker.api_key` with `LINEAR_API_KEY` canonical fallback
- [ ] `~` expansion for `workspace.root`
- [ ] Nil/null values dropped before struct assignment
- [ ] All 7 `test_config_*` tests pass
- [ ] `api_key` never appears in `tracing` log calls

## Verification

- `cargo test --test workflow_config_tests test_config` — 7 config tests pass
- `cargo build` — zero warnings
- `grep -n "api_key" src/config.rs | grep -i "log\|trace\|info\|debug\|error"` — zero matches

## Observability Impact

- Signals added/changed: Extraction errors surface as `SymphonyError::ConfigError` with section name and serde error text; validation errors name the failing field
- How a future agent inspects this: `SymphonyError::ConfigError(msg)` — `msg` names which section or field failed
- Failure state exposed: Validation failures state the exact missing/invalid field without revealing secret values

## Inputs

- `src/domain.rs` — `ServiceConfig`, `TrackerConfig`, `WorkspaceConfig`, `CodexConfig`, and all sub-structs (from S01)
- `src/error.rs` — `SymphonyError::ConfigError`, `SymphonyError::WorkflowError`, `Result<T>`
- `src/workflow.rs` — `WorkflowDefinition` raw config field (from T02)
- `tests/workflow_config_tests.rs` — T01 test assertions to satisfy

## Expected Output

- `src/config.rs` — `from_workflow` and `validate` fully implemented; 7 config tests pass
