//! Integration tests for the `codex` module.
//!
//! ## Coverage
//! - `dynamic_tool`: `tool_specs` contract, dispatch, `linear_graphql` argument validation,
//!   success/error/failure cases, error message formatting
//! - `app_server`: workspace cwd validation, subprocess handshake, turn streaming

use serde_json::{json, Value};
use std::path::Path;
use symphony::codex::app_server;
use symphony::codex::dynamic_tool::{self, ContentItem};
use symphony::domain::{AgentEvent, CodexConfig, Issue};
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
    let result = dynamic_tool::execute("not_a_real_tool", json!({}), never_executor).await;

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
            assert_eq!(
                variables,
                json!({}),
                "variables should default to empty object"
            );
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
            assert_eq!(
                variables,
                json!({}),
                "variables should default to empty object when omitted"
            );
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
    let result2 =
        dynamic_tool::execute("linear_graphql", json!({"query": "   "}), never_executor).await;

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
    let result =
        dynamic_tool::execute("linear_graphql", json!(["not", "valid"]), never_executor).await;

    assert!(!result.success);
    let payload: Value = serde_json::from_str(&result.output).unwrap();
    assert_eq!(
        payload["error"]["message"],
        "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
    );

    // Number is also invalid
    let result2 = dynamic_tool::execute("linear_graphql", json!(42), never_executor).await;

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

    assert!(
        result.success,
        "empty errors array should not set success=false"
    );
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
        |_, _| async { Err(SymphonyError::LinearApiRequest(":timeout".to_string())) },
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
        children_count: 0,
        parent_identifier: None,
    }
}

fn make_codex_config(script_path: &Path) -> CodexConfig {
    CodexConfig {
        command: vec![script_path.to_str().unwrap().to_string()],
        turn_timeout_ms: 10_000,
        read_timeout_ms: 20_000,
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

/// Handshake script that emits `turn/completed` with `turn.status=failed`.
const SCRIPT_TURN_COMPLETED_FAILED_STATUS: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-failed-status"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-failed-status"}}}'
echo '{"method":"turn/completed","params":{"turn":{"status":"failed","error":{"message":"Model temporarily unavailable","codexErrorInfo":"modelUnavailable"}}}}'
"#;

/// Handshake script that emits a usage limit failure via `turn/completed`.
const SCRIPT_TURN_COMPLETED_USAGE_LIMIT_EXCEEDED: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-usage-limit"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-usage-limit"}}}'
echo '{"method":"turn/completed","params":{"turn":{"status":"failed","error":{"message":"Usage limit exceeded for model","codexErrorInfo":"usageLimitExceeded"}}}}'
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

/// Handshake script that never responds to initialize (used for startup timeout).
const SCRIPT_HANDSHAKE_TIMEOUT: &str = r#"#!/bin/bash
read -r line
sleep 2
"#;

/// Handshake script that starts a turn but never emits turn/completed.
const SCRIPT_TURN_TIMEOUT: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-timeout"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-timeout"}}}'
sleep 2
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
    let result = app_server::start_session(&config, &issue, root, root, None, None).await;

    assert!(result.is_err(), "expected error when workspace is the root");
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
        None,
        None,
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
        app_server::start_session(&config, &issue, &symlink_path, root_dir.path(), None, None)
            .await;

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkspaceCwd(_))),
        "expected InvalidWorkspaceCwd for symlink escape"
    );
}

#[tokio::test]
async fn test_app_server_start_session_command_not_found_includes_command_name() {
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let missing_command = "definitely-not-a-real-codex-command";
    let config = CodexConfig {
        command: vec![missing_command.to_string()],
        read_timeout_ms: 200,
        ..Default::default()
    };
    let issue = make_test_issue();

    let err =
        match app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
        {
            Ok(_) => panic!("start_session should fail for missing codex command"),
            Err(err) => err,
        };

    let rendered = err.to_string();
    assert!(
        rendered.contains(missing_command),
        "error should include missing command name for diagnostics: {rendered}"
    );
}

#[tokio::test]
async fn test_app_server_start_session_handshake_timeout() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(
        scripts_dir.path(),
        "codex-handshake-timeout.sh",
        SCRIPT_HANDSHAKE_TIMEOUT,
    );
    let mut config = make_codex_config(&script_path);
    config.read_timeout_ms = 100;

    let issue = make_test_issue();
    let result =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None).await;

    match result {
        Err(SymphonyError::ResponseError(message)) => {
            assert!(
                message.contains("timeout"),
                "expected timeout diagnostic, got: {message}"
            );
        }
        Err(other) => panic!("expected ResponseError timeout diagnostic, got: {other}"),
        Ok(_) => panic!("expected startup handshake timeout"),
    }
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

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(result.is_ok(), "run_turn failed: {:?}", result.err());

    // SessionStarted with correct session_id
    let session_started = collected.iter().find(|e| {
        matches!(e, AgentEvent::SessionStarted { session_id, .. }
            if session_id == "thread-abc-123-turn-xyz-456")
    });
    assert!(
        session_started.is_some(),
        "expected SessionStarted event with correct session_id"
    );

    // TurnCompleted with correct turn_id
    let turn_completed = collected.iter().find(
        |e| matches!(e, AgentEvent::TurnCompleted { turn_id, .. } if turn_id == "turn-xyz-456"),
    );
    assert!(
        turn_completed.is_some(),
        "expected TurnCompleted event with correct turn_id"
    );

    // events also in TurnResult
    assert!(
        result.unwrap().events.len() >= 2,
        "expected at least 2 events in TurnResult"
    );
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

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnFailed(_))),
        "expected TurnFailed error, got: {:?}",
        result
    );

    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnFailed { .. })),
        "expected TurnFailed event in callback"
    );
}

#[tokio::test]
async fn test_turn_completed_with_failed_status_treated_as_failure() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(
        scripts_dir.path(),
        "codex.sh",
        SCRIPT_TURN_COMPLETED_FAILED_STATUS,
    );
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    let err = match result {
        Err(SymphonyError::TurnFailed(msg)) => msg,
        other => panic!("expected TurnFailed error, got: {other:?}"),
    };
    assert!(
        err.contains("modelUnavailable"),
        "expected codexErrorInfo in error message, got: {err}"
    );
    assert!(
        err.contains("Model temporarily unavailable"),
        "expected error message from payload, got: {err}"
    );
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnFailed { .. })),
        "expected TurnFailed event in callback"
    );
    assert!(
        !collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnCompleted { .. })),
        "did not expect TurnCompleted event for failed turn/completed status"
    );
}

#[tokio::test]
async fn test_turn_completed_with_usage_limit_exceeded_surfaces_error_message() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(
        scripts_dir.path(),
        "codex.sh",
        SCRIPT_TURN_COMPLETED_USAGE_LIMIT_EXCEEDED,
    );
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    let err = match result {
        Err(SymphonyError::TurnFailed(msg)) => msg,
        other => panic!("expected TurnFailed error, got: {other:?}"),
    };
    assert!(
        err.contains("usageLimitExceeded"),
        "expected codexErrorInfo to surface, got: {err}"
    );
    assert!(
        err.contains("Usage limit exceeded for model"),
        "expected payload error message to surface, got: {err}"
    );

    let turn_failed_errors: Vec<&str> = collected
        .iter()
        .filter_map(|e| {
            if let AgentEvent::TurnFailed { error, .. } = e {
                Some(error.as_str())
            } else {
                None
            }
        })
        .collect();

    assert_eq!(turn_failed_errors.len(), 1, "expected one TurnFailed event");
    assert!(
        !collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnCompleted { .. })),
        "did not expect TurnCompleted event for failed turn/completed status"
    );
    assert!(
        turn_failed_errors[0].contains("usageLimitExceeded"),
        "expected event error to include codexErrorInfo, got: {}",
        turn_failed_errors[0]
    );
    assert!(
        turn_failed_errors[0].contains("Usage limit exceeded for model"),
        "expected event error to include payload message, got: {}",
        turn_failed_errors[0]
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

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnCancelled(_))),
        "expected TurnCancelled error, got: {:?}",
        result
    );

    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnCancelled { .. })),
        "expected TurnCancelled event in callback"
    );
}

#[tokio::test]
async fn test_app_server_turn_timeout_during_response() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(
        scripts_dir.path(),
        "codex-turn-timeout.sh",
        SCRIPT_TURN_TIMEOUT,
    );
    let mut config = make_codex_config(&script_path);
    config.turn_timeout_ms = 100;

    let issue = make_test_issue();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |_| {}).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnTimeout)),
        "expected TurnTimeout error"
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

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |_| {}).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::PortExit(_))),
        "expected PortExit error, got: {:?}",
        result
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

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        result.is_ok(),
        "partial line buffering failed: {:?}",
        result.err()
    );
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnCompleted { .. })),
        "expected TurnCompleted event for large-line test"
    );
}

// ══════════════════════════════════════════════════════════════════════
// App-server tests (T03) — approval, tool dispatch, user input, tokens
// ══════════════════════════════════════════════════════════════════════

// Helper: make a CodexConfig with approval_policy="never" (auto-approve everything)
fn make_auto_approve_config(script_path: &Path) -> CodexConfig {
    CodexConfig {
        command: vec![script_path.to_str().unwrap().to_string()],
        approval_policy: serde_json::json!("never"),
        turn_timeout_ms: 10_000,
        read_timeout_ms: 20_000,
        ..Default::default()
    }
}

// ── test_app_server_auto_approves_command_execution ───────────────────

/// Fake script: after turn/start, sends an `item/commandExecution/requestApproval`
/// then waits for our response, then emits turn/completed.
const SCRIPT_COMMAND_APPROVAL: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line  # initialized
read -r line  # thread/start
echo '{"id":2,"result":{"thread":{"id":"thread-approve-1"}}}'
read -r line  # turn/start
echo '{"id":3,"result":{"turn":{"id":"turn-approve-1"}}}'
echo '{"method":"item/commandExecution/requestApproval","id":"req-cmd-1","params":{"command":"ls"}}'
read -r line  # approval response from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_auto_approves_command_execution() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_COMMAND_APPROVAL);
    let config = make_auto_approve_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        result.is_ok(),
        "expected turn completion, got: {:?}",
        result.err()
    );

    // Must have seen ApprovalAutoApproved with the correct method
    let approved = collected.iter().find(|e| {
        matches!(e, AgentEvent::ApprovalAutoApproved { tool_call, .. }
            if tool_call == "item/commandExecution/requestApproval")
    });
    assert!(
        approved.is_some(),
        "expected ApprovalAutoApproved event, got: {:?}",
        collected
            .iter()
            .map(|e| format!("{:?}", e))
            .collect::<Vec<_>>()
    );
}

// ── test_app_server_rejects_approval_when_not_auto ────────────────────

const SCRIPT_COMMAND_APPROVAL_REJECT: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-reject-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-reject-1"}}}'
echo '{"method":"item/commandExecution/requestApproval","id":"req-rej-1","params":{"command":"ls"}}'
# script exits — in practice the test returns error before reading
"#;

#[tokio::test]
async fn test_app_server_rejects_approval_when_not_auto() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(
        scripts_dir.path(),
        "codex.sh",
        SCRIPT_COMMAND_APPROVAL_REJECT,
    );
    // Default config: approval_policy is NOT "never" → auto_approve_requests=false
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    // Should return an error (approval_required)
    assert!(result.is_err(), "expected error when approval required");

    // ApprovalRequired event must have been emitted
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::ApprovalRequired { .. })),
        "expected ApprovalRequired event"
    );
}

// ── test_app_server_auto_approves_mcp_tool_prompts ────────────────────

const SCRIPT_MCP_TOOL_APPROVAL: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-mcp-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-mcp-1"}}}'
echo '{"method":"item/tool/requestUserInput","id":"req-mcp-1","params":{"questions":[{"id":"q1","options":[{"label":"Approve this Session"},{"label":"Deny"}]}]}}'
read -r line  # answer from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_auto_approves_mcp_tool_prompts() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_MCP_TOOL_APPROVAL);
    let config = make_auto_approve_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(result.is_ok(), "expected success, got: {:?}", result.err());
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::ApprovalAutoApproved { .. })),
        "expected ApprovalAutoApproved for MCP tool prompt"
    );
}

// ── test_app_server_non_interactive_freeform_input ────────────────────

const SCRIPT_FREEFORM_INPUT: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-freeform-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-freeform-1"}}}'
echo '{"method":"item/tool/requestUserInput","id":"req-free-1","params":{"questions":[{"id":"q1","prompt":"Enter a value:"}]}}'
read -r line  # non-interactive answer from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_non_interactive_freeform_input() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_FREEFORM_INPUT);
    // Use default config (not auto-approve) — freeform should still get answered
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        result.is_ok(),
        "expected success with non-interactive answer, got: {:?}",
        result.err()
    );
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolInputAutoAnswered { .. })),
        "expected ToolInputAutoAnswered event"
    );
}

// ── test_app_server_rejects_unsupported_tool_calls ────────────────────

const SCRIPT_UNSUPPORTED_TOOL: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-tool-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-tool-1"}}}'
echo '{"method":"item/tool/call","id":"tool-req-1","params":{"name":"some_unknown_tool","arguments":{}}}'
read -r line  # failure result from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_rejects_unsupported_tool_calls() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_UNSUPPORTED_TOOL);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    // Turn should still complete (unsupported tool does NOT terminate the turn)
    assert!(
        result.is_ok(),
        "expected turn to complete despite unsupported tool, got: {:?}",
        result.err()
    );
    assert!(
        collected.iter().any(|e| matches!(
            e,
            AgentEvent::ToolCallFailed { .. } | AgentEvent::UnsupportedToolCall { .. }
        )),
        "expected ToolCallFailed or UnsupportedToolCall event"
    );
}

// ── test_app_server_dispatches_supported_tool_calls ───────────────────

const SCRIPT_LINEAR_TOOL: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-linear-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-linear-1"}}}'
echo '{"method":"item/tool/call","id":"tool-gql-1","params":{"name":"linear_graphql","arguments":{"query":"query { viewer { id } }","variables":{}}}}'
read -r line  # success result from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_dispatches_supported_tool_calls() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_LINEAR_TOOL);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    // Inject a mock executor that returns a success response
    let executor = |_query: String, _vars: Value| async move {
        Ok(serde_json::json!({"data": {"viewer": {"id": "usr-test"}}}))
    };

    let result =
        app_server::run_turn(&mut handle, "hello", executor, |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    assert!(
        result.is_ok(),
        "expected successful turn, got: {:?}",
        result.err()
    );
    assert!(
        collected.iter().any(|e| matches!(e, AgentEvent::ToolCallCompleted { tool_name, .. } if tool_name == "linear_graphql")),
        "expected ToolCallCompleted for linear_graphql"
    );
}

// ── test_app_server_emits_tool_call_failed_event ──────────────────────

const SCRIPT_TOOL_FAIL: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-fail-tool-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-fail-tool-1"}}}'
echo '{"method":"item/tool/call","id":"tool-fail-1","params":{"name":"linear_graphql","arguments":{"query":"query { viewer { id } }"}}}'
read -r line  # failure result from us
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_app_server_emits_tool_call_failed_event() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_TOOL_FAIL);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    // Inject executor that returns an error
    let executor = |_q: String, _v: Value| async move { Err(SymphonyError::MissingLinearApiToken) };

    let result =
        app_server::run_turn(&mut handle, "hello", executor, |ev| collected.push(ev)).await;
    app_server::stop_session(handle).await.ok();

    // Turn should still complete — tool failures don't terminate the turn
    assert!(
        result.is_ok(),
        "expected turn to complete despite tool failure, got: {:?}",
        result.err()
    );
    assert!(
        collected.iter().any(|e| matches!(e, AgentEvent::ToolCallFailed { tool_name, .. } if tool_name.as_deref() == Some("linear_graphql"))),
        "expected ToolCallFailed event with tool_name=linear_graphql"
    );
}

// ── test_app_server_input_required_hard_failure ───────────────────────

const SCRIPT_INPUT_REQUIRED: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-input-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-input-1"}}}'
echo '{"method":"turn/input_required","params":{"message":"Need input"}}'
"#;

#[tokio::test]
async fn test_app_server_input_required_hard_failure() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_INPUT_REQUIRED);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut collected: Vec<AgentEvent> = Vec::new();
    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |ev| {
        collected.push(ev)
    })
    .await;
    app_server::stop_session(handle).await.ok();

    assert!(
        matches!(result, Err(SymphonyError::TurnInputRequired)),
        "expected TurnInputRequired error, got: {:?}",
        result
    );
    assert!(
        collected
            .iter()
            .any(|e| matches!(e, AgentEvent::TurnInputRequired { .. })),
        "expected TurnInputRequired event emitted"
    );
}

// ── test_token_delta_extraction_absolute_totals ───────────────────────

const SCRIPT_TOKEN_ACCOUNTING: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-tok-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-tok-1"}}}'
echo '{"method":"some/event","params":{"tokenUsage":{"total":{"input_tokens":100,"output_tokens":50,"total_tokens":150}}}}'
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_token_delta_extraction_absolute_totals() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_TOKEN_ACCOUNTING);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |_| {}).await;
    app_server::stop_session(handle).await.ok();

    let turn = result.expect("expected successful turn");
    assert_eq!(turn.input_tokens, 100, "expected 100 input tokens");
    assert_eq!(turn.output_tokens, 50, "expected 50 output tokens");
    assert_eq!(turn.total_tokens, 150, "expected 150 total tokens");
}

// ── test_token_delta_zero_on_decrease ────────────────────────────────

/// Script that sends a token event with a total, then another with a *lower* total.
/// Delta on the second event must be 0 (not negative).
const SCRIPT_TOKEN_DECREASE: &str = r#"#!/bin/bash
read -r line
echo '{"id":1,"result":{"capabilities":{}}}'
read -r line
read -r line
echo '{"id":2,"result":{"thread":{"id":"thread-tok-dec-1"}}}'
read -r line
echo '{"id":3,"result":{"turn":{"id":"turn-tok-dec-1"}}}'
echo '{"method":"some/event","params":{"tokenUsage":{"total":{"total_tokens":200}}}}'
echo '{"method":"some/event2","params":{"tokenUsage":{"total":{"total_tokens":100}}}}'
echo '{"method":"turn/completed","params":{}}'
"#;

#[tokio::test]
async fn test_token_delta_zero_on_decrease() {
    let scripts_dir = tempfile::tempdir().unwrap();
    let root_dir = tempfile::tempdir().unwrap();
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let script_path = write_script(scripts_dir.path(), "codex.sh", SCRIPT_TOKEN_DECREASE);
    let config = make_codex_config(&script_path);
    let issue = make_test_issue();

    let mut handle =
        app_server::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
            .await
            .expect("start_session should succeed");

    let result = app_server::run_turn(&mut handle, "hello", never_executor, |_| {}).await;
    app_server::stop_session(handle).await.ok();

    let turn = result.expect("expected successful turn");
    // First event: delta = 200 - 0 = 200. Second event: 100 < 200 → delta = 0.
    // Total accumulated = 200 (not 200 + negative).
    assert_eq!(
        turn.total_tokens, 200,
        "total_tokens should be 200 (decrease does not subtract)"
    );
}

// ── Helpers ───────────────────────────────────────────────────────────

/// A test executor that panics if called. Use for cases where the executor must NOT be invoked.
async fn never_executor(_q: String, _v: Value) -> Result<Value, SymphonyError> {
    panic!("executor should not have been called");
}
