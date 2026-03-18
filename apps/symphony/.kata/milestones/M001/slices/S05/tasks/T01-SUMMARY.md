---
id: T01
parent: S05
milestone: M001
provides:
  - src/codex/mod.rs — codex module entry point declaring app_server and dynamic_tool submodules
  - src/codex/app_server.rs — compilable stubs for start_session, run_turn, stop_session with correct type signatures
  - src/codex/dynamic_tool.rs — complete linear_graphql implementation with argument normalisation, error formatting, and executor injection
  - src/linear/client.rs — graphql_raw public method (returns raw body without GraphQL-error promotion)
  - tests/codex_tests.rs — 14 passing dynamic_tool integration tests + app_server placeholder section
key_files:
  - src/codex/mod.rs
  - src/codex/dynamic_tool.rs
  - src/codex/app_server.rs
  - src/linear/client.rs
  - tests/codex_tests.rs
key_decisions:
  - "graphql_raw extracted from graphql via shared graphql_http helper: graphql retains GraphQL-error promotion; graphql_raw returns raw body for dynamic_tool error inspection"
  - "dynamic_tool executor is a generic FnOnce(String, Value) -> impl Future<Output = Result<Value, SymphonyError>> — enables zero-cost sync test injection without Arc/Box"
  - "Argument normalisation sentinel errors encoded as SymphonyError::Other(tag) to avoid adding codex-specific variants to the shared error enum"
patterns_established:
  - "Executor injection via generic FnOnce + Future bounds — pattern for all testable async dispatch in the codex module"
  - "Error tagging via SymphonyError::Other for module-local sentinel errors (avoids proliferating variants)"
observability_surfaces:
  - "None — dynamic_tool is a pure function module with no runtime side effects or logging"
duration: 25min
verification_result: passed
completed_at: 2026-03-17T17:00:00Z
blocker_discovered: false
---

# T01: Integration test suite and dynamic_tool module

**`dynamic_tool::execute` dispatches `linear_graphql` with full argument validation, error formatting, and executor injection; 14 codex integration tests pass with zero warnings.**

## What Happened

Created the `src/codex/` module structure and implemented `dynamic_tool.rs` as a complete port of the Elixir `DynamicTool` module. The core design challenge was executor injection: in Rust, async closures must be expressed as generic `FnOnce(String, Value) -> Fut where Fut: Future<Output = ...>` bounds — this works cleanly in tests (plain async closures) and in production (capturing a `LinearClient` reference).

Refactored `LinearClient::graphql` to use a new private `graphql_http` helper that handles the HTTP round-trip without checking for GraphQL-level errors. `graphql_raw` (public) simply calls `graphql_http` and returns the raw body; `graphql` calls `graphql_http` and then applies the existing GraphQL-error check. This avoids duplication and keeps the existing internal callers unchanged.

Argument normalisation mirrors the Elixir three-clause pattern: `Value::String` → raw query (trimmed), `Value::Object` → extract query + optional variables, anything else → invalid_arguments. Sentinel errors (missing_query, invalid_arguments, invalid_variables) are stored as `SymphonyError::Other(tag)` and matched in `tool_error_payload` before falling through to the structured error branches.

`app_server.rs` stubs define `SessionHandle`, `TurnResult`, `start_session`, `run_turn`, and `stop_session` with correct signatures, all returning `Err(SymphonyError::Other("not yet implemented"))` — clean compile, no panics.

## Verification

- `cargo test --test codex_tests` — 14 tests pass, 0 fail
- `cargo build` — zero errors, zero warnings
- `tool_specs()` output verified: name=`linear_graphql`, description contains "Linear", inputSchema has `required: ["query"]`, `variables` property defined

Tests cover: tool_specs contract, unsupported tool with supported-list, success with query+variables, raw string with trimming, operationName ignored, blank raw string rejection, missing/blank query in object, invalid argument types (array + number), non-object variables, GraphQL errors preserved with success=false, empty errors array treated as success, missing token + HTTP status + transport errors, unexpected executor failures, content_items always matches output.

## Diagnostics

`dynamic_tool` is a pure function module — no persistent state, no logging, no side effects. All failures are observable in the returned `ToolResult.output` (pretty-printed JSON). The injected executor surface makes failures fully inspectable in tests by substituting any `SymphonyError` variant.

## Deviations

None — implementation matches the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/codex/mod.rs` — module entry point; declares app_server + dynamic_tool
- `src/codex/dynamic_tool.rs` — complete linear_graphql implementation (~250 lines)
- `src/codex/app_server.rs` — compilable stubs with correct API surface (~100 lines)
- `src/linear/client.rs` — added graphql_raw (public) and graphql_http (private helper)
- `src/lib.rs` — registered pub mod codex
- `tests/codex_tests.rs` — 14 dynamic_tool tests + app_server placeholder section
