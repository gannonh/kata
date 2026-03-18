---
id: S03
parent: M001
milestone: M001
provides:
  - LinearClient struct with GraphQL HTTP transport and 3 async fetch operations
  - TrackerAdapter trait with 5 async methods (contract for S06 orchestrator)
  - LinearAdapter implementing TrackerAdapter by delegating to LinearClient
  - Issue normalization (14 fields from raw JSON, labels lowercase, blockers by type, priority coercion)
  - Cursor-based pagination for candidates, batch-splitting for IDs with order preservation
  - Assignee routing filter with "me" viewer resolution
  - 33-test integration suite proving all behaviors via mock HTTP
requires:
  - slice: S01
    provides: Issue, BlockerRef, TrackerConfig, ApiKey domain types; SymphonyError variants
affects:
  - S06
key_files:
  - src/linear/client.rs
  - src/linear/adapter.rs
  - src/linear/mod.rs
  - tests/linear_client_tests.rs
key_decisions:
  - D019: normalize_issue and AssigneeFilter promoted to pub for integration test access
  - D020: async-trait crate for TrackerAdapter (standard Rust async trait dyn dispatch)
  - D021: mockito for HTTP-level mocking (tests full stack without transport injection)
patterns_established:
  - GraphQL transport: POST JSON with raw Authorization header, typed error mapping
  - Normalization: serde_json::Value → Option<Issue> via extraction functions
  - Pagination: reverse+prepend accumulation with final reverse (mirrors Elixir)
  - Order preservation: build_order_index HashMap, sort_by_requested_order after fetch
  - MockHTTP testing: mockito::Server per test, FIFO mock ordering for multi-request flows
  - TrackerAdapter: async_trait with Send+Sync bounds for orchestrator consumption
observability_surfaces:
  - tracing::info! on fetch start/completion with operation name and issue count
  - tracing::warn! on non-200 responses with truncated body (≤1000 bytes)
  - tracing::error! on transport failures
  - Error variants carry context strings (status code, truncated body, error message)
  - ApiKey Debug prints [REDACTED] — never logged
drill_down_paths:
  - .kata/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2026-03-17
---

# S03: Linear Tracker Client

**Complete Linear GraphQL client behind a TrackerAdapter trait — 3 async fetch operations with pagination, normalization, assignee routing, and 33-test integration suite proving all behaviors via mock HTTP.**

## What Happened

**T01** built the core `LinearClient` (~750 LOC) with GraphQL transport, three async fetch operations (`fetch_candidates`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`), full issue normalization (14 fields), cursor-based pagination, batch-splitting in chunks of 50 with order preservation, and assignee routing with "me" viewer resolution. Three GraphQL query strings match the Elixir reference field-by-field.

**T02** defined the `TrackerAdapter` trait with 5 async methods (matching Elixir's `SymphonyElixir.Tracker` behaviour), implemented `LinearAdapter` delegating read ops to `LinearClient` (write ops return "not implemented"), and built a 33-test integration suite using mockito HTTP mocking. Tests cover normalization (8), assignee routing (4), pagination (2), ID batching (2), empty-input short circuits (2), deduplication (2), no-assignee-filter-on-state-fetch (1), error mapping (5), adapter delegation (5), and viewer "me" resolution (2).

## Verification

- `cargo test --test linear_client_tests` — 33/33 tests pass ✅
- `cargo build` — zero errors, zero warnings ✅
- `cargo test` — all 80 tests pass (15 config + 13 domain + 33 linear + 19 workflow) ✅
- All slice verification items confirmed:
  - Normalization: full field extraction, labels lowercase, blockers filtered by type, priority coercion, datetime parsing, branch_name mapping ✅
  - Assignee routing: assigned (match), not assigned (mismatch), no filter (all true) ✅
  - Pagination: multi-page candidate fetch preserves order ✅
  - ID-based fetch: batched beyond 50, original order preserved ✅
  - Empty-input short circuits for both fetch_issues_by_states and fetch_issue_states_by_ids ✅
  - Error mapping: transport error, non-200 status, GraphQL errors, unknown payload, missing end cursor ✅
  - fetch_issues_by_states does NOT apply assignee filter ✅
  - State name deduplication, ID deduplication ✅

## Deviations

- `normalize_issue` and `AssigneeFilter` changed from `pub(crate)` to `pub`. T01 used `pub(crate)` expecting internal test modules, but Rust integration tests (`tests/` dir) are external crates requiring `pub` visibility. Recorded as D019.

## Known Limitations

- Write operations (`create_comment`, `update_issue_state`) return `SymphonyError::Other("not implemented")`. The Elixir adapter implements these with GraphQL mutations for state lookup and comment creation. Deferred — no slice currently requires write ops.
- No live Linear API integration test. All testing is via mock HTTP. Live integration deferred to S09 conformance sweep.

## Follow-ups

None — all planned work complete.

## Files Created/Modified

- `src/linear/client.rs` — LinearClient: GraphQL transport, 3 fetch ops, normalization, pagination, assignee routing (~750 LOC)
- `src/linear/adapter.rs` — TrackerAdapter trait (5 methods) + LinearAdapter implementation
- `src/linear/mod.rs` — Module declarations re-exporting client and adapter
- `src/lib.rs` — Added `pub mod linear`
- `tests/linear_client_tests.rs` — 33-test integration suite with mockito HTTP mocking
- `Cargo.toml` — Added async-trait, mockito, tokio-test dependencies

## Forward Intelligence

### What the next slice should know
- `TrackerAdapter` is the contract S06 consumes — import from `symphony::linear::adapter`
- `LinearAdapter::new(LinearClient::new(tracker_config))` is the construction path
- `LinearClient` requires a `TrackerConfig` with `api_key`, `project_slug`, `endpoint`, and `active_states` populated
- Write ops are stubs — if S06 needs `create_comment` or `update_issue_state`, implement the GraphQL mutations in `LinearAdapter` (see Elixir `adapter.ex` for the mutation queries and state-lookup pattern)

### What's fragile
- mockito FIFO ordering — tests that make multiple requests to the same endpoint depend on mock creation order matching request order. If test structure changes, mock ordering must match.
- `assignee: "me"` triggers an extra viewer query before the main fetch — tests for this pattern need two mocks in sequence (viewer then candidates).

### Authoritative diagnostics
- `cargo test --test linear_client_tests` — definitive proof of all Linear client behaviors
- `tracing::info!` on fetch start/completion — look for `operation=` field in structured logs
- `SymphonyError::Display` — all error variants include context for root-cause diagnosis

### What assumptions changed
- T01 assumed `pub(crate)` was sufficient for test access — corrected in T02 to `pub` because integration tests are external crates (D019)
