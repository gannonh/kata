---
estimated_steps: 5
estimated_files: 7
---

# T01: Integration test suite and dynamic_tool module

**Slice:** S05 — Codex App-Server Client
**Milestone:** M001

## Description

Create the `codex/` module structure and implement the `linear_graphql` dynamic tool, which is self-contained and testable without subprocess mechanics. Also establish the integration test file with all dynamic_tool tests passing and app_server test stubs compiling. Expose `LinearClient::graphql_raw` as the public GraphQL execution surface for the dynamic tool.

## Steps

1. Create `src/codex/mod.rs` declaring `pub mod app_server` and `pub mod dynamic_tool`. Register `pub mod codex` in `src/lib.rs` (replacing the comment).
2. Create `src/codex/app_server.rs` with minimal stubs (`start_session`, `run_turn`, `stop_session`) that compile with the correct signatures but return `todo!()` or placeholder errors. Define the `TurnResult` and `SessionHandle` types needed by the public API.
3. Add `pub async fn graphql_raw(&self, query: &str, variables: serde_json::Value) -> Result<serde_json::Value>` to `LinearClient` in `src/linear/client.rs`. This wraps the existing private `graphql` method, making it accessible to `dynamic_tool.rs`. Add a matching trait method to `TrackerAdapter` if needed, or keep it as a concrete method on `LinearClient`.
4. Implement `src/codex/dynamic_tool.rs`:
   - `tool_specs() -> Vec<serde_json::Value>` returning the `linear_graphql` tool definition with name, description, and inputSchema.
   - `execute(tool_name, arguments, executor) -> ToolResult` where `executor` is a trait/closure for GraphQL execution (enables test injection). Dispatch on tool name:
     - Unknown tool → failure response with supported tool list
     - `linear_graphql` → validate query (non-empty string), validate variables (must be object or absent), call executor, normalize response (success if no top-level `errors`, false otherwise, preserve body)
   - `ToolResult` struct with `success: bool`, `output: String`, `content_items: Vec<ContentItem>`.
   - Normalize result: ensure `output` and `contentItems` fields are always present matching Elixir's `normalize_dynamic_tool_result`.
   - Error formatting: missing_query, invalid_arguments, invalid_variables, missing_linear_api_token, linear_api_status, linear_api_request, generic failures — all matching Elixir error messages.
5. Create `tests/codex_tests.rs` with:
   - Dynamic tool tests (~12): tool_specs contract, unsupported tool failure, linear_graphql success, linear_graphql raw query string, linear_graphql ignores operationName, linear_graphql blank query rejection, linear_graphql missing query rejection, linear_graphql invalid argument types, linear_graphql invalid variables, linear_graphql GraphQL error responses, linear_graphql transport/auth failures, linear_graphql unexpected failures.
   - App-server placeholder section (tests to be filled in T02/T03).

## Must-Haves

- [ ] `src/codex/mod.rs` exists and declares `app_server` + `dynamic_tool` submodules
- [ ] `src/codex/dynamic_tool.rs` implements `tool_specs()` returning `linear_graphql` definition with correct inputSchema
- [ ] `dynamic_tool::execute` returns failure payload with supported tool list for unknown tools
- [ ] `linear_graphql` validates: non-empty query required, variables must be object, raw string accepted as shorthand
- [ ] `linear_graphql` calls executor, returns `success=true` when no GraphQL errors, `success=false` when errors present (preserving body)
- [ ] `linear_graphql` error formatting matches Elixir: missing_query, invalid_arguments, invalid_variables, missing_linear_api_token, linear_api_status(N), linear_api_request
- [ ] `LinearClient::graphql_raw` exists as a public method
- [ ] `tests/codex_tests.rs` has ≥12 dynamic tool tests passing
- [ ] `cargo build` — zero errors, zero warnings

## Verification

- `cargo test --test codex_tests` — all dynamic_tool tests pass
- `cargo build` — zero errors, zero warnings
- Confirm `tool_specs()` output matches Elixir's schema (name, description, inputSchema with required query, optional variables)

## Observability Impact

- None — `dynamic_tool` is a pure function module with no runtime side effects or logging. GraphQL execution is delegated to the injected executor.

## Inputs

- `src/domain.rs` — `CodexConfig`, `AgentEvent`
- `src/error.rs` — `SymphonyError` Codex-related variants
- `src/linear/client.rs` — private `graphql` method to wrap as `graphql_raw`
- Elixir reference: `lib/symphony_elixir/codex/dynamic_tool.ex` and `test/symphony_elixir/dynamic_tool_test.exs`

## Expected Output

- `src/codex/mod.rs` — module declarations
- `src/codex/dynamic_tool.rs` — complete `linear_graphql` implementation (~200 lines)
- `src/codex/app_server.rs` — compilable stubs with correct type signatures
- `src/linear/client.rs` — `graphql_raw` public method added
- `src/lib.rs` — `pub mod codex` registered
- `tests/codex_tests.rs` — ≥12 passing dynamic tool tests
