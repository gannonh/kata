---
id: T01
parent: S03
milestone: M001
provides:
  - LinearClient struct with GraphQL HTTP transport
  - Three async fetch operations (candidates, by-states, by-IDs)
  - Issue normalization (14 fields from raw JSON)
  - Cursor-based pagination for candidates
  - Batch-splitting (chunks of 50) with order preservation for ID-based fetch
  - Assignee routing filter with "me" viewer resolution
  - pub mod linear in lib.rs
key_files:
  - src/linear/client.rs
  - src/linear/mod.rs
  - src/lib.rs
key_decisions:
  - AssigneeFilter is pub(crate) struct, not pub — only adapter layer (T02) exposes trait methods
  - normalize_issue is pub(crate) to allow T02 integration tests to call it directly
  - PageInfo/PageCursorResult are private internal types — pagination is an implementation detail
patterns_established:
  - GraphQL transport pattern: POST JSON with raw Authorization header, map errors to typed SymphonyError variants
  - Normalization pattern: serde_json::Value → Option<Issue> via extraction functions
  - Pagination pattern: reverse+prepend accumulation with final reverse (mirrors Elixir)
  - Order preservation pattern: build_order_index HashMap before fetch, sort_by_requested_order after
observability_surfaces:
  - tracing::info! on fetch start (operation name) and completion (issue count)
  - tracing::warn! on non-200 responses with truncated body (≤1000 bytes)
  - tracing::error! on transport failures
  - Error variants carry context (status code, truncated body, error message)
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Implement LinearClient with GraphQL transport, normalization, and pagination

**Implemented complete LinearClient with 3 async fetch operations, GraphQL transport, issue normalization, cursor pagination, batched ID fetch with order preservation, and assignee routing — zero errors, zero warnings.**

## What Happened

Ported the Elixir `SymphonyElixir.Linear.Client` module to idiomatic Rust across 750 LOC. The implementation covers:

1. **GraphQL transport** (`graphql()`) — async POST to Linear API with raw API key in `Authorization` header (not Bearer), JSON payload, 30s timeout. Error mapping: transport → `LinearApiRequest`, non-200 → `LinearApiStatus` (with truncated body logging), GraphQL errors → `LinearGraphqlErrors`, unknown payload → `LinearUnknownPayload`.

2. **Three fetch operations**:
   - `fetch_candidates()` — validates config, resolves assignee filter (including `"me"` viewer query), cursor-paginates through active states.
   - `fetch_issues_by_states()` — deduplicates state names, does NOT apply assignee filter (used for terminal cleanup), cursor-paginates.
   - `fetch_issue_states_by_ids()` — deduplicates IDs, resolves assignee filter, batches in chunks of 50, preserves original input order via order index map.

3. **Normalization** — extracts all 14 Issue fields from raw JSON. Labels lowercased, nil labels rejected. Blockers filtered by `type.to_lowercase().trim() == "blocks"`. Priority: integer stays, anything else → None. Datetimes: RFC-3339 parse, None on failure. `branch_name` from `branchName`.

4. **Assignee routing** — `AssigneeFilter` with `HashSet<String>` match values. No filter → `assigned_to_worker: true`. Filter match → true. Filter mismatch → false. `"me"` resolves via `viewer { id }` query.

5. **Pagination** — Reverse+prepend accumulation pattern (mirrors Elixir's `Enum.reverse(issues, acc)`) with final reverse. Handles `hasNextPage=true` + null `endCursor` → `LinearMissingEndCursor` error.

Three GraphQL query strings match the Elixir reference exactly (operation names, variable types including `[ID!]` for IDs, field selections, `$after` cursor, `$relationFirst` parameter).

## Verification

- `cargo build` — zero errors, zero warnings ✅
- `cargo test` — all 47 existing tests pass (15 config, 13 domain, 19 workflow) ✅
- Manual review: all three GraphQL query strings match Elixir reference field-by-field ✅
- All 18 must-have items from the task plan verified against the code ✅

**Slice-level verification status (intermediate — T02 pending):**
- `cargo test --test linear_client_tests` — test file does not exist yet (T02 creates it) ⏳
- `cargo build` — zero errors, zero warnings ✅
- `cargo test` — all existing tests still pass ✅

## Diagnostics

- `tracing::info!` logs on fetch start (operation name) and completion (issue count) — inspect via tracing subscriber
- `tracing::warn!` on non-200 responses includes truncated body ≤1000 bytes
- `tracing::error!` on transport failures includes error message
- Error variants carry descriptive strings surfaced via `SymphonyError::Display`
- API key never logged: `ApiKey::Debug` prints `[REDACTED]`, Authorization header value never in log output

## Deviations

- Removed `#[cfg(test)]` helper functions (`normalize_issue_for_test`, `normalize_issue_with_assignee_for_test`) from T01 output. These were causing dead_code warnings since no tests exist in this task. T02 will add equivalent test helpers when creating the integration test suite.

## Known Issues

None.

## Files Created/Modified

- `src/linear/mod.rs` — Module declaration re-exporting `client` submodule, with placeholder comment for `adapter` (T02)
- `src/linear/client.rs` — Complete LinearClient implementation (~750 LOC): GraphQL transport, 3 fetch operations, normalization, pagination, assignee routing, error mapping
- `src/lib.rs` — Added `pub mod linear;` (replaced commented-out placeholder)
