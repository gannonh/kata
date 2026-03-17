---
id: T02
parent: S01
milestone: M001
provides:
  - 13 integration tests in tests/domain_tests.rs covering all slice verification requirements
  - Issue JSON round-trip test with all fields populated
  - Issue serde defaults test (missing optionals deserialize to None/empty)
  - ServiceConfig defaults test matching spec §5.3 values
  - SymphonyError display test covering all 5 spec failure classes
key_files:
  - tests/domain_tests.rs
key_decisions: []
patterns_established:
  - "Integration tests live in tests/domain_tests.rs; test names prefixed with test_; each test is self-contained with inline data"
observability_surfaces:
  - "cargo test output shows per-test pass/fail with assertion messages on failure"
duration: 8min
verification_result: passed
completed_at: 2026-03-15T22:42:00Z
blocker_discovered: false
---

# T02: Add domain contract tests

**13 integration tests proving Issue round-trip, serde defaults, all spec §5.3 config defaults, runtime entity construction, snapshot serialization, AgentEvent debug, and SymphonyError display across all 5 failure classes**

## What Happened

Rewrote `tests/domain_tests.rs` (which T01 had seeded with 8 tests) to a complete 13-test suite covering every item in the slice verification checklist. Added tests that were missing from T01: `test_issue_json_round_trip` (full field round-trip), `test_issue_missing_optionals_defaults` (serde defaults for optional fields), `test_issue_assigned_to_worker_defaults_true` (the `default_true` serde function), `test_service_config_defaults_match_spec` (all spec §5.3 default values), `test_workspace_construction`, and `test_symphony_error_display` (one variant from each of the 5 spec failure classes). Existing T01 tests were preserved and renamed to use the `test_` prefix convention.

No bugs were found in `domain.rs` or `error.rs` — all types serialize, deserialize, and display correctly as designed.

## Verification

- `cargo test -- --nocapture`: 13 tests pass, 0 failed
- `cargo build 2>&1 | grep -E "error|warning"`: zero output (clean build)
- **Slice-level verification status (all pass):**
  - ✓ Issue round-trip JSON serialization with all fields
  - ✓ Issue deserialization with missing optional fields (serde defaults)
  - ✓ ServiceConfig default values match spec §5.3
  - ✓ ServerConfig::default().host == "127.0.0.1"
  - ✓ RunAttempt, LiveSession, RetryEntry construction
  - ✓ OrchestratorSnapshot serialization produces valid JSON
  - ✓ AgentEvent variant construction and debug formatting
  - ✓ SymphonyError display messages are non-empty for each variant

## Diagnostics

Run `cargo test` to verify domain type contracts still hold. Test assertion messages pinpoint which field or value is wrong on failure.

## Deviations

Added `test_issue_assigned_to_worker_defaults_true` (not in original plan) to explicitly cover the `default_true` serde function when `assigned_to_worker` is entirely absent from JSON. Also added `test_workspace_construction` to cover the Workspace struct. Total: 13 tests instead of the minimum 8.

## Known Issues

None

## Files Created/Modified

- `tests/domain_tests.rs` — rewrote with 13 integration tests covering full slice verification checklist
