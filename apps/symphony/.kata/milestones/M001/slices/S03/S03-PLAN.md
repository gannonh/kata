# S03: Linear Tracker Client

**Goal:** A working `LinearClient` behind a `TrackerAdapter` trait that fetches candidate issues (with pagination), refreshes issue states by IDs (batched, order-preserving), fetches issues by state names (for terminal cleanup), and normalizes all results to domain `Issue` — all proven by unit tests with mock HTTP responses.

**Demo:** `cargo test --test linear_client_tests` passes 15+ tests proving all three fetch operations, pagination, normalization (labels lowercase, blocker extraction, priority coercion, assignee routing, datetime parsing), batched ID fetch with order preservation, empty-input short circuits, and error mapping.

## Must-Haves

- `LinearClient` struct wrapping `reqwest::Client` + `TrackerConfig`, with three async fetch methods matching Elixir `client.ex` behavior
- `TrackerAdapter` trait with 5 methods (3 read implemented, 2 write returning `SymphonyError::Other("not implemented")`)
- `LinearAdapter` implementing `TrackerAdapter` by delegating to `LinearClient`
- GraphQL queries matching Elixir reference: candidate poll (with pagination + `$after`), ID-based fetch (batched in chunks of 50), viewer query (for `assignee = "me"`)
- Pagination: cursor-based for candidates, batch-splitting for IDs with original-order preservation
- Normalization: labels lowercase, blockers from inverse relations where `type == "blocks"` (case-insensitive, trimmed), priority integer-or-None, ISO-8601 datetime parsing, assignee routing filter, `branch_name` from `branchName`
- Empty-input guards: `fetch_issues_by_states([])` and `fetch_issue_states_by_ids([])` return `Ok(vec![])` without API call
- State name deduplication in `fetch_issues_by_states`, ID deduplication in `fetch_issue_states_by_ids`
- Authorization header sends raw API key (not `Bearer`-prefixed)
- Page size = 50, network timeout = 30,000ms
- Error mapping: transport → `LinearApiRequest`, non-200 → `LinearApiStatus`, GraphQL errors → `LinearGraphqlErrors`, unknown payload → `LinearUnknownPayload`, null cursor with hasNextPage → `LinearMissingEndCursor`
- Structured logging with `issue_id`, `issue_identifier` context fields (R009)
- API key never logged (D014)
- `src/lib.rs` updated to export `pub mod linear`

## Proof Level

- This slice proves: contract (all behavior verified against mock GraphQL responses; no live Linear API)
- Real runtime required: no (mock HTTP layer replaces real requests)
- Human/UAT required: no

## Verification

- `cargo test --test linear_client_tests` — 15+ tests covering:
  - Normalization: full field extraction, labels lowercase, blockers filtered by type, priority coercion, datetime parsing, branch_name mapping
  - Assignee routing: assigned (match), not assigned (mismatch), no filter (all true)
  - Pagination: multi-page candidate fetch preserves order
  - ID-based fetch: batched beyond 50, original order preserved
  - Empty-input short circuits for both `fetch_issues_by_states` and `fetch_issue_states_by_ids`
  - Error mapping: transport error, non-200 status, GraphQL errors, unknown payload, missing end cursor
  - `fetch_issues_by_states` does NOT apply assignee filter
  - State name deduplication, ID deduplication
- `cargo build` — zero errors, zero warnings
- `cargo test` — all existing tests (domain_tests, workflow_config_tests) still pass

## Observability / Diagnostics

- Runtime signals: `tracing::info!` on fetch start with issue count on completion; `tracing::warn!` on non-200 responses with truncated body (≤1000 bytes); `tracing::error!` on transport failures. All issue-related logs carry `issue_id` and `issue_identifier` span fields where applicable.
- Inspection surfaces: none (no runtime server in this slice — pure library code)
- Failure visibility: Error variants carry context strings (status code, truncated response body, error message). `SymphonyError::Display` surfaces these to callers.
- Redaction constraints: `ApiKey` Debug prints `[REDACTED]` (D014). Authorization header value never logged. Error body logging truncates to 1000 bytes to prevent secret leakage in malformed responses.

## Integration Closure

- Upstream surfaces consumed: `src/domain.rs` (Issue, BlockerRef, TrackerConfig, ApiKey), `src/error.rs` (all Linear error variants, Result<T>)
- New wiring introduced in this slice: `pub mod linear` in `src/lib.rs`; `TrackerAdapter` trait definition (S06 consumes this); `LinearClient` struct + `LinearAdapter` struct
- What remains before the milestone is truly usable end-to-end: S04 (workspace + prompt), S05 (Codex app-server), S06 (orchestrator loop wiring `TrackerAdapter` into poll cycle), S07 (HTTP dashboard), S08 (SSH), S09 (conformance sweep)

## Tasks

- [x] **T01: Implement LinearClient with GraphQL transport, normalization, and pagination** `est:45m`
  - Why: This is the core implementation — the GraphQL HTTP transport, all three fetch operations, normalization logic, pagination, and assignee routing. Without this, there are no fetch operations to test or adapt.
  - Files: `src/linear/mod.rs`, `src/linear/client.rs`, `src/lib.rs`
  - Do: Create `src/linear/mod.rs` with re-exports. Implement `LinearClient` struct (holds `reqwest::Client` + `TrackerConfig` clone) with `new()`, `graphql()` (async POST with JSON body, raw Authorization header, 30s timeout), `fetch_candidates()`, `fetch_issues_by_states()`, `fetch_issue_states_by_ids()`. Implement `normalize_issue()`, `extract_labels()`, `extract_blockers()`, `parse_priority()`, `parse_datetime()`, `assignee_filter` logic with `"me"` viewer resolution. Implement cursor-based pagination for candidates and batch-splitting for ID-based fetch with order preservation. Add `pub mod linear;` to `src/lib.rs`. Match all Elixir `client.ex` behaviors exactly.
  - Verify: `cargo build` succeeds with zero errors, zero warnings
  - Done when: All three fetch methods, normalization, pagination, and assignee routing compile and match the Elixir reference structure

- [x] **T02: Implement TrackerAdapter trait and LinearAdapter, add comprehensive test suite** `est:40m`
  - Why: The trait defines the contract S06 consumes. The test suite proves every normalization rule, pagination behavior, error mapping, and edge case — this is where the slice's proof lives.
  - Files: `src/linear/adapter.rs`, `src/linear/mod.rs`, `tests/linear_client_tests.rs`
  - Do: Define `TrackerAdapter` trait with 5 async methods (matching Elixir `tracker.ex` behaviour). Implement `LinearAdapter` delegating to `LinearClient` for 3 read ops; 2 write ops return `SymphonyError::Other("not implemented")`. Make the HTTP transport injectable for testing — either accept a closure/trait for `graphql()` calls or expose normalization + pagination helpers as `pub(crate)` functions testable directly. Write 15+ tests in `tests/linear_client_tests.rs` covering all verification items. Add structured tracing spans/logs with issue context fields.
  - Verify: `cargo test --test linear_client_tests` — all 15+ tests pass; `cargo test` — all tests pass (including domain_tests, workflow_config_tests)
  - Done when: `TrackerAdapter` trait defined, `LinearAdapter` wired, and every must-have behavior proven by at least one passing test

## Files Likely Touched

- `src/linear/mod.rs` (new)
- `src/linear/client.rs` (new)
- `src/linear/adapter.rs` (new)
- `src/lib.rs` (add `pub mod linear`)
- `tests/linear_client_tests.rs` (new)
