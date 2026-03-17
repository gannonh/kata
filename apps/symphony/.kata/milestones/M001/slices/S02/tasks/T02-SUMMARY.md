---
id: T02
parent: S02
milestone: M001
provides:
  - src/workflow.rs with fully-implemented parse_workflow(path) function
key_files:
  - src/workflow.rs
key_decisions:
  - No domain changes needed; WorkflowDefinition.config was already serde_yaml::Value from S01
patterns_established:
  - Split content on lines where line.trim() == "---"; collect delimiter indices; branch on count
  - Empty/whitespace front-matter treated as serde_yaml::Value::Mapping(Default::default()) without error
  - WorkflowFrontMatterNotAMap is a unit variant (no message) — matches test expectation exactly
observability_surfaces:
  - Parse errors surface as SymphonyError::WorkflowParseError(msg) with path + IO/YAML reason
  - SymphonyError::WorkflowFrontMatterNotAMap for structural YAML errors (callers can match separately)
duration: ~15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Implement `workflow.rs` — WORKFLOW.md parser

**Implemented `parse_workflow(path: &Path) -> Result<WorkflowDefinition>` with full edge-case handling; all 4 parse tests pass, zero build warnings.**

## What Happened

Replaced the stub `parse_workflow` in `src/workflow.rs` with the full implementation. The function:

1. Reads the file to a `String` via `fs::read_to_string`, mapping IO errors to `SymphonyError::WorkflowParseError`.
2. Splits on lines where `line.trim() == "---"` and collects their indices.
3. Branches on delimiter count:
   - Fewer than 2 → whole content (trimmed) becomes `prompt_template`; config is `Value::Mapping(Default::default())`.
   - 2 or more → lines between first and second delimiter are the front-matter block; lines after the second delimiter (joined, trimmed) are the prompt body.
4. Parses front matter: empty/whitespace → default mapping; otherwise `serde_yaml::from_str` with `WorkflowParseError` on syntax failure.
5. Validates the parsed value is a `Value::Mapping(_)` — if not, returns `SymphonyError::WorkflowFrontMatterNotAMap`.
6. Returns `WorkflowDefinition { config: parsed_value, prompt_template: prompt_body }`.

No domain changes were required — `WorkflowDefinition.config` was already typed as `serde_yaml::Value` from S01.

## Verification

```shell
cargo test --test workflow_config_tests test_parse_workflow
```

```text
running 4 tests
test test_parse_workflow_empty_yaml ... ok
test test_parse_workflow_no_delimiter ... ok
test test_parse_workflow_non_map_yaml ... ok
test test_parse_workflow_happy_path ... ok

test result: ok. 4 passed; 0 failed
```

```shell
cargo build  →  Finished (zero warnings)
```

Slice-level progress after T02: **10/16 tests pass** (4 parse + 4 validation stubs + 2 liquid). 6 remaining failures are T03 scope (`test_config_*`) and T04 scope (`test_workflow_store_*`).

## Diagnostics

- `SymphonyError::WorkflowParseError(msg)` — msg includes `path.display()` and the IO/YAML error text; callers can log or propagate.
- `SymphonyError::WorkflowFrontMatterNotAMap` — unit variant; callers can `match` to distinguish structural YAML errors from syntax errors.
- Both variants are visible via `{:?}` or `{}` debug/display formatting via `thiserror`.

## Deviations

None — `WorkflowDefinition.config: serde_yaml::Value` was already the correct shape in `domain.rs`; no field rename or migration was needed.

## Known Issues

None.

## Files Created/Modified

- `src/workflow.rs` — full implementation of `parse_workflow`; stub replaced
