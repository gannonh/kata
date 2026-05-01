//! Tests for pi-agent protocol serde and token accounting.

use serde_json::json;
use std::path::Path;
use symphony::pi_agent::protocol::{
    extract_stop_reason, has_rate_limit_hint, ExtensionUIResponse, RpcCommand, RpcOutputLine,
    SessionStats, SessionTokens,
};
use symphony::pi_agent::rpc_bridge;
use symphony::pi_agent::token_accounting::TokenTracker;
use symphony::{domain::EscalationResponse, domain::Issue, domain::PiAgentConfig};

#[test]
fn serialize_prompt_command() {
    let cmd = RpcCommand::Prompt {
        id: Some("cmd-1".to_string()),
        message: "hello world".to_string(),
    };
    let json = serde_json::to_value(cmd).expect("serialize prompt command");
    assert_eq!(
        json,
        json!({
            "type": "prompt",
            "id": "cmd-1",
            "message": "hello world"
        })
    );
}

#[test]
fn serialize_get_state_command() {
    let cmd = RpcCommand::GetState {
        id: Some("state-1".to_string()),
    };
    let json = serde_json::to_value(cmd).expect("serialize get_state command");
    assert_eq!(
        json,
        json!({
            "type": "get_state",
            "id": "state-1"
        })
    );
}

#[test]
fn parse_prompt_response_line() {
    let parsed: RpcOutputLine = serde_json::from_value(json!({
        "type": "response",
        "id": "prompt-1",
        "command": "prompt",
        "success": true,
        "data": { "ok": true }
    }))
    .expect("parse response line");

    match parsed {
        RpcOutputLine::Response(r) => {
            assert_eq!(r.id.as_deref(), Some("prompt-1"));
            assert_eq!(r.command, "prompt");
            assert!(r.success);
        }
        other => panic!("expected response variant, got {other:?}"),
    }
}

#[test]
fn parse_tool_execution_start_event() {
    let parsed: RpcOutputLine = serde_json::from_value(json!({
        "type": "tool_execution_start",
        "toolCallId": "call-1",
        "toolName": "bash",
        "args": {"command": "ls -la"}
    }))
    .expect("parse tool_execution_start");

    match parsed {
        RpcOutputLine::ToolExecutionStart {
            tool_call_id,
            tool_name,
            args,
        } => {
            assert_eq!(tool_call_id.as_deref(), Some("call-1"));
            assert_eq!(tool_name.as_deref(), Some("bash"));
            assert_eq!(args["command"], "ls -la");
        }
        other => panic!("expected tool_execution_start variant, got {other:?}"),
    }
}

#[test]
fn extension_ui_response_helpers() {
    let cancel = ExtensionUIResponse::cancel("req-1".to_string());
    assert_eq!(cancel.type_, "extension_ui_response");
    assert_eq!(cancel.id, "req-1");
    assert_eq!(cancel.cancelled, Some(true));
    assert_eq!(cancel.confirmed, None);

    let reject = ExtensionUIResponse::reject("req-2".to_string());
    assert_eq!(reject.id, "req-2");
    assert_eq!(reject.cancelled, None);
    assert_eq!(reject.confirmed, Some(false));

    let merged = ExtensionUIResponse::from_payload(
        "req-3".to_string(),
        json!({"confirmed": true, "value": "yes"}),
    );
    assert_eq!(merged["type"], "extension_ui_response");
    assert_eq!(merged["id"], "req-3");
    assert_eq!(merged["confirmed"], true);
    assert_eq!(merged["value"], "yes");

    let reserved = ExtensionUIResponse::from_payload(
        "req-4".to_string(),
        json!({"type": "spoofed", "id": "spoofed", "confirmed": false}),
    );
    assert_eq!(reserved["type"], "extension_ui_response");
    assert_eq!(reserved["id"], "req-4");
    assert_eq!(reserved["confirmed"], false);
}

#[test]
fn parse_session_stats_payload() {
    let stats: SessionStats = serde_json::from_value(json!({
        "session_id": "session-1",
        "user_messages": 2,
        "assistant_messages": 3,
        "tool_calls": 1,
        "total_messages": 5,
        "tokens": {
            "input": 100,
            "output": 40,
            "cacheRead": 5,
            "cacheWrite": 2,
            "total": 140
        },
        "cost": 0.12
    }))
    .expect("parse session stats");

    assert_eq!(stats.session_id, "session-1");
    assert_eq!(
        stats.tokens,
        SessionTokens {
            input: 100,
            output: 40,
            cache_read: 5,
            cache_write: 2,
            total: 140
        }
    );
}

#[test]
fn token_tracker_computes_deltas() {
    let mut tracker = TokenTracker::new();
    let d1 = tracker.update(100, 40, 140);
    assert_eq!(d1.input_tokens, 100);
    assert_eq!(d1.output_tokens, 40);
    assert_eq!(d1.total_tokens, 140);

    let d2 = tracker.update(160, 75, 235);
    assert_eq!(d2.input_tokens, 60);
    assert_eq!(d2.output_tokens, 35);
    assert_eq!(d2.total_tokens, 95);
}

#[test]
fn token_tracker_clamps_negative_deltas_to_zero() {
    let mut tracker = TokenTracker::new();
    let _ = tracker.update(100, 50, 150);
    let d = tracker.update(90, 45, 135);
    assert_eq!(d.input_tokens, 0);
    assert_eq!(d.output_tokens, 0);
    assert_eq!(d.total_tokens, 0);
}

#[test]
fn extract_stop_reason_returns_error_reason_and_message() {
    let message = json!({
        "stopReason": "error",
        "errorMessage": "You have hit your ChatGPT usage limit"
    });

    let parsed = extract_stop_reason(&message);
    assert_eq!(
        parsed,
        Some((
            "error".to_string(),
            Some("You have hit your ChatGPT usage limit".to_string())
        ))
    );
}

#[test]
fn extract_stop_reason_ignores_end_turn_and_missing_stop_reason() {
    let end_turn_message = json!({
        "stopReason": "end_turn",
        "errorMessage": "ignored"
    });
    assert_eq!(extract_stop_reason(&end_turn_message), None);

    let missing_stop_reason = json!({
        "errorMessage": "missing reason"
    });
    assert_eq!(extract_stop_reason(&missing_stop_reason), None);
}

#[test]
fn has_rate_limit_hint_detects_expected_keywords() {
    assert!(has_rate_limit_hint("Rate limit exceeded. Retry after 12s."));
    assert!(has_rate_limit_hint(
        "You have hit your usage limit for today."
    ));
    assert!(has_rate_limit_hint(
        "Please retry this request in a moment."
    ));
    assert!(!has_rate_limit_hint("Model returned malformed JSON"));
}

fn write_script(dir: &Path, name: &str, content: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, content).expect("write script");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .expect("chmod script");
    }
    path
}

fn make_rpc_test_config(
    script_path: &Path,
    read_timeout_ms: u64,
    stall_timeout_ms: u64,
) -> PiAgentConfig {
    PiAgentConfig {
        command: vec![
            "bash".to_string(),
            script_path.to_string_lossy().to_string(),
        ],
        read_timeout_ms,
        stall_timeout_ms,
        ..PiAgentConfig::default()
    }
}

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

const SCRIPT_BASIC_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-123"}}'

while read -r line; do
  if [[ "$line" == *'"type":"prompt"'* ]]; then
    echo '{"type":"response","command":"prompt","success":true}'
    echo '{"type":"tool_execution_start","toolName":"bash","args":{"command":"echo hi"}}'
    echo '{"type":"message_end","message":{"content":[{"type":"text","text":"done"}]}}'
    echo '{"type":"agent_end","messages":[]}'
  elif [[ "$line" == *'"type":"get_session_stats"'* ]]; then
    echo '{"type":"response","command":"get_session_stats","success":true,"data":{"session_id":"sess-123","tokens":{"input":10,"output":4,"total":14}}}'
  elif [[ "$line" == *'"type":"abort"'* ]]; then
    exit 0
  fi
done
"#;

const SCRIPT_ERROR_STOP_REASON_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-error"}}'

while read -r line; do
  if [[ "$line" == *'"type":"prompt"'* ]]; then
    echo '{"type":"response","command":"prompt","success":true}'
    # Simulate a transient API error followed by pi-agent internal retry and
    # successful completion — mirrors what happens in production: message_end
    # with stopReason="error" is intermediate, pi-agent retries, then emits a
    # successful message_end before agent_end.
    echo '{"type":"message_end","message":{"stopReason":"error","errorMessage":"Rate limit exceeded. Retry after 12s.","content":[]}}'
    echo '{"type":"message_end","message":{"stopReason":"toolUse","content":[{"type":"text","text":"retried successfully"}]}}'
    echo '{"type":"agent_end","messages":[]}'
  elif [[ "$line" == *'"type":"get_session_stats"'* ]]; then
    echo '{"type":"response","command":"get_session_stats","success":true,"data":{"session_id":"sess-error","tokens":{"input":5,"output":2,"total":7}}}'
  elif [[ "$line" == *'"type":"abort"'* ]]; then
    exit 0
  fi
done
"#;

const SCRIPT_ESCALATION_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-escalation"}}'

while read -r line; do
  if [[ "$line" == *'"type":"prompt"'* ]]; then
    echo '{"type":"response","command":"prompt","success":true}'
    echo '{"type":"extension_ui_request","id":"req-ask","method":"ask_user_questions","questions":[{"id":"q1","header":"Choice","question":"Pick one","options":[{"label":"A","description":"Alpha"}]}]}'
    read -r ui_response
    if [[ "$ui_response" == *'"extension_ui_response"'* ]]; then
      echo '{"type":"message_end","message":{"content":[{"type":"text","text":"resumed"}]}}'
      echo '{"type":"agent_end","messages":[]}'
    fi
  elif [[ "$line" == *'"type":"get_session_stats"'* ]]; then
    echo '{"type":"response","command":"get_session_stats","success":true,"data":{"session_id":"sess-escalation","tokens":{"input":7,"output":3,"total":10}}}'
  elif [[ "$line" == *'"type":"abort"'* ]]; then
    exit 0
  fi
done
"#;

const SCRIPT_AGENT_END_BEFORE_MESSAGE_END_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-agent-end"}}'

while read -r line; do
  if [[ "$line" == *'"type":"prompt"'* ]]; then
    echo '{"type":"response","command":"prompt","success":true}'
    echo '{"type":"agent_end","messages":[]}'
  elif [[ "$line" == *'"type":"get_session_stats"'* ]]; then
    echo '{"type":"response","command":"get_session_stats","success":true,"data":{"session_id":"sess-agent-end","tokens":{"input":1,"output":0,"total":1}}}'
  elif [[ "$line" == *'"type":"abort"'* ]]; then
    exit 0
  fi
done
"#;

const SCRIPT_EXIT_AFTER_HANDSHAKE_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-exit"}}'
exit 0
"#;

const SCRIPT_CLOSE_STDIN_AFTER_HANDSHAKE_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-stdin-closed"}}'
exec 0<&-
sleep 2
"#;

const SCRIPT_STALL_AFTER_PROMPT_RPC: &str = r#"#!/bin/bash
set -euo pipefail

read -r line # get_state
echo '{"type":"response","command":"get_state","success":true,"data":{"sessionId":"sess-stall"}}'

while read -r line; do
  if [[ "$line" == *'"type":"prompt"'* ]]; then
    echo '{"type":"response","command":"prompt","success":true}'
    sleep 2
  elif [[ "$line" == *'"type":"abort"'* ]]; then
    exit 0
  fi
done
"#;

#[tokio::test]
async fn rpc_bridge_start_turn_stop_smoke() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(scripts_dir.path(), "fake-kata.sh", SCRIPT_BASIC_RPC);
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();

    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let mut events = Vec::new();
    let turn = rpc_bridge::run_turn(&mut handle, "hello", |event| events.push(event))
        .await
        .expect("run_turn succeeds");

    assert_eq!(turn.output_text.as_deref(), Some("done"));
    assert_eq!(turn.input_tokens, 10);
    assert_eq!(turn.output_tokens, 4);
    assert_eq!(turn.total_tokens, 14);
    assert!(
        events
            .iter()
            .any(|event| matches!(event, symphony::domain::AgentEvent::TurnCompleted { .. })),
        "TurnCompleted event should be emitted"
    );

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}

#[tokio::test]
async fn rpc_bridge_run_turn_handles_stdin_write_failure() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-close-stdin-after-handshake.sh",
        SCRIPT_CLOSE_STDIN_AFTER_HANDSHAKE_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let err = rpc_bridge::run_turn(&mut handle, "hello", |_| {})
        .await
        .expect_err("run_turn should fail when stdin closes before prompt write");

    match err {
        symphony::error::SymphonyError::PiAgentError(message) => {
            assert!(
                message.contains("failed to write stdin")
                    || message.contains("failed to flush stdin")
                    || message.contains("stdout closed unexpectedly"),
                "expected stdin/write-side failure signal, got: {message}"
            );
        }
        other => panic!("expected PiAgentError, got {other:?}"),
    }

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds even after write failure");
}

#[tokio::test]
async fn rpc_bridge_run_turn_handles_agent_end_before_message_end() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-agent-end-first.sh",
        SCRIPT_AGENT_END_BEFORE_MESSAGE_END_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let turn = rpc_bridge::run_turn(&mut handle, "hello", |_| {})
        .await
        .expect("run_turn should succeed when agent_end arrives before message_end");

    assert_eq!(
        turn.output_text, None,
        "output text should remain None when no message_end payload is emitted"
    );

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}

#[tokio::test]
async fn rpc_bridge_run_turn_surfaces_stall_timeout() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-stall.sh",
        SCRIPT_STALL_AFTER_PROMPT_RPC,
    );
    let config = make_rpc_test_config(&script_path, 50, 150);

    let issue = make_test_issue();
    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let err = rpc_bridge::run_turn(&mut handle, "hello", |_| {})
        .await
        .expect_err("run_turn should fail when no output arrives before stall timeout");

    match err {
        symphony::error::SymphonyError::PiAgentError(message) => {
            assert!(
                message.contains("read timed out"),
                "expected stall timeout message, got: {message}"
            );
        }
        other => panic!("expected PiAgentError, got {other:?}"),
    }

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds after timeout");
}

#[tokio::test]
async fn rpc_bridge_stop_session_handles_process_already_exited() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-stop-after-exit.sh",
        SCRIPT_EXIT_AFTER_HANDSHAKE_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session should gracefully handle already-exited process");
}

#[tokio::test]
async fn rpc_bridge_turn_continues_past_message_end_error_stop_reason() {
    // Pi-agent retries transient API errors internally. A message_end with
    // stopReason="error" is NOT fatal — the RPC bridge should continue the
    // read loop until agent_end, emitting TurnEndedWithError as a non-fatal
    // notification. The turn completes normally.
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-error-stop-reason.sh",
        SCRIPT_ERROR_STOP_REASON_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, _escalation_rx) = tokio::sync::mpsc::unbounded_channel();
    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 60_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let mut events = Vec::new();
    let result = rpc_bridge::run_turn(&mut handle, "hello", |event| events.push(event))
        .await
        .expect("run_turn should succeed despite transient stopReason=error");

    // The transient error should be surfaced as TurnEndedWithError (non-fatal)
    assert!(
        events.iter().any(|event| matches!(
            event,
            symphony::domain::AgentEvent::TurnEndedWithError { .. }
        )),
        "TurnEndedWithError event should be emitted for transient API errors"
    );

    // But the turn should NOT be treated as failed
    assert!(
        !events
            .iter()
            .any(|event| matches!(event, symphony::domain::AgentEvent::TurnFailed { .. })),
        "TurnFailed should NOT be emitted for transient API errors"
    );

    // The turn should complete normally after the agent retries internally
    assert!(
        events
            .iter()
            .any(|event| matches!(event, symphony::domain::AgentEvent::TurnCompleted { .. })),
        "TurnCompleted event should be emitted after agent retry succeeds"
    );

    // output_text should come from the successful retry, not the failed attempt
    assert_eq!(
        result.output_text.as_deref(),
        Some("retried successfully"),
        "output_text should be captured from the successful retry message_end"
    );

    assert_eq!(result.total_tokens, 7, "tokens from stats response");

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}

#[tokio::test]
async fn rpc_bridge_escalation_holds_and_resumes_with_response() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-escalation.sh",
        SCRIPT_ESCALATION_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, mut escalation_rx) = tokio::sync::mpsc::unbounded_channel();

    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 5_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let (turn, captured_events) = {
        let events = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let events_for_callback = std::sync::Arc::clone(&events);
        let turn_future = rpc_bridge::run_turn(&mut handle, "hello", move |event| {
            events_for_callback.lock().expect("events lock").push(event);
        });
        tokio::pin!(turn_future);

        let dispatch = loop {
            tokio::select! {
                maybe_dispatch = escalation_rx.recv() => {
                    break maybe_dispatch.expect("expected escalation dispatch");
                }
                result = &mut turn_future => {
                    panic!("turn finished before escalation dispatch: {result:?}");
                }
            }
        };

        assert_eq!(dispatch.request.method, "ask_user_questions");

        dispatch
            .response_tx
            .send(EscalationResponse {
                request_id: dispatch.request.id.clone(),
                response: json!({
                    "response": [
                        {
                            "id": "q1",
                            "selected": "A",
                            "notes": "operator answer"
                        }
                    ]
                }),
                responder_id: Some("operator-1".to_string()),
                responded_at: chrono::Utc::now(),
            })
            .expect("response should be accepted");

        let turn = turn_future
            .await
            .expect("turn should complete after escalation response");
        let captured_events = events.lock().expect("events lock").clone();
        (turn, captured_events)
    };

    assert_eq!(turn.output_text.as_deref(), Some("resumed"));
    assert!(
        captured_events.iter().any(|event| matches!(
            event,
            symphony::domain::AgentEvent::EscalationCreated { .. }
        )),
        "EscalationCreated should be emitted"
    );
    assert!(
        captured_events.iter().any(|event| matches!(
            event,
            symphony::domain::AgentEvent::EscalationResponded { .. }
        )),
        "EscalationResponded should be emitted"
    );

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}

#[tokio::test]
async fn rpc_bridge_escalation_times_out_and_falls_back() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-escalation-timeout.sh",
        SCRIPT_ESCALATION_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, mut escalation_rx) = tokio::sync::mpsc::unbounded_channel();

    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 50,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let mut events = Vec::new();
    let turn = rpc_bridge::run_turn(&mut handle, "hello", |event| events.push(event))
        .await
        .expect("run_turn should complete with timeout fallback");

    let _ = escalation_rx
        .try_recv()
        .expect("escalation should still be dispatched");

    assert_eq!(turn.output_text.as_deref(), Some("resumed"));
    assert!(
        events.iter().any(|event| matches!(
            event,
            symphony::domain::AgentEvent::EscalationTimedOut { .. }
        )),
        "EscalationTimedOut should be emitted"
    );

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}

#[tokio::test]
async fn rpc_bridge_escalation_channel_close_emits_cancelled() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(
        scripts_dir.path(),
        "fake-kata-escalation-channel-closed.sh",
        SCRIPT_ESCALATION_RPC,
    );
    let config = make_rpc_test_config(&script_path, 5_000, 10_000);

    let issue = make_test_issue();
    let (escalation_tx, mut escalation_rx) = tokio::sync::mpsc::unbounded_channel();

    let mut handle = rpc_bridge::start_session(
        &config,
        &issue,
        &workspace,
        root_dir.path(),
        rpc_bridge::StartSessionOptions {
            worker_host: None,
            container_id: None,
            escalation_tx,
            escalation_timeout_ms: 5_000,
            model_override: None,
            symphony_bin: None,
            symphony_workflow_path: None,
        },
    )
    .await
    .expect("start_session succeeds");

    let mut events = Vec::new();
    let turn_task = tokio::spawn(async move {
        rpc_bridge::run_turn(&mut handle, "hello", |event| events.push(event))
            .await
            .map(|turn| (turn, events, handle))
    });

    let dispatch = escalation_rx
        .recv()
        .await
        .expect("escalation dispatch should be emitted");
    drop(dispatch.response_tx);

    let (turn, events, handle) = turn_task
        .await
        .expect("join run_turn task")
        .expect("run_turn should complete with fallback");

    assert_eq!(turn.output_text.as_deref(), Some("resumed"));
    assert!(
        events.iter().any(|event| matches!(
            event,
            symphony::domain::AgentEvent::EscalationCancelled { reason, .. }
                if reason == "response_channel_closed"
        )),
        "EscalationCancelled should be emitted when response channel closes"
    );

    rpc_bridge::stop_session(handle)
        .await
        .expect("stop_session succeeds");
}
