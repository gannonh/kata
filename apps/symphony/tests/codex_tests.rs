//! Integration tests for the `codex` module.
//!
//! ## Coverage
//! - `dynamic_tool`: `tool_specs` contract, dispatch, `linear_graphql` argument validation,
//!   success/error/failure cases, error message formatting
//! - `app_server`: workspace cwd validation, subprocess handshake, turn streaming

use serde_json::{json, Value};
use symphony::codex::dynamic_tool::{self, ContentItem};
use symphony::codex::app_server;
use symphony::domain::{AgentEvent, CodexConfig, Issue};
use symphony::error::SymphonyError;
use std::path::Path;

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
// App-server tests (T02)
// ══════════════════════════════════════════════════════════════════════

// ── Shared helpers ────────────────────────────────────────────────────

fn make_test_issue() -> Issue {
    Issue {
        id: "issue-test-1".to_string(),
        identifier: "TST-1".to_string(),
        title: "Test Issue".to_string(),
        description: None,
        priority: None,
        state: "In Progress".to_string(),
        branch_name: None,
        url: None,
        assignee_id: None,
        labels: vec![],
        blocked_by: vec![],
        assigned_to_worker: true,
        created_at: None,
        updated_at: None,
    }
}

fn make_codex_config(script_path: &Path) -> CodexConfig {
    CodexConfig {
        command: vec![script_path.to_str().unwrap().to_string()],
        turn_timeout_ms: 10_000,
        read_timeout_ms: 5_000,
        ..Default::default()
    }
}

/// Write a shell script to `dir/<name>`, make it executable, return its path.
fn write_script(dir: &Path, name: &str, content: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, content).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    path
}

/// Minimal bash script that performs a complete handshake and emits `turn/completed`.
const SCRIPT_BASIC_COMPLETION: &str = r#"#!/bin/bash
read -r line  # initialize
echo '{"id":1,"result":{"capabilities":{},"serverInfo":{"name":"fake-codex"}}}'
read -r line  # initialized (notification, no response needed)
read -r line  # thread/start
echo '{"id":2,"result":{"thread":{"id":"thread-abc-123"}}}'
read -r line  # turn/start
echo '{"id":3,"result":{"turn":{"id":"turn-xyz-456"}}}'
echo '{"method":"turn/completed","params":{}}'
"#;

/// Handshake script that emits `turn/failed`.
const SCRIPT_TURN_FAILURE: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-fail"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-fail"}}}'
echo '{"method":"turn/failed","params":{"reason":"something went wrong"}}'
"#;

/// Handshake script that emits `turn/cancelled`.
const SCRIPT_TURN_CANCELLATION: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-cancel"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-cancel"}}}'
echo '{"method":"turn/cancelled","params":{"reason":"operator cancelled"}}'
"#;

/// Handshake script that exits non-zero after turn/start (no turn/completed).
const SCRIPT_SUBPROCESS_EXIT: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-exit"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-exit"}}}'
exit 2
"#;

/// Handshake script that sends a very large turn/completed line (>8 KB).
const SCRIPT_LARGE_LINE: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-large"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-large"}}}'
# Generate ~60 KB of 'a' characters for the text field
LONG=$(dd if=/dev/zero bs=60000 count=1 2>/dev/null | tr '\0' 'a')
printf '{"method":"turn/completed","params":{"text":"%s"}}\n' "$LONG"
"#;

// ── CWD validation tests ──────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_cwd_rejects_workspace_root() {
    let tmpdir = tempfile::tempdir().unwrap();
    let root = tmpdir.path();
    let config = CodexConfig::default();
    let issue = make_test_issue();

    // workspace_path == workspace_root → error
    let result = app_server::start_session(&config, &issue, root, root).await;

    assert!(
        result.is_err(),
        "expected error when workspace is the root"
    );
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkspaceCwd(_))),
        "expected InvalidWorkspaceCwd"
    );
}

#[tokio::test]
async fn test_app_server_cwd_rejects_outside_root() {
    let root_dir = tempfile::tempdir().unwrap();
    let outside_dir = tempfile::tempdir().unwrap();
    let config = CodexConfig::default();
    let issue = make_test_issue();

    // workspace is completely outside root → error
    let result = app_server::start_session(
        &config,
        &issue,
        outside_dir.path(),
        root_dir.path(),
    )
    .await;

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkspaceCwd(_))),
        "expected InvalidWorkspaceCwd for outside-root workspace"
    );
}

#[cfg(unix)]
#[tokio::test]
async fn test_app_server_cwd_rejects_symlink_escape() {
    let root_dir = tempfile::tempdir().unwrap();
    let outside_dir = tempfile::tempdir().unwrap();
    let config = CodexConfig::default();
    let issue = make_test_issue();

    // Create symlink inside root pointing to outside dir
    let symlink_path = root_dir.path().join("escaped");
    std::os::unix::fs::symlink(outside_dir.path(), &symlink_path).unwrap();

    // workspace_path is the symlink (resolves outside root) → error
    let result =
        app_server::start_session(&config, &issue, &symlink_path, root_dir.path()).await;

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkspaceCwd(_))),
        "expected InvalidWorkspaceCwd for symlink escape"
    );
}

// ── Handshake + completion ────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_basic_handshake_and_completion() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_BASIC_COMPLETION);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle = app_server::start_session(&config, &issue, &workspace, root_dir.path())
        .await
        .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    assert!(result.is_ok(), "run_turn failed: {:?}", result.err());

    // SessionStarted with correct session_id
    let session_started = collected.iter().find(|e| {
        matches!(e, AgentEvent::SessionStarted { session_id, .. }
            if session_id == "thread-abc-123-turn-xyz-456")
    });
    assert!(session_started.is_some(), "expected SessionStarted event with correct session_id");

    // TurnCompleted with correct turn_id
    let turn_completed = collected.iter().find(|e| {
        matches!(e, AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "turn-xyz-456")
    });
    assert!(turn_completed.is_some(), "expected TurnCompleted event with correct turn_id");

    // events also in TurnResult
    assert!(result.unwrap().events.len() >= 2, "expected at least 2 events in TurnResult");
}

// ── Turn failure ──────────────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_turn_failure() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_TURN_FAILURE);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle = app_server::start_session(&config, &issue, &workspace, root_dir.path())
        .await
        .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnFailed(_))),
        "expected TurnFailed error, got: {:?}", result
    );

    assert!(
        collected.iter().any(|e| matches!(e, AgentEvent::TurnFailed { .. })),
        "expected TurnFailed event in callback"
    );
}

// ── Turn cancellation ─────────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_turn_cancellation() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_TURN_CANCELLATION);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle = app_server::start_session(&config, &issue, &workspace, root_dir.path())
        .await
        .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnCancelled(_))),
        "expected TurnCancelled error, got: {:?}", result
    );

    assert!(
        collected.iter().any(|e| matches!(e, AgentEvent::TurnCancelled { .. })),
        "expected TurnCancelled event in callback"
    );
}

// ── Subprocess exit ───────────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_subprocess_exit() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_SUBPROCESS_EXIT);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut handle = app_server::start_session(&config, &issue, &workspace, root_dir.path())
        .await
        .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", |_| {}).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::PortExit(_))),
        "expected PortExit error, got: {:?}", result
    );
}

// ── Partial line buffering ────────────────────────────────────────────

#[tokio::test]
async fn test_app_server_partial_line_buffering() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_LARGE_LINE);
    let mut config = make_codex_config(&script_path);
    config.turn_timeout_ms = 15_000; // extra time for dd

    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle = app_server::start_session(&config, &issue, &workspace, root_dir.path())
        .await
        .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    assert!(result.is_ok(), "partial line buffering failed: {:?}", result.err());
    assert!(
        collected.iter().any(|e| matches!(e, AgentEvent::TurnCompleted { .. })),
        "expected TurnCompleted event for large-line test"
    );
}

// ── Helpers ───────────────────────────────────────────────────────────

/// A test executor that panics if called. Use for cases where the executor must NOT be invoked.
async fn never_executor(_q: String, _v: Value) -> Result<Value, SymphonyError> {
    panic!("executor should not have been called");
}
