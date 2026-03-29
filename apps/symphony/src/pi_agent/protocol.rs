//! Pi RPC protocol types used by Symphony.
//!
//! This module intentionally models only the subset of the protocol used by
//! Symphony's non-interactive worker runtime.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A command sent to a pi RPC process over stdin.
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum RpcCommand {
    #[serde(rename = "prompt")]
    Prompt {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
    #[serde(rename = "abort")]
    Abort {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "get_state")]
    GetState {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "get_session_stats")]
    GetSessionStats {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "follow_up")]
    FollowUp {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
}

/// A command response emitted by pi RPC on stdout.
#[derive(Debug, Deserialize)]
pub struct RpcResponse {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    #[serde(default)]
    pub type_: String,
    pub command: String,
    pub success: bool,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Cumulative token counters returned from `get_session_stats`.
#[derive(Debug, Clone, Deserialize, Default, PartialEq, Eq)]
pub struct SessionTokens {
    #[serde(default)]
    pub input: u64,
    #[serde(default)]
    pub output: u64,
    #[serde(default, rename = "cacheRead")]
    pub cache_read: u64,
    #[serde(default, rename = "cacheWrite")]
    pub cache_write: u64,
    #[serde(default)]
    pub total: u64,
}

/// Session stats payload returned by `get_session_stats`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct SessionStats {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub user_messages: u64,
    #[serde(default)]
    pub assistant_messages: u64,
    #[serde(default)]
    pub tool_calls: u64,
    #[serde(default)]
    pub total_messages: u64,
    #[serde(default)]
    pub tokens: SessionTokens,
    #[serde(default)]
    pub cost: f64,
}

/// A parsed stdout line from pi RPC.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum RpcOutputLine {
    #[serde(rename = "response")]
    Response(RpcResponse),

    #[serde(rename = "agent_start")]
    AgentStart,
    #[serde(rename = "agent_end")]
    AgentEnd {
        #[serde(default)]
        messages: Value,
    },

    #[serde(rename = "turn_start")]
    TurnStart,
    #[serde(rename = "turn_end")]
    TurnEnd {
        #[serde(default)]
        message: Value,
    },

    #[serde(rename = "message_start")]
    MessageStart {
        #[serde(default)]
        message: Value,
    },
    #[serde(rename = "message_update")]
    MessageUpdate {
        #[serde(default)]
        message: Value,
    },
    #[serde(rename = "message_end")]
    MessageEnd {
        #[serde(default)]
        message: Value,
    },

    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
        #[serde(default)]
        args: Value,
    },
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
    },
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
        #[serde(default, rename = "isError")]
        is_error: bool,
    },

    #[serde(rename = "auto_compaction_start")]
    AutoCompactionStart {
        #[serde(default)]
        reason: Option<String>,
    },
    #[serde(rename = "auto_compaction_end")]
    AutoCompactionEnd {
        #[serde(default)]
        aborted: bool,
    },

    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        #[serde(default)]
        attempt: u32,
        #[serde(default)]
        max_attempts: u32,
        #[serde(default)]
        delay_ms: u64,
        #[serde(default)]
        error_message: Option<String>,
    },
    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd {
        #[serde(default)]
        success: bool,
    },

    #[serde(rename = "extension_ui_request")]
    ExtensionUIRequest {
        id: String,
        method: String,
        #[serde(default, flatten)]
        extra: Value,
    },

    #[serde(rename = "extension_error")]
    ExtensionError {
        #[serde(default)]
        extension_path: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
}

/// Extract a non-terminal stop reason and optional provider error message.
///
/// Returns `None` when `stopReason` is missing/empty or equals `end_turn`
/// (case-insensitive), which is treated as the normal completion signal.
pub fn extract_stop_reason(message: &Value) -> Option<(String, Option<String>)> {
    let stop_reason = message
        .get("stopReason")
        .or_else(|| message.get("stop_reason"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();

    if stop_reason.eq_ignore_ascii_case("end_turn") {
        return None;
    }

    let error_message = message
        .get("errorMessage")
        .or_else(|| message.get("error_message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);

    Some((stop_reason, error_message))
}

/// Heuristic for provider messages that indicate rate-limit style failures.
pub fn has_rate_limit_hint(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("rate limit")
        || normalized.contains("usage limit")
        || normalized.contains("retry")
}

/// Response payload for extension UI requests in non-interactive mode.
#[derive(Debug, Serialize)]
pub struct ExtensionUIResponse {
    #[serde(rename = "type")]
    pub type_: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

impl ExtensionUIResponse {
    /// Cancel interactive prompts such as select/input/editor.
    pub fn cancel(id: String) -> Self {
        Self {
            type_: "extension_ui_response".to_string(),
            id,
            cancelled: Some(true),
            confirmed: None,
            value: None,
        }
    }

    /// Reject interactive confirmations.
    pub fn reject(id: String) -> Self {
        Self {
            type_: "extension_ui_response".to_string(),
            id,
            cancelled: None,
            confirmed: Some(false),
            value: None,
        }
    }

    /// Build a response envelope from an arbitrary payload.
    ///
    /// If `payload` is an object, keys are merged into the top-level response
    /// object, excluding reserved envelope keys (`type`, `id`). Otherwise payload
    /// is emitted under `value`.
    pub fn from_payload(id: String, payload: Value) -> Value {
        let mut object = serde_json::Map::new();

        match payload {
            Value::Object(map) => {
                for (key, value) in map {
                    if key != "type" && key != "id" {
                        object.insert(key, value);
                    }
                }
            }
            other => {
                object.insert("value".to_string(), other);
            }
        }

        object.insert(
            "type".to_string(),
            Value::String("extension_ui_response".to_string()),
        );
        object.insert("id".to_string(), Value::String(id));

        Value::Object(object)
    }
}
