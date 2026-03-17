---
estimated_steps: 4
estimated_files: 2
---

# T02: Add domain contract tests

**Slice:** S01 — Domain Types and Error Foundation
**Milestone:** M001

## Description

Create `tests/domain_tests.rs` with integration tests that verify serialization round-trips, serde default handling, spec-mandated default values, struct construction, and error display formatting. These tests prove the types work correctly and establish the integration test pattern for downstream slices.

## Steps

1. Create `tests/domain_tests.rs` with `use symphony::domain::*;` and `use symphony::error::*;` imports.
2. Write `test_issue_json_round_trip` — create an `Issue` with all fields populated, serialize to JSON, deserialize back, assert all fields match.
3. Write `test_issue_missing_optionals_defaults` — deserialize a minimal JSON object (`{"id":"1","identifier":"X-1","title":"t","state":"Todo","assigned_to_worker":true}`) and assert optional fields are `None`/empty-vec defaults.
4. Write `test_service_config_defaults_match_spec` — construct `ServiceConfig` with all sub-struct defaults, assert: `polling.interval_ms == 30_000`, `agent.max_concurrent_agents == 10`, `agent.max_turns == 20`, `agent.max_retry_backoff_ms == 300_000`, `codex.turn_timeout_ms == 3_600_000`, `codex.read_timeout_ms == 5_000`, `codex.stall_timeout_ms == 300_000`, `hooks.timeout_ms == 60_000`, `server.host == "127.0.0.1"`, `tracker.endpoint == "https://api.linear.app/graphql"`.
5. Write `test_server_config_default_host` — assert `ServerConfig::default().host == "127.0.0.1"`.
6. Write `test_runtime_entities_construction` — construct `RunAttempt`, `LiveSession`, `RetryEntry`, `Workspace` with representative values, assert key fields.
7. Write `test_orchestrator_snapshot_serializes` — construct an `OrchestratorSnapshot` with sample data, serialize to JSON, assert it's valid JSON and contains expected keys.
8. Write `test_agent_event_variants` — construct at least 3 `AgentEvent` variants, assert `format!("{:?}", event)` is non-empty (proves Debug derive works).
9. Write `test_symphony_error_display` — construct one variant from each of the 5 spec failure classes, assert `error.to_string()` is non-empty and contains expected substring.
10. Fix any issues in `domain.rs` or `error.rs` that tests reveal.

## Must-Haves

- [ ] `tests/domain_tests.rs` exists with ≥8 test functions
- [ ] All tests pass with `cargo test`
- [ ] Tests cover: Issue round-trip, Issue defaults, ServiceConfig defaults, ServerConfig host, runtime entity construction, OrchestratorSnapshot serialization, AgentEvent variants, SymphonyError display
- [ ] Any bugs found are fixed in `domain.rs` or `error.rs`

## Verification

- `cargo test -- --nocapture` — all tests pass, output shows test names
- `cargo test 2>&1 | grep "test result"` — shows `0 failed`

## Observability Impact

- Signals added/changed: None
- How a future agent inspects this: Run `cargo test` to verify domain type contracts still hold
- Failure state exposed: Test assertion messages pinpoint which field or value is wrong

## Inputs

- `src/domain.rs` — all domain types from T01
- `src/error.rs` — error enum
- Spec §5.3 — authoritative default values for config sub-structs

## Expected Output

- `tests/domain_tests.rs` — new integration test file with ≥8 tests, all passing
- `src/domain.rs` — minor fixes if tests reveal issues (e.g., missing derives, wrong defaults)
