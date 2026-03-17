# S01: Domain Types and Error Foundation — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 is a pure type-definition slice with no runtime behavior, no UI, and no external integrations. Correctness is fully provable by compilation and contract tests — the compiler enforces type safety and serde derives, and 13 integration tests verify serialization round-trips, default values, and error display strings.

## Preconditions

- Rust toolchain installed (cargo, rustc)
- Project builds cleanly: `cargo build` with zero warnings

## Smoke Test

`cargo test --test domain_tests` — all 13 tests pass in under 1 second.

## Test Cases

### 1. Issue JSON Round-Trip

1. Construct an `Issue` with all fields populated
2. Serialize to JSON, deserialize back
3. **Expected:** All field values survive the round-trip exactly

### 2. Issue Serde Defaults

1. Deserialize an Issue JSON object with optional fields omitted
2. **Expected:** `labels` → empty vec, `blocked_by` → empty vec, `assigned_to_worker` → true, `priority` → null/None

### 3. ServiceConfig Spec §5.3 Defaults

1. Create `ServiceConfig::default()`
2. **Expected:** `polling_interval_ms` = 10000, `workspace_root` = "~/.symphony/workspaces", `max_concurrency` = 1, `retry_base_ms` = 5000, `retry_max_ms` = 300000, `stall_timeout_ms` = 1800000

### 4. ServerConfig Host Fix

1. Create `ServerConfig::default()`
2. **Expected:** `host` = "127.0.0.1" (not empty string)

### 5. OrchestratorSnapshot Serialization

1. Construct an `OrchestratorSnapshot` with sample data
2. Serialize to JSON
3. **Expected:** Valid JSON output; `running` keys appear in sorted order (BTreeMap)

### 6. AgentEvent All Variants

1. Construct each of the 12 `AgentEvent` variants
2. Format with `Debug`
3. **Expected:** All 12 produce non-empty debug strings; no panics

### 7. SymphonyError Display Coverage

1. Construct one variant from each of the 5 spec failure classes
2. Call `.to_string()` on each
3. **Expected:** All produce non-empty, descriptive error messages

## Edge Cases

### Missing Optional Fields Deserialization

1. Deserialize `{"id": "x", "identifier": "X-1", "title": "t", "state": "s"}` as Issue
2. **Expected:** All optional fields default correctly; no panic or error

### assigned_to_worker Absent vs Present

1. Deserialize Issue JSON without `assigned_to_worker` field
2. **Expected:** Defaults to `true` (the `default_true` serde function)

## Failure Signals

- `cargo build` produces any warning or error
- `cargo test --test domain_tests` has any test failure
- Any downstream slice fails to import a type it expects from `domain.rs`

## Requirements Proved By This UAT

- R013 (Spec-Driven Test Suite) — partially proved: 13 contract tests established as foundation for the full §17 conformance suite

## Not Proven By This UAT

- No runtime behavior is tested (no async execution, no I/O, no network)
- R001–R012, R014–R015 are not addressed — those require functional slices S02–S09
- Type correctness under real Codex protocol payloads is not proven until S05

## Notes for Tester

This is a foundation slice — there's nothing to "run" beyond `cargo test`. The value is that every downstream slice can import these types without modification. If you want to manually inspect, read `src/domain.rs` and verify the struct fields match SPEC.md §4.1.
