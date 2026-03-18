---
estimated_steps: 5
estimated_files: 1
---

# T02: Implement `workflow.rs` — WORKFLOW.md parser

**Slice:** S02 — Workflow Loader and Config Layer
**Milestone:** M001

## Description

Implement `parse_workflow(path: &Path) -> Result<WorkflowDefinition>` in `src/workflow.rs`. The function reads a WORKFLOW.md file, splits on `---` delimiter lines, parses YAML front matter via `serde_yaml`, and returns a typed `WorkflowDefinition`. All parsing edge cases from the research doc must be handled: no delimiters, empty YAML, and non-map YAML.

## Steps

1. Add `use` imports: `std::path::Path`, `std::fs`, `serde_yaml`, `crate::domain::{WorkflowDefinition, ServiceConfig}`, `crate::error::{SymphonyError, Result}`.
2. Implement splitting logic: split file content by lines; find lines that are exactly `---` (trimmed). If fewer than 2 such delimiters, treat entire content as prompt with empty config — construct `WorkflowDefinition { config: serde_yaml::Value::Mapping(Default::default()), prompt_template: content.trim().to_string() }`. Otherwise: lines between first and second `---` are front matter; everything after second `---` is the prompt body (joined and trimmed).
3. Parse YAML front matter: `serde_yaml::from_str::<serde_yaml::Value>(front_matter_str)`. Handle empty/whitespace string by treating as `Value::Mapping(Default::default())`. On parse error return `SymphonyError::WorkflowError(format!("YAML parse error: {e}"))`. If parsed value is not a `Value::Mapping(_)` return `SymphonyError::WorkflowError("workflow front matter is not a map".to_string())`.
4. Construct and return `WorkflowDefinition { config: parsed_value, prompt_template: prompt_body }`. Note: `WorkflowDefinition.config` stores the raw `serde_yaml::Value`; `ServiceConfig` extraction happens in T03.
5. Ensure `src/domain.rs`'s `WorkflowDefinition` has `config: serde_yaml::Value` field (check — if it has `config: ServiceConfig`, coordinate with domain type or add a separate raw field; prefer adding `raw_config: serde_yaml::Value` to avoid breaking S01 types). If the field shape doesn't match, make the minimal compatible change and note it as a deviation.

## Must-Haves

- [ ] `pub fn parse_workflow(path: &Path) -> Result<WorkflowDefinition>` exported from `src/workflow.rs`
- [ ] No-delimiter case: whole file → prompt, config is empty mapping
- [ ] Empty YAML case: succeeds with default mapping (no error)
- [ ] Non-map YAML case: returns `SymphonyError::WorkflowError`
- [ ] Happy-path case: front matter parsed, prompt body trimmed

## Verification

- `cargo test --test workflow_config_tests test_parse_workflow` — 4 parse tests pass
- `cargo build` — zero warnings

## Observability Impact

- Signals added/changed: Parse errors surface as typed `SymphonyError::WorkflowError` with message; callers can match and log
- How a future agent inspects this: `SymphonyError::WorkflowError(msg)` — `msg` contains file path context and error kind
- Failure state exposed: Parse error message includes reason (YAML error text or "not a map")

## Inputs

- `src/domain.rs` — `WorkflowDefinition` struct shape (from S01)
- `src/error.rs` — `SymphonyError::WorkflowError`, `Result<T>` alias
- `tests/workflow_config_tests.rs` — T01 test assertions to satisfy

## Expected Output

- `src/workflow.rs` — `parse_workflow` fully implemented; 4 parse tests pass
