//! Tests for pi-agent protocol serde and token accounting.

use serde_json::json;
use std::path::Path;
use symphony::pi_agent::protocol::{
    ExtensionUIResponse, RpcCommand, RpcOutputLine, SessionStats, SessionTokens,
};
use symphony::pi_agent::rpc_bridge;
use symphony::pi_agent::token_accounting::TokenTracker;
use symphony::{domain::Issue, domain::PiAgentConfig};

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

#[tokio::test]
async fn rpc_bridge_start_turn_stop_smoke() {
    let scripts_dir = tempfile::tempdir().expect("scripts dir");
    let root_dir = tempfile::tempdir().expect("root dir");
    let workspace = root_dir.path().join("workspace");
    std::fs::create_dir_all(&workspace).expect("workspace");

    let script_path = write_script(scripts_dir.path(), "fake-kata.sh", SCRIPT_BASIC_RPC);
    let config = PiAgentConfig {
        command: vec![script_path.to_string_lossy().to_string()],
        read_timeout_ms: 5_000,
        stall_timeout_ms: 10_000,
        ..PiAgentConfig::default()
    };

    let issue = make_test_issue();

    let mut handle =
        rpc_bridge::start_session(&config, &issue, &workspace, root_dir.path(), None, None)
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
