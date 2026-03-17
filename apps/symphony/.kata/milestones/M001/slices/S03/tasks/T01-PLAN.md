---
estimated_steps: 5
estimated_files: 3
---

# T01: Implement LinearClient with GraphQL transport, normalization, and pagination

**Slice:** S03 — Linear Tracker Client
**Milestone:** M001

## Description

Implement the complete `LinearClient` — the GraphQL HTTP transport layer, all three fetch operations (`fetch_candidates`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`), issue normalization, cursor-based pagination for candidates, batch-splitting with order preservation for ID-based fetches, and the assignee routing filter with `"me"` viewer resolution. This is the bulk of the slice's logic, directly porting the Elixir `linear/client.ex` behavior to idiomatic Rust.

## Steps

1. **Create `src/linear/mod.rs`** — Re-export `client` and (placeholder) `adapter` submodules. Add `pub mod linear;` to `src/lib.rs` (replace the commented-out placeholder).

2. **Implement `LinearClient` struct and GraphQL transport in `src/linear/client.rs`** — `LinearClient` holds a `reqwest::Client` (reused, not per-request) and cloned `TrackerConfig`. The `graphql()` method POSTs JSON `{ query, variables }` to `tracker.endpoint` with `Authorization: <raw_api_key>` header (NOT Bearer), `Content-Type: application/json`, and 30s timeout. Map transport errors to `SymphonyError::LinearApiRequest`, non-200 status to `LinearApiStatus` (log truncated body ≤1000 bytes), GraphQL `errors` field to `LinearGraphqlErrors`, unknown payload shape to `LinearUnknownPayload`. Include the three GraphQL query strings matching the Elixir reference exactly (field names, variable types, `$after` cursor, `[ID!]` typing for IDs, `$relationFirst` parameter).

3. **Implement normalization functions** — `normalize_issue(raw: &serde_json::Value, assignee_filter: Option<&AssigneeFilter>) -> Option<Issue>`: extract all fields from the JSON node. `parse_priority()` → integer or None. `extract_labels()` → lowercase, reject nil. `extract_blockers()` → filter `inverseRelations.nodes` where `type.to_lowercase().trim() == "blocks"`, map to `BlockerRef`. `parse_datetime()` → `chrono::DateTime::parse_from_rfc3339`, None on failure. `assignee_field()` → nil-safe nested access. `assigned_to_worker()` → compare assignee ID against filter; no filter → true.

4. **Implement three fetch operations with pagination** —
   - `fetch_candidates(&self) -> Result<Vec<Issue>>`: validate api_key + project_slug present, resolve assignee filter (including `"me"` viewer query), then paginate with cursor (`do_fetch_by_states_page` equivalent). Accumulate with reverse+prepend pattern for correct ordering. Handle `hasNextPage=true` + null `endCursor` → `LinearMissingEndCursor`.
   - `fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>>`: dedup + stringify states, return `Ok(vec![])` for empty. Validate api_key + project_slug. Call same pagination loop but with `assignee_filter = None`.
   - `fetch_issue_states_by_ids(&self, ids: &[String]) -> Result<Vec<Issue>>`: dedup IDs, return `Ok(vec![])` for empty. Resolve assignee filter. Split into chunks of 50, query each batch. Build order index map (ID → position), sort results to match original input order.

5. **Implement assignee routing filter** — `AssigneeFilter` struct with `match_values: HashSet<String>`. `build_assignee_filter(assignee: &str) -> Result<Option<AssigneeFilter>>`: trim, empty → None, `"me"` → viewer query to resolve user ID, otherwise → direct HashSet with the value. `resolve_viewer_assignee_filter(&self) -> Result<AssigneeFilter>`: execute `viewer { id }` query, extract `data.viewer.id`, error if missing.

## Must-Haves

- [ ] `LinearClient::new(config: TrackerConfig)` creates a reusable `reqwest::Client` with 30s timeout
- [ ] `graphql()` sends raw API key in Authorization header (not Bearer-prefixed)
- [ ] Three GraphQL query strings match Elixir reference (field names, variable types including `[ID!]`)
- [ ] `normalize_issue()` produces correct `Issue` from raw JSON (all 14 fields)
- [ ] Labels lowercased, nil labels rejected
- [ ] Blockers filtered by `type.to_lowercase().trim() == "blocks"` only
- [ ] Priority: integer stays, anything else → None
- [ ] Datetimes: ISO-8601 parse, None on failure
- [ ] `assigned_to_worker`: no filter → true; filter match → true; filter mismatch → false
- [ ] Cursor pagination for candidates preserves page order
- [ ] ID-based fetch splits into chunks of 50, preserves original input order
- [ ] `fetch_issues_by_states([])` and `fetch_issue_states_by_ids([])` return `Ok(vec![])` without API call
- [ ] State name deduplication and ID deduplication before querying
- [ ] `fetch_issues_by_states` does NOT apply assignee filter
- [ ] Error mapping: transport → `LinearApiRequest`, non-200 → `LinearApiStatus`, GraphQL errors → `LinearGraphqlErrors`, unknown → `LinearUnknownPayload`, null cursor → `LinearMissingEndCursor`
- [ ] Non-200 response body logged truncated to ≤1000 bytes
- [ ] `pub mod linear;` in `src/lib.rs`

## Verification

- `cargo build` — zero errors, zero warnings
- `cargo test` — existing tests (domain_tests, workflow_config_tests) still pass
- Manual review: GraphQL query strings match Elixir reference field-by-field

## Observability Impact

- Signals added/changed: `tracing::info!` on fetch start (operation name) and completion (issue count); `tracing::warn!` for non-200 responses with truncated body; `tracing::error!` for transport failures. Issue-context fields (`issue_id`, `issue_identifier`) on per-issue log spans where applicable.
- How a future agent inspects this: Trace logs from `LinearClient` operations show operation type, issue count, and error details.
- Failure state exposed: Error variants carry descriptive strings (status code, truncated body, transport error message) surfaced via `SymphonyError::Display`.

## Inputs

- `src/domain.rs` — `Issue`, `BlockerRef`, `TrackerConfig`, `ApiKey` structs from S01
- `src/error.rs` — All Linear error variants (`LinearApiRequest`, `LinearApiStatus`, `LinearGraphqlErrors`, `LinearUnknownPayload`, `LinearMissingEndCursor`, `MissingLinearApiToken`, `MissingLinearProjectSlug`) and `Result<T>` alias from S01
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/linear/client.ex` — Elixir reference (query strings, normalization, pagination logic)
- S03-RESEARCH.md — constraints, pitfalls, and behavioral details

## Expected Output

- `src/linear/mod.rs` — Module re-exports for `client` and `adapter`
- `src/linear/client.rs` — Complete `LinearClient` implementation (~400 LOC) with GraphQL transport, three fetch operations, normalization, pagination, assignee routing
- `src/lib.rs` — Updated with `pub mod linear;`
