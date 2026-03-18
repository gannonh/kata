//! Dynamic tool dispatch for Codex agent sessions.
//!
//! Ports the Elixir `SymphonyElixir.Codex.DynamicTool` module to idiomatic Rust.
//!
//! This module handles client-side tool calls requested by the Codex app-server.
//! Currently supports a single tool: `linear_graphql`.
//!
//! The `execute` function accepts a generic `executor` closure so that the Linear
//! GraphQL call can be injected in tests without a real HTTP client.

use std::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::SymphonyError;

// ── Constants ─────────────────────────────────────────────────────────

const LINEAR_GRAPHQL_TOOL: &str = "linear_graphql";

const LINEAR_GRAPHQL_DESCRIPTION: &str =
    "Execute a raw GraphQL query or mutation against Linear using Symphony's configured auth.";

// ── Public types ──────────────────────────────────────────────────────

/// A single content item in a tool result, matching the Codex protocol schema.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContentItem {
    /// Content type tag — always `"inputText"` for text responses.
    #[serde(rename = "type")]
    pub item_type: String,
    /// The text payload, identical to `ToolResult::output`.
    pub text: String,
}

/// The result returned by `execute`, matching the Codex dynamic-tool protocol.
///
/// Serialises to camelCase JSON: `{ "success": bool, "output": "...", "contentItems": [...] }`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    /// Whether the tool call succeeded.
    pub success: bool,
    /// JSON-encoded payload (pretty-printed) or inspect-style fallback.
    pub output: String,
    /// Structured content items for the Codex protocol.
    pub content_items: Vec<ContentItem>,
}

// ── Public API ────────────────────────────────────────────────────────

/// Return the list of tool specifications advertised to the Codex app-server.
///
/// Matches the Elixir `tool_specs/0` function. Each spec has `name`, `description`,
/// and `inputSchema` conforming to the JSON Schema draft used by the Codex protocol.
pub fn tool_specs() -> Vec<Value> {
    vec![json!({
        "name": LINEAR_GRAPHQL_TOOL,
        "description": LINEAR_GRAPHQL_DESCRIPTION,
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "GraphQL query or mutation document to execute against Linear."
                },
                "variables": {
                    "type": ["object", "null"],
                    "description": "Optional GraphQL variables object.",
                    "additionalProperties": true
                }
            }
        }
    })]
}

/// Dispatch a dynamic tool call.
///
/// # Arguments
/// - `tool_name` — the name of the tool requested by Codex
/// - `arguments`  — raw arguments value (string, object, or other) from the tool call
/// - `executor`   — async closure used to execute a GraphQL query; injected for testability
///
/// Returns a `ToolResult` that always contains `success`, `output`, and `content_items`.
/// Never returns an error — all failure conditions are encoded in the `ToolResult` payload.
///
/// ## Argument normalization (mirrors Elixir `normalize_linear_graphql_arguments/1`)
/// - `Value::String(s)` — treated as a raw query; must be non-empty after trimming
/// - `Value::Object(m)` — must have `"query"` key (non-empty string) + optional `"variables"` (object)
/// - anything else — `invalid_arguments` error
pub async fn execute<F, Fut>(tool_name: &str, arguments: Value, executor: F) -> ToolResult
where
    F: FnOnce(String, Value) -> Fut,
    Fut: Future<Output = Result<Value, SymphonyError>>,
{
    match tool_name {
        LINEAR_GRAPHQL_TOOL => execute_linear_graphql(arguments, executor).await,
        other => failure_result(json!({
            "error": {
                "message": format!("Unsupported dynamic tool: {:?}.", other),
                "supportedTools": supported_tool_names()
            }
        })),
    }
}

// ── Internal: linear_graphql ──────────────────────────────────────────

async fn execute_linear_graphql<F, Fut>(arguments: Value, executor: F) -> ToolResult
where
    F: FnOnce(String, Value) -> Fut,
    Fut: Future<Output = Result<Value, SymphonyError>>,
{
    match normalize_linear_graphql_arguments(arguments) {
        Ok((query, variables)) => match executor(query, variables).await {
            Ok(response) => graphql_result(response),
            Err(err) => failure_result(tool_error_payload(&err)),
        },
        Err(err) => failure_result(tool_error_payload(&err)),
    }
}

/// Normalise `linear_graphql` arguments into `(query, variables)`.
///
/// Mirrors Elixir's `normalize_linear_graphql_arguments/1` with all three clauses:
/// 1. Binary (string) → trim and use as query with empty variables
/// 2. Map → extract `query` (required, non-empty) + `variables` (optional object)
/// 3. Anything else → `invalid_arguments`
fn normalize_linear_graphql_arguments(arguments: Value) -> Result<(String, Value), SymphonyError> {
    match arguments {
        Value::String(s) => {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() {
                Err(SymphonyError::Other("missing_query".to_string()))
            } else {
                Ok((trimmed, json!({})))
            }
        }
        Value::Object(ref map) => {
            // Extract query
            let query = match map.get("query") {
                Some(Value::String(q)) => {
                    let trimmed = q.trim().to_string();
                    if trimmed.is_empty() {
                        return Err(SymphonyError::Other("missing_query".to_string()));
                    }
                    trimmed
                }
                _ => return Err(SymphonyError::Other("missing_query".to_string())),
            };

            // Extract variables (optional, must be object if present)
            let variables = match map.get("variables") {
                None => json!({}),
                Some(Value::Object(_)) => map.get("variables").unwrap().clone(),
                Some(Value::Null) => json!({}),
                Some(_) => return Err(SymphonyError::Other("invalid_variables".to_string())),
            };

            Ok((query, variables))
        }
        _ => Err(SymphonyError::Other("invalid_arguments".to_string())),
    }
}

// ── Internal: response encoding ───────────────────────────────────────

/// Build a `ToolResult` from a raw GraphQL response body.
///
/// Sets `success = false` when the body contains a non-empty `errors` list
/// (checking both string and atom keys to mirror the Elixir reference).
/// The body is always preserved verbatim in `output`.
fn graphql_result(response: Value) -> ToolResult {
    let has_errors = match &response {
        Value::Object(m) => {
            if let Some(Value::Array(arr)) = m.get("errors") {
                !arr.is_empty()
            } else {
                false
            }
        }
        _ => false,
    };

    let output = encode_payload(&response);
    build_result(!has_errors, output)
}

/// Build a failure `ToolResult` from a structured error payload.
fn failure_result(payload: Value) -> ToolResult {
    let output = encode_payload(&payload);
    build_result(false, output)
}

/// Construct the final `ToolResult` with the `contentItems` array.
fn build_result(success: bool, output: String) -> ToolResult {
    ToolResult {
        success,
        content_items: vec![ContentItem {
            item_type: "inputText".to_string(),
            text: output.clone(),
        }],
        output,
    }
}

/// Serialise a JSON payload to a pretty-printed string.
///
/// Falls back to `Debug` formatting for non-serialisable values (should not
/// occur with `serde_json::Value` but matches Elixir's `inspect` fallback).
fn encode_payload(payload: &Value) -> String {
    serde_json::to_string_pretty(payload).unwrap_or_else(|_| format!("{payload:?}"))
}

// ── Internal: error formatting ────────────────────────────────────────

/// Map a `SymphonyError` (or our internal sentinel errors) to the tool error payload.
///
/// Mirrors Elixir's `tool_error_payload/1` clauses exactly, including error messages.
fn tool_error_payload(err: &SymphonyError) -> Value {
    // Internal sentinel errors from argument normalisation are stored as Other("...").
    if let SymphonyError::Other(tag) = err {
        match tag.as_str() {
            "missing_query" => {
                return json!({
                    "error": {
                        "message": "`linear_graphql` requires a non-empty `query` string."
                    }
                })
            }
            "invalid_arguments" => {
                return json!({
                    "error": {
                        "message": "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
                    }
                })
            }
            "invalid_variables" => {
                return json!({
                    "error": {
                        "message": "`linear_graphql.variables` must be a JSON object when provided."
                    }
                })
            }
            _ => {}
        }
    }

    match err {
        SymphonyError::MissingLinearApiToken => json!({
            "error": {
                "message": "Symphony is missing Linear auth. Set `linear.api_key` in `WORKFLOW.md` or export `LINEAR_API_KEY`."
            }
        }),
        SymphonyError::LinearApiStatus(status) => json!({
            "error": {
                "message": format!("Linear GraphQL request failed with HTTP {}.", status),
                "status": status
            }
        }),
        SymphonyError::LinearApiRequest(reason) => json!({
            "error": {
                "message": "Linear GraphQL request failed before receiving a successful response.",
                "reason": reason
            }
        }),
        other => json!({
            "error": {
                "message": "Linear GraphQL tool execution failed.",
                "reason": other.to_string()
            }
        }),
    }
}

// ── Internal helpers ──────────────────────────────────────────────────

fn supported_tool_names() -> Vec<String> {
    tool_specs()
        .iter()
        .filter_map(|spec| spec.get("name")?.as_str().map(|s| s.to_string()))
        .collect()
}
