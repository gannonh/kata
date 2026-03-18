# S03: Linear Tracker Client — Research

**Date:** 2026-03-16

## Summary

S03 implements the Linear GraphQL client that powers all tracker reads in the orchestrator. It owns R003 (Linear Issue Tracker Client) and supports R009 (Structured Logging with issue context fields). The scope is three operations — `fetch_candidate_issues`, `fetch_issues_by_states`, and `fetch_issue_states_by_ids` — plus full issue normalization (labels lowercase, blockers from inverse relations, priority coercion, ISO-8601 timestamp parsing, assignee routing filter).

The Elixir reference implementation in `linear/client.ex` (~400 LOC) is well-structured and directly portable to idiomatic Rust. The client is a thin GraphQL HTTP wrapper with normalization logic. `reqwest 0.12` with the `json` feature (already in Cargo.toml) provides everything needed for async HTTP POST with JSON bodies, timeouts, and custom headers. No new dependencies are required.

Testing strategy is unit tests with mock GraphQL responses — no real Linear API calls. The Elixir reference exposes `_for_test` helpers (normalization, pagination merge, fetch-by-IDs with injectable graphql function). In Rust, we achieve testability by making the HTTP transport injectable (either as a trait parameter or by testing normalization/pagination functions directly).

## Recommendation

Implement S03 as three files mirroring the Elixir structure:

1. **`src/linear/client.rs`** — GraphQL HTTP transport (`graphql()` function), three fetch operations with pagination, and the `normalize_issue` function with all normalization rules.
2. **`src/linear/adapter.rs`** — `TrackerAdapter` trait definition + Linear implementation that delegates to `client.rs`. The trait provides the boundary for S06's orchestrator to call without coupling to Linear specifics.
3. **`src/linear/mod.rs`** — Module re-exports.

Make the HTTP transport injectable for testing: accept a `reqwest::Client` (or a trait) so tests can provide a mock HTTP layer. Alternatively, test normalization and pagination helpers as pure functions (the Elixir approach with `_for_test` functions).

Key design: the `LinearClient` struct holds a `reqwest::Client` + `TrackerConfig` reference. The `TrackerAdapter` trait defines the three operations that S06 consumes. The adapter pattern supports future non-Linear trackers (R017, deferred).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| HTTP POST with JSON body | `reqwest 0.12` (already in Cargo.toml) | Async, supports `json` feature for serde serialization, timeouts, custom headers |
| JSON deserialization | `serde_json 1` (already in Cargo.toml) | Standard Rust JSON; use `serde_json::Value` for flexible GraphQL response parsing |
| ISO-8601 datetime parsing | `chrono 0.4` (already in Cargo.toml) | `DateTime::parse_from_rfc3339` handles ISO-8601 with timezone offsets |
| Structured logging | `tracing 0.1` (already in Cargo.toml) | Already used in S02; add `issue_id`, `issue_identifier` context fields per R009 |
| Domain types | `domain.rs` (S01) | `Issue`, `BlockerRef`, `TrackerConfig` all exist and match the spec |
| Error types | `error.rs` (S01) | All Linear error variants already defined: `LinearApiRequest`, `LinearApiStatus`, `LinearGraphqlErrors`, `LinearUnknownPayload`, `LinearMissingEndCursor` |

## Existing Code and Patterns

- `src/domain.rs` — `Issue`, `BlockerRef`, `TrackerConfig` (with `ApiKey`, `active_states`, `terminal_states`, `assignee`, `project_slug`, `endpoint`). Import with `use symphony::domain::*`. All fields needed for normalization are present.
- `src/error.rs` — All Linear error variants pre-defined: `MissingLinearApiToken`, `MissingLinearProjectSlug`, `LinearApiRequest(String)`, `LinearApiStatus(u16)`, `LinearGraphqlErrors(String)`, `LinearUnknownPayload`, `LinearMissingEndCursor`. `Result<T>` alias ready.
- `src/config.rs` — `RawTrackerConfig` pattern (intermediate serde structs separate from domain types). Follow this for any new serde deserialization.
- `src/lib.rs` — Module stubs commented out; `pub mod linear;` needs to be added. The `// pub mod linear;` comment exists as a placeholder.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/linear/client.ex` — The reference implementation. Three GraphQL query strings, pagination loop, normalization, assignee routing. **Must match behavior exactly.**
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/tracker.ex` — Trait (Elixir behaviour) definition with 5 callbacks: `fetch_candidate_issues`, `fetch_issues_by_states`, `fetch_issue_states_by_ids`, `create_comment`, `update_issue_state`.
- `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/linear/adapter.ex` — Linear adapter delegates to client, adds `create_comment` and `update_issue_state` mutations (used by the optional `linear_graphql` tool, not by S03 core).
- `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/workspace_and_config_test.exs` (lines 310-470) — Tests for normalization, blocker extraction, assignee filtering, pagination merge, and batched ID fetch with mock graphql function.

## Constraints

- **No new dependencies.** `reqwest 0.12` with `json` feature, `serde_json`, `chrono`, and `tracing` are already in `Cargo.toml` and sufficient.
- **Async context required.** `reqwest` async client needs a tokio runtime. Tests must use `#[tokio::test]`.
- **API key must never appear in logs.** `TrackerConfig.api_key` is `Option<ApiKey>` which prints `[REDACTED]` on Debug (D014). The Authorization header value must also not be logged.
- **Authorization header format.** The Elixir reference sends the raw API key as the `Authorization` header value (not `Bearer <token>`). The spec says "Auth token sent in `Authorization` header" (§11.2). Must match this behavior.
- **Page size = 50** (spec §11.2). The Elixir uses `@issue_page_size 50` consistently.
- **Network timeout = 30,000ms** (spec §11.2). Applied to each individual GraphQL request.
- **`fetch_issues_by_states([])` must return `Ok(vec![])` without making an API call** (spec §17.3).
- **`fetch_issue_states_by_ids([])` must return `Ok(vec![])` without making an API call** (spec §17.3).
- **ID-based fetch must preserve requested order** — the Elixir builds an `issue_order_index` map and sorts results to match the input ID ordering.
- **ID-based fetch paginates in batches of 50** — the Elixir splits IDs into chunks of `@issue_page_size` and makes separate GraphQL requests for each batch.
- **Blockers from inverse relations only where `type == "blocks"` (case-insensitive)** — the Elixir lowercases and trims the relation type before comparing.
- **Labels lowercased** — `String::downcase` in Elixir; `.to_lowercase()` in Rust.
- **Priority must be integer or null** — non-integer values become `None`.
- **`assigned_to_worker` field** — not in the spec but present in the Elixir impl and our `domain.rs`. When `tracker.assignee` is configured, issues whose assignee doesn't match get `assigned_to_worker: false`. When unconfigured, all issues get `true`.
- **`tracker.assignee = "me"` triggers a viewer query** — the Elixir resolves the current user's ID via a `viewer { id }` GraphQL query, then uses that for matching.

## Common Pitfalls

- **Authorization header is raw token, not Bearer.** Linear's API accepts the API key directly in the `Authorization` header. Using `reqwest`'s `.bearer_auth()` would prefix it with `Bearer `, which is wrong. Must use `.header("Authorization", api_key)` instead.
- **GraphQL `[ID!]` type for issue-state-by-IDs query.** The spec explicitly calls out (§11.2, §17.3) that the ID variable must use GraphQL `[ID!]` typing, not `[String!]`. The Elixir query uses `$ids: [ID!]!` — must match this exactly.
- **Pagination cursor `endCursor` can be null even when `hasNextPage` is true.** The Elixir returns `{:error, :linear_missing_end_cursor}` in this case. Must handle this edge case.
- **Error body logging for non-200 responses.** The Elixir truncates error response bodies to 1000 bytes and logs them. Must replicate this for operator diagnostics without leaking secrets.
- **`fetch_issues_by_states` does NOT apply assignee filter.** Looking at the Elixir code, `fetch_issues_by_states` passes `nil` as the assignee filter (used for startup terminal cleanup, where all issues regardless of assignee should be found). Only `fetch_candidate_issues` and `fetch_issue_states_by_ids` apply the assignee filter.
- **Deduplication of input IDs.** `fetch_issue_states_by_ids` deduplicates input IDs before querying (`Enum.uniq(issue_ids)`). Must replicate.
- **Deduplication of state names.** `fetch_issues_by_states` deduplicates and stringifies state names (`Enum.map(state_names, &to_string/1) |> Enum.uniq()`). Must replicate.
- **`reqwest::Client` should be reused.** Creating a new `reqwest::Client` per request is expensive (allocates a connection pool). Create once in `LinearClient::new()` and reuse.

## Open Risks

- **`tracker.assignee = "me"` viewer resolution requires a live Linear API call.** This can't be tested without a mock HTTP layer. Need to ensure the viewer query path is testable. The Elixir solves this by testing normalization separately from the full fetch path.
- **Linear API rate limits.** The client makes multiple requests for paginated fetches. Linear's API has rate limits that could affect large projects. The Elixir doesn't implement explicit rate limiting — it relies on the polling interval (30s default) to space out requests. Same approach for Rust.
- **`reqwest` error types.** Transport errors (DNS failure, connection refused, timeout) must map to `SymphonyError::LinearApiRequest`. Non-200 HTTP status must map to `SymphonyError::LinearApiStatus`. Need to handle both correctly.
- **The `create_comment` and `update_issue_state` adapter methods exist in the Elixir but are NOT consumed by S03 or the orchestrator.** They're used by the `linear_graphql` client-side tool in S05. Including them in the trait definition now (with `unimplemented!()` body) or deferring to S05 is a design choice. Recommend defining the trait with all 5 methods (matching Elixir) but only implementing the 3 read operations in S03, with the 2 write operations returning `SymphonyError::Other("not implemented")` until S05.

## Elixir Reference Key Behaviors to Match

### GraphQL Queries (from `client.ex`)

1. **Candidate fetch query** (`@query`) — filters by `project.slugId.eq` and `state.name.in`, fetches `inverseRelations` with `$relationFirst` parameter, uses cursor-based pagination with `$after`.
2. **ID-based fetch query** (`@query_by_ids`) — filters by `id.in`, same node shape as candidate query but no `pageInfo` (batched manually by splitting IDs into chunks of 50).
3. **Viewer query** (`@viewer_query`) — simple `viewer { id }` query for resolving `"me"` assignee.

### Pagination (from `do_fetch_by_states_page`)

- Accumulate issues via `prepend_page_issues` (Elixir `Enum.reverse(issues, acc)`) then finalize with `Enum.reverse(acc)`. This preserves page order: page 1 first, page 2 second, etc.
- Check `next_page_cursor`: `hasNextPage=true` + valid `endCursor` → continue; `hasNextPage=true` + null cursor → error; otherwise → done.

### ID-Based Fetch Pagination (from `do_fetch_issue_states_page`)

- Split IDs into batches of 50. For each batch, query with `first: batch.len()`.
- Build an `issue_order_index` map (ID → position) from the original input order.
- After all batches collected, sort results by the original order using the index map.

### Normalization (from `normalize_issue`)

- `priority` → `parse_priority`: integer stays, anything else → `None`
- `state` → `get_in(issue, ["state", "name"])` (nested extraction)
- `labels` → extract from `labels.nodes[].name`, reject nil, lowercase all
- `blocked_by` → extract from `inverseRelations.nodes[]` where `type.downcase.trim == "blocks"`, map to `{id, identifier, state.name}`
- `assignee_id` → from `assignee.id` (nil-safe)
- `assigned_to_worker` → compare assignee ID against filter (if no filter → `true`)
- `created_at`, `updated_at` → ISO-8601 parse, nil on failure
- `branch_name` → from `branchName`

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Rust async patterns | thebushidocollective/han@rust-async-patterns | available (14 installs) — not directly needed for this HTTP-focused slice |
| Rust ecosystem | huiali/rust-skills@rust-ecosystem | available (9 installs) — generic, low relevance |
| GraphQL client | — | none found for Rust GraphQL client specifically |
| Linear API | — | none found (built-in Linear extension in Kata covers this) |

No skills are recommended for installation — the work is straightforward HTTP + JSON with well-understood patterns already established in the codebase.

## Sources

- Spec §11 (Issue Tracker Integration Contract) — defines three required operations, query semantics, normalization rules, error categories (source: `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 1153-1270)
- Spec §17.3 (Issue Tracker Client conformance) — defines behavioral test expectations (source: `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 1980-1990)
- Spec §4.1.1 (Issue entity) — normalized field definitions (source: `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 138-170)
- Spec §5.3.1 (tracker config) — field definitions, defaults, env resolution (source: `/Volumes/EVO/kata/openai-symphony/SPEC.md` lines 339-360)
- Elixir `linear/client.ex` — complete reference implementation with queries, pagination, normalization, assignee routing (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/linear/client.ex`)
- Elixir `linear/adapter.ex` — trait pattern with comment/state-update mutations (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/linear/adapter.ex`)
- Elixir `tracker.ex` — behaviour (trait) with 5 callbacks (source: `/Volumes/EVO/kata/openai-symphony/elixir/lib/symphony_elixir/tracker.ex`)
- Elixir test `workspace_and_config_test.exs` lines 310-470 — normalization, blocker, pagination, and ID-batch tests (source: `/Volumes/EVO/kata/openai-symphony/elixir/test/symphony_elixir/workspace_and_config_test.exs`)
- reqwest docs — JSON POST, bearer auth, timeout (source: `get_library_docs /websites/rs_reqwest`)
