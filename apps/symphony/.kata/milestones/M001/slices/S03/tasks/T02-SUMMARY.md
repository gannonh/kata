---
id: T02
parent: S03
milestone: M001
provides:
  - TrackerAdapter trait with 5 async methods (3 read, 2 write stub)
  - LinearAdapter struct implementing TrackerAdapter via LinearClient delegation
  - 33-test comprehensive integration test suite covering all S03 verification items
  - normalize_issue and AssigneeFilter promoted to pub for external test access
key_files:
  - src/linear/adapter.rs
  - src/linear/mod.rs
  - tests/linear_client_tests.rs
  - Cargo.toml
key_decisions:
  - normalize_issue and AssigneeFilter promoted from pub(crate) to pub — integration tests are external to the crate and need direct access for normalization verification
  - async-trait crate used for TrackerAdapter — Rust doesn't yet have native async fn in traits with dyn dispatch; async-trait is the standard solution
  - mockito used for HTTP-level mocking — tests the full stack (client HTTP → normalization → response) without needing injected closures or trait-based transports
  - Write operations (create_comment, update_issue_state) return SymphonyError::Other("not implemented") matching task plan — full implementation deferred
patterns_established:
  - MockHTTP test pattern: mockito::Server per test, FIFO mock ordering for multi-request sequences (pagination, viewer+candidates)
  - TrackerAdapter trait pattern: async_trait with Send+Sync bounds for use in orchestrator loop
observability_surfaces:
  - All observability from T01 preserved (tracing::info/warn/error, error variant context strings)
  - Adapter layer is a thin delegation — no additional logging needed at adapter boundary
duration: 12m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Implement TrackerAdapter trait and LinearAdapter, add comprehensive test suite

**Defined TrackerAdapter trait with 5 async methods, implemented LinearAdapter delegating to LinearClient, and built 33-test suite proving all normalization, pagination, error mapping, assignee routing, and edge-case behaviors.**

## What Happened

1. **TrackerAdapter trait** (`src/linear/adapter.rs`) — Defined with 5 async methods matching the Elixir `SymphonyElixir.Tracker` behaviour callbacks: `fetch_candidate_issues`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`, `create_comment`, `update_issue_state`. Uses `async_trait` for trait-object compatibility. Bounded `Send + Sync` for use in the orchestrator's async loop (S06).

2. **LinearAdapter** (`src/linear/adapter.rs`) — Wraps `LinearClient` and delegates the 3 read operations. Write operations (`create_comment`, `update_issue_state`) return `SymphonyError::Other("not implemented")` — matching the Elixir adapter's full implementation but deferred since no slice currently requires write ops.

3. **Test suite** (`tests/linear_client_tests.rs`) — 33 tests using `mockito` for HTTP-level mocking. Coverage:
   - **Normalization (8 tests):** full field extraction, labels lowercase, blockers filtered by type, blocker type case-insensitive/trimmed, priority coercion (int/string/null), datetime parsing (valid/invalid), branch_name mapping, non-object returns None
   - **Assignee routing (4 tests):** no filter → all true, filter match → true, filter mismatch → false, null assignee with filter → false
   - **Pagination (2 tests):** multi-page candidate fetch preserves order, single-page fetch
   - **ID-based fetch (2 tests):** order preservation with reversed server response, batched beyond 50 (60 IDs → 2 batches)
   - **Empty-input short circuits (2 tests):** fetch_issues_by_states([]) and fetch_issue_states_by_ids([])
   - **State/ID deduplication (2 tests):** duplicate state names, duplicate IDs
   - **No assignee filter on state-fetch (1 test):** fetch_issues_by_states ignores configured assignee
   - **Error mapping (5 tests):** transport error, non-200 status, GraphQL errors, unknown payload, missing end cursor
   - **Adapter trait (5 tests):** fetch_candidates, fetch_by_states, fetch_by_ids via adapter, create_comment not-implemented, update_issue_state not-implemented
   - **Viewer "me" resolution (2 tests):** me-assignee resolves via viewer query then filters, me-assignee filters out non-matching

4. **Visibility changes** — `normalize_issue` and `AssigneeFilter` promoted from `pub(crate)` to `pub` since integration tests are external to the crate. This is the idiomatic Rust approach for testing internal functions via the `tests/` directory.

## Verification

- `cargo test --test linear_client_tests` — 33 tests pass ✅
- `cargo build` — zero errors, zero warnings ✅
- `cargo test` — all 80 tests pass (15 config + 13 domain + 33 linear + 19 workflow) ✅

**Slice-level verification (all items from S03-PLAN.md):**
- ✅ Normalization: full field extraction, labels lowercase, blockers filtered by type, priority coercion, datetime parsing, branch_name mapping
- ✅ Assignee routing: assigned (match), not assigned (mismatch), no filter (all true)
- ✅ Pagination: multi-page candidate fetch preserves order
- ✅ ID-based fetch: batched beyond 50, original order preserved
- ✅ Empty-input short circuits for both fetch_issues_by_states and fetch_issue_states_by_ids
- ✅ Error mapping: transport error, non-200 status, GraphQL errors, unknown payload, missing end cursor
- ✅ fetch_issues_by_states does NOT apply assignee filter
- ✅ State name deduplication, ID deduplication
- ✅ `cargo build` — zero errors, zero warnings
- ✅ `cargo test` — all existing tests still pass

## Diagnostics

All observability from T01 preserved. The adapter is a thin delegation layer — no additional logging at the adapter boundary. Test suite uses mockito for HTTP mocking, producing clear assertion failures on mock mismatch.

## Deviations

- `normalize_issue` and `AssigneeFilter` changed from `pub(crate)` to `pub`. T01 summary noted these as `pub(crate)` for T02 integration tests, but Rust integration tests (`tests/` dir) are external crates and require `pub` visibility. This is the correct Rust idiom.
- Test count is 33 (exceeding the 15+ minimum). Additional tests were added for completeness: non-object normalization, single-page fetch, null-assignee with filter, viewer "me" resolution, blocker type case-insensitivity.

## Known Issues

None.

## Files Created/Modified

- `src/linear/adapter.rs` — New: TrackerAdapter trait (5 async methods) + LinearAdapter implementation
- `src/linear/mod.rs` — Updated: export `adapter` module alongside `client`
- `src/linear/client.rs` — Changed: `normalize_issue` pub(crate)→pub, `AssigneeFilter` pub(crate)→pub
- `tests/linear_client_tests.rs` — New: 33-test comprehensive integration test suite
- `Cargo.toml` — Added: async-trait, mockito, tokio-test dependencies
