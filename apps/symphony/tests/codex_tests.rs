//! Integration tests for the `codex` module.
//!
//! ## Coverage
//! - `dynamic_tool`: `tool_specs` contract, dispatch, `linear_graphql` argument validation,
//!   success/error/failure cases, error message formatting
//! - `app_server`: placeholder section — tests filled in T02/T03

use serde_json::{json, Value};
use symphony::codex::dynamic_tool::{self, ContentItem};
use symphony::error::SymphonyError;

// ══════════════════════════════════════════════════════════════════════
// Dynamic tool tests (~12)
// ══════════════════════════════════════════════════════════════════════

// ── tool_specs contract ───────────────────────────────────────────────

#[test]
fn tool_specs_contract() {
    let specs = dynamic_tool::tool_specs();
    assert_eq!(specs.len(), 1, "expected exactly one tool spec");

    let spec = &specs[0];
    assert_eq!(spec["name"], "linear_graphql");

    let description = spec["description"].as_str().unwrap();
    assert!(
        description.contains("Linear"),
        "description should mention Linear, got: {description:?}"
    );

    let schema = &spec["inputSchema"];
    assert_eq!(schema["type"], "object");
    assert_eq!(
        schema["required"],
        json!(["query"]),
        "query must be required"
    );
    assert!(
        schema["properties"]["query"].is_object(),
        "query property must be defined"
    );
    assert!(
        schema["properties"]["variables"].is_object(),
        "variables property must be defined"
    );
}

// ── unsupported tool ──────────────────────────────────────────────────

#[tokio::test]
async fn unsupported_tool_returns_failure_with_supported_list() {
    let result = dynamic_tool::execute(
        "not_a_real_tool",
        json!({}),
        never_executor,
    )
    .await;

    assert!(!result.success);

    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        r#"Unsupported dynamic tool: "not_a_real_tool"."#
    );
    assert_eq!(
        payload["error"]["supportedTools"],
        json!(["linear_graphql"])
    );

    assert_eq!(
        result.content_items,
        vec![ContentItem {
            item_type: "inputText".to_string(),
            text: result.output.clone(),
        }]
    );
}

// ── linear_graphql success ────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_success_returns_tool_text() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({
            "query": "query Viewer { viewer { id } }",
            "variables": { "includeTeams": false }
        }),
        |query, variables| async move {
            assert_eq!(query, "query Viewer { viewer { id } }");
            assert_eq!(variables, json!({ "includeTeams": false }));
            Ok(json!({"data": {"viewer": {"id": "usr_123"}}}))
        },
    )
    .await;

    assert!(result.success, "expected success=true");
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(payload, json!({"data": {"viewer": {"id": "usr_123"}}}));
    assert_eq!(
        result.content_items,
        vec![ContentItem {
            item_type: "inputText".to_string(),
            text: result.output.clone(),
        }]
    );
}

// ── raw query string ──────────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_accepts_raw_query_string() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        // Raw string with leading/trailing whitespace — should be trimmed
        Value::String("  query Viewer { viewer { id } }  ".to_string()),
        |query, variables| async move {
            assert_eq!(query, "query Viewer { viewer { id } }");
            assert_eq!(variables, json!({}), "variables should default to empty object");
            Ok(json!({"data": {"viewer": {"id": "usr_456"}}}))
        },
    )
    .await;

    assert!(result.success);
}

// ── operationName is ignored ──────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_ignores_operation_name_field() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({
            "query": "query Viewer { viewer { id } }",
            "operationName": "Viewer"
            // no "variables" → should default to {}
        }),
        |query, variables| async move {
            assert_eq!(query, "query Viewer { viewer { id } }");
            assert_eq!(variables, json!({}), "variables should default to empty object when omitted");
            Ok(json!({"data": {"viewer": {"id": "usr_789"}}}))
        },
    )
    .await;

    assert!(result.success);
}

// ── blank raw query string ────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_rejects_blank_raw_query_string() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        Value::String("   ".to_string()),
        never_executor,
    )
    .await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "`linear_graphql` requires a non-empty `query` string."
    );
}

// ── missing / blank query in object ──────────────────────────────────

#[tokio::test]
async fn linear_graphql_rejects_missing_and_blank_query_in_object() {
    // Missing query field
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({"variables": {"commentId": "comment-1"}}),
        never_executor,
    )
    .await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "`linear_graphql` requires a non-empty `query` string."
    );

    // Blank query field
    let result2 = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "   "}),
        never_executor,
    )
    .await;

    assert!(!result2.success);
    let payload2: Value = serde_json::from_str(&result2.output).unwrap();
    assert_eq!(
        payload2["error"]["message"],
        "`linear_graphql` requires a non-empty `query` string."
    );
}

// ── invalid argument types ────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_rejects_invalid_argument_types() {
    // Array is not valid (neither string nor object)
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!(["not", "valid"]),
        never_executor,
    )
    .await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
    );

    // Number is also invalid
    let result2 = dynamic_tool::execute(
        "linear_graphql",
        json!(42),
        never_executor,
    )
    .await;

    assert!(!result2.success);
    let payload2: Value = serde_json::from_str(&result2.output).unwrap();
    assert_eq!(
        payload2["error"]["message"],
        "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
    );
}

// ── invalid variables ─────────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_rejects_non_object_variables() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({
            "query": "query Viewer { viewer { id } }",
            "variables": ["bad"]
        }),
        never_executor,
    )
    .await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "`linear_graphql.variables` must be a JSON object when provided."
    );
}

// ── GraphQL error responses ───────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_marks_graphql_errors_as_failure_preserving_body() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "mutation BadMutation { nope }"}),
        |_, _| async {
            Ok(json!({
                "errors": [{"message": "Unknown field `nope`"}],
                "data": null
            }))
        },
    )
    .await;

    assert!(!result.success, "GraphQL errors should set success=false");

    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload,
        json!({
            "data": null,
            "errors": [{"message": "Unknown field `nope`"}]
        }),
        "body should be preserved verbatim"
    );
}

#[tokio::test]
async fn linear_graphql_treats_empty_errors_array_as_success() {
    // An empty errors array is NOT a failure (only non-empty errors list triggers failure)
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query Viewer { viewer { id } }"}),
        |_, _| async { Ok(json!({"data": {"viewer": {"id": "u1"}}, "errors": []})) },
    )
    .await;

    assert!(result.success, "empty errors array should not set success=false");
}

// ── transport / auth failures ─────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_formats_transport_and_auth_failures() {
    // Missing API token
    let missing_token = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query Viewer { viewer { id } }"}),
        |_, _| async { Err(SymphonyError::MissingLinearApiToken) },
    )
    .await;

    assert!(!missing_token.success);
    let p: Value = serde_json::from_str(&missing_token.output).unwrap();
    assert_eq!(
        p["error"]["message"],
        "Symphony is missing Linear auth. Set `linear.api_key` in `WORKFLOW.md` or export `LINEAR_API_KEY`."
    );

    // HTTP status error
    let status_error = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query Viewer { viewer { id } }"}),
        |_, _| async { Err(SymphonyError::LinearApiStatus(503)) },
    )
    .await;

    assert!(!status_error.success);
    let p2: Value = serde_json::from_str(&status_error.output).unwrap();
    assert_eq!(
        p2["error"]["message"],
        "Linear GraphQL request failed with HTTP 503."
    );
    assert_eq!(p2["error"]["status"], 503);

    // Transport/request error
    let request_error = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query Viewer { viewer { id } }"}),
        |_, _| async {
            Err(SymphonyError::LinearApiRequest(":timeout".to_string()))
        },
    )
    .await;

    assert!(!request_error.success);
    let p3: Value = serde_json::from_str(&request_error.output).unwrap();
    assert_eq!(
        p3["error"]["message"],
        "Linear GraphQL request failed before receiving a successful response."
    );
    assert_eq!(p3["error"]["reason"], ":timeout");
}

// ── unexpected failures ───────────────────────────────────────────────

#[tokio::test]
async fn linear_graphql_formats_unexpected_executor_failures() {
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query Viewer { viewer { id } }"}),
        |_, _| async { Err(SymphonyError::Other(":boom".to_string())) },
    )
    .await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "Linear GraphQL tool execution failed."
    );
    assert_eq!(payload["error"]["reason"], ":boom");
}

// ── content_items always present ──────────────────────────────────────

#[tokio::test]
async fn tool_result_always_has_content_items_matching_output() {
    // Verify the structural contract for a success case
    let result = dynamic_tool::execute(
        "linear_graphql",
        json!({"query": "query { viewer { id } }"}),
        |_, _| async { Ok(json!({"data": {"viewer": {"id": "u1"}}})) },
    )
    .await;

    assert_eq!(result.content_items.len(), 1);
    assert_eq!(result.content_items[0].item_type, "inputText");
    assert_eq!(result.content_items[0].text, result.output);

    // And for a failure case
    let fail = dynamic_tool::execute(
        "linear_graphql",
        Value::String("  ".to_string()),
        never_executor,
    )
    .await;

    assert_eq!(fail.content_items.len(), 1);
    assert_eq!(fail.content_items[0].item_type, "inputText");
    assert_eq!(fail.content_items[0].text, fail.output);
}

// ══════════════════════════════════════════════════════════════════════
// App-server placeholder section (tests filled in T02/T03)
// ══════════════════════════════════════════════════════════════════════

// T02 will add:
//   - workspace_cwd_validation
//   - handshake_sequence
//   - turn_completion
//   - turn_failure
//   - turn_cancellation
//   - turn_timeout
//   - approval_auto_approve
//   - approval_rejection
//   - user_input_auto_approve_for_mcp_tool_prompt
//   - user_input_non_interactive_freeform
//   - unsupported_tool_call_rejection
//   - supported_tool_call_dispatch
//   - partial_line_buffering
//   - subprocess_exit
//   - token_delta_extraction

// ── Helpers ───────────────────────────────────────────────────────────

/// A test executor that panics if called. Use for cases where the executor must NOT be invoked.
async fn never_executor(_q: String, _v: Value) -> Result<Value, SymphonyError> {
    panic!("executor should not have been called");
}
