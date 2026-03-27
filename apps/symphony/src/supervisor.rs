use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, LazyLock, RwLock};
use std::time::Duration;

use chrono::{DateTime, Utc};
use regex::Regex;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use uuid::Uuid;

use crate::domain::{
    ContextScope, EscalationRequest, EventKind, EventSeverity, SupervisorConfig, SupervisorSnapshot,
    SupervisorStatus, SymphonyEventEnvelope,
};
use crate::error::{Result, SymphonyError};
use crate::event_stream::EventHub;
use crate::orchestrator::EscalationRegistry;
use crate::session_summary::{normalize_whitespace, truncate_for_display};
use crate::shared_context::{ContextEntryDraft, SharedContextStore};

const RECENT_EVENT_BUFFER: usize = 20;
const REPEATED_TOOL_ERROR_THRESHOLD: u32 = 3;
const NO_PROGRESS_EVENT_THRESHOLD: u32 = 5;
const REPEATED_TEST_FAILURE_THRESHOLD: u32 = 2;
const FILE_CONFLICT_WINDOW_MS: i64 = 300_000;
const CONFLICT_DEDUP_WINDOW_MS: i64 = 120_000;
const SUPERVISOR_ESCALATION_TIMEOUT_MS: u64 = 300_000;

static FILE_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?P<path>[A-Za-z0-9_./-]+\.(rs|toml|json|ya?ml|md|ts|tsx|js|jsx|py|go|java|swift))")
        .expect("file path regex must compile")
});

/// Runtime dependencies used by the supervisor background task.
#[derive(Clone)]
pub struct SupervisorDependencies {
    pub event_hub: EventHub,
    pub shared_context_store: SharedContextStore,
    pub escalation_registry: EscalationRegistry,
}

impl SupervisorDependencies {
    pub fn new(
        event_hub: EventHub,
        shared_context_store: SharedContextStore,
        escalation_registry: EscalationRegistry,
    ) -> Self {
        Self {
            event_hub,
            shared_context_store,
            escalation_registry,
        }
    }
}

#[derive(Debug, Default)]
struct SupervisorRuntimeState {
    snapshot: SupervisorSnapshot,
    workers: HashMap<String, WorkerModel>,
    recent_conflicts: HashMap<String, DateTime<Utc>>,
    escalated_context_conflicts: HashMap<String, DateTime<Utc>>,
}

#[derive(Debug, Default)]
struct WorkerModel {
    recent_events: VecDeque<String>,
    turn_count: u32,
    error_count: u32,
    events_since_file_edit: u32,
    last_tool_error_signature: Option<String>,
    consecutive_tool_error_count: u32,
    repeated_test_failures: HashMap<String, u32>,
    recent_file_edits: HashMap<String, DateTime<Utc>>,
    last_steer_at: Option<DateTime<Utc>>,
}

impl WorkerModel {
    fn observe_event(&mut self, envelope: &SymphonyEventEnvelope) -> Option<String> {
        self.push_recent_event(envelope.event.clone());

        if envelope.event == "turn_completed" {
            self.turn_count = self.turn_count.saturating_add(1);
        }

        let summary = event_summary_text(envelope);
        let edited_path = file_edit_path(envelope, summary.as_deref());
        if let Some(path) = edited_path.clone() {
            self.events_since_file_edit = 0;
            self.record_file_edit(path, envelope.timestamp);
        } else {
            self.events_since_file_edit = self.events_since_file_edit.saturating_add(1);
        }

        if is_error_event(&envelope.event) {
            self.error_count = self.error_count.saturating_add(1);
        }

        if envelope.event == "tool_error" {
            let signature = tool_error_signature(summary.as_deref());
            if self.last_tool_error_signature.as_deref() == Some(signature.as_str()) {
                self.consecutive_tool_error_count = self
                    .consecutive_tool_error_count
                    .saturating_add(1);
            } else {
                self.last_tool_error_signature = Some(signature);
                self.consecutive_tool_error_count = 1;
            }
        } else {
            self.consecutive_tool_error_count = 0;
            self.last_tool_error_signature = None;
        }

        if let Some(test_signature) = repeated_test_failure_signature(summary.as_deref()) {
            let counter = self.repeated_test_failures.entry(test_signature).or_insert(0);
            *counter = counter.saturating_add(1);
        }

        edited_path
    }

    fn detect_stuck_reason(&self) -> Option<StuckReason> {
        if self.consecutive_tool_error_count >= REPEATED_TOOL_ERROR_THRESHOLD {
            return Some(StuckReason::RepeatedToolError {
                signature: self
                    .last_tool_error_signature
                    .clone()
                    .unwrap_or_else(|| "tool_error".to_string()),
                count: self.consecutive_tool_error_count,
            });
        }

        if self.events_since_file_edit >= NO_PROGRESS_EVENT_THRESHOLD
            && self.recent_events.len() >= NO_PROGRESS_EVENT_THRESHOLD as usize
        {
            return Some(StuckReason::NoProgress {
                events_without_edit: self.events_since_file_edit,
            });
        }

        let mut top_failure: Option<(String, u32)> = None;
        for (signature, count) in &self.repeated_test_failures {
            if *count >= REPEATED_TEST_FAILURE_THRESHOLD {
                match &top_failure {
                    Some((_, current_count)) if *current_count >= *count => {}
                    _ => top_failure = Some((signature.clone(), *count)),
                }
            }
        }

        top_failure.map(|(signature, count)| StuckReason::RepeatedTestFailure { signature, count })
    }

    fn record_file_edit(&mut self, path: String, at: DateTime<Utc>) {
        self.recent_file_edits.insert(path, at);
    }

    fn has_recent_file_edit(&self, path: &str, now: DateTime<Utc>) -> bool {
        let Some(last_edit) = self.recent_file_edits.get(path) else {
            return false;
        };

        now.signed_duration_since(*last_edit).num_milliseconds() <= FILE_CONFLICT_WINDOW_MS
    }

    fn can_steer(&self, now: DateTime<Utc>, cooldown_ms: u64) -> bool {
        let Some(last_steer_at) = self.last_steer_at else {
            return true;
        };

        let elapsed = now
            .signed_duration_since(last_steer_at)
            .num_milliseconds()
            .max(0) as u64;

        elapsed >= cooldown_ms
    }

    fn mark_steer(&mut self, at: DateTime<Utc>) {
        self.last_steer_at = Some(at);
    }

    fn push_recent_event(&mut self, event: String) {
        self.recent_events.push_back(event);
        while self.recent_events.len() > RECENT_EVENT_BUFFER {
            let _ = self.recent_events.pop_front();
        }
    }
}

#[derive(Debug, Clone)]
enum StuckReason {
    RepeatedToolError { signature: String, count: u32 },
    NoProgress { events_without_edit: u32 },
    RepeatedTestFailure { signature: String, count: u32 },
}

impl StuckReason {
    fn code(&self) -> &'static str {
        match self {
            Self::RepeatedToolError { .. } => "repeated_tool_error",
            Self::NoProgress { .. } => "no_progress",
            Self::RepeatedTestFailure { .. } => "repeated_test_failure",
        }
    }

    fn guidance(&self) -> String {
        match self {
            Self::RepeatedToolError { signature, count } => format!(
                "You've hit the same tool error {count} times ({signature}). Slow down, inspect the full error, and adjust the next tool call arguments before retrying.",
            ),
            Self::NoProgress {
                events_without_edit,
            } => format!(
                "No file edits were observed for the last {events_without_edit} events. Make one small, verifiable edit to unblock forward progress before running more commands.",
            ),
            Self::RepeatedTestFailure { signature, count } => format!(
                "The same test failure repeated {count} times ({signature}). Re-check the failing test setup and verify assumptions before rerunning the suite.",
            ),
        }
    }

    fn brief(&self) -> String {
        match self {
            Self::RepeatedToolError { signature, count } => {
                format!("tool error repeated {count}x: {signature}")
            }
            Self::NoProgress {
                events_without_edit,
            } => {
                format!("no edits for {events_without_edit} events")
            }
            Self::RepeatedTestFailure { signature, count } => {
                format!("test failure repeated {count}x: {signature}")
            }
        }
    }
}

/// Background supervisor task lifecycle controller.
pub struct SupervisorAgent {
    config: SupervisorConfig,
    deps: SupervisorDependencies,
    state: Arc<RwLock<SupervisorRuntimeState>>,
    shutdown_tx: Option<watch::Sender<bool>>,
    task: Option<JoinHandle<()>>,
}

impl SupervisorAgent {
    pub fn new(config: SupervisorConfig, deps: SupervisorDependencies) -> Self {
        let initial_snapshot = if config.enabled {
            SupervisorSnapshot::idle(config.model.clone())
        } else {
            SupervisorSnapshot::disabled(config.model.clone())
        };

        Self {
            config,
            deps,
            state: Arc::new(RwLock::new(SupervisorRuntimeState {
                snapshot: initial_snapshot,
                workers: HashMap::new(),
                recent_conflicts: HashMap::new(),
                escalated_context_conflicts: HashMap::new(),
            })),
            shutdown_tx: None,
            task: None,
        }
    }

    /// Start the supervisor event-consumer loop.
    pub fn start(&mut self) -> Result<()> {
        if !self.config.enabled {
            self.update_snapshot_status(SupervisorStatus::Disabled, Some("supervisor disabled"));
            return Ok(());
        }

        if self.task.is_some() {
            return Ok(());
        }

        if tokio::runtime::Handle::try_current().is_err() {
            return Err(SymphonyError::Other(
                "cannot start supervisor outside an active tokio runtime".to_string(),
            ));
        }

        let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
        let mut events = self.deps.event_hub.subscribe();
        let state = Arc::clone(&self.state);
        let deps = self.deps.clone();
        let config = self.config.clone();

        self.shutdown_tx = Some(shutdown_tx);
        self.update_snapshot_status(SupervisorStatus::Starting, Some("starting supervisor"));

        let task = tokio::spawn(async move {
            {
                let mut guard = state
                    .write()
                    .expect("supervisor state lock poisoned on start");
                guard.snapshot.status = SupervisorStatus::Active;
                guard.snapshot.model = config.model.clone();
                guard.snapshot.last_decision = Some("subscribed_to_event_stream".to_string());
                guard.snapshot.last_action_at = Some(Utc::now());
            }

            deps.event_hub.publish(
                EventKind::Runtime,
                EventSeverity::Info,
                None,
                "supervisor_started",
                serde_json::json!({}),
            );

            loop {
                tokio::select! {
                    _ = shutdown_rx.changed() => {
                        break;
                    }
                    recv = events.recv() => {
                        match recv {
                            Ok(envelope) => {
                                if should_ignore_event(&envelope) {
                                    continue;
                                }
                                process_envelope(&state, &config, &deps, envelope);
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                                tracing::warn!(
                                    event = "supervisor_event_stream_lagged",
                                    skipped,
                                    "supervisor lagged behind event stream"
                                );
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }
            }

            {
                let mut guard = state
                    .write()
                    .expect("supervisor state lock poisoned on shutdown");
                guard.snapshot.status = SupervisorStatus::Stopped;
                guard.snapshot.last_decision = Some("stopped".to_string());
                guard.snapshot.last_action_at = Some(Utc::now());
            }

            deps.event_hub.publish(
                EventKind::Runtime,
                EventSeverity::Info,
                None,
                "supervisor_stopped",
                serde_json::json!({}),
            );
        });

        self.task = Some(task);
        Ok(())
    }

    /// Request a graceful shutdown and await the background task.
    pub async fn stop(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(true);
        }

        if let Some(task) = self.task.take() {
            match tokio::time::timeout(Duration::from_secs(2), task).await {
                Ok(Ok(())) => {}
                Ok(Err(join_err)) => {
                    tracing::warn!(
                        event = "supervisor_join_failed",
                        error = %join_err,
                        "supervisor task ended with join error"
                    );
                }
                Err(_) => {
                    tracing::warn!(
                        event = "supervisor_shutdown_timeout",
                        "supervisor did not stop within timeout"
                    );
                }
            }
        }

        if self.config.enabled {
            self.update_snapshot_status(SupervisorStatus::Stopped, Some("stopped supervisor"));
        } else {
            self.update_snapshot_status(SupervisorStatus::Disabled, Some("supervisor disabled"));
        }
    }

    /// Immediate shutdown helper for non-async contexts (Drop / tests).
    pub fn abort(&mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(true);
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }

        if self.config.enabled {
            self.update_snapshot_status(SupervisorStatus::Stopped, Some("aborted supervisor"));
        } else {
            self.update_snapshot_status(SupervisorStatus::Disabled, Some("supervisor disabled"));
        }
    }

    pub fn is_running(&self) -> bool {
        self.task.is_some()
    }

    pub fn snapshot(&self) -> SupervisorSnapshot {
        self.state
            .read()
            .expect("supervisor state lock poisoned while reading")
            .snapshot
            .clone()
    }

    fn update_snapshot_status(&self, status: SupervisorStatus, decision: Option<&str>) {
        let mut guard = self
            .state
            .write()
            .expect("supervisor state lock poisoned while updating status");
        guard.snapshot.status = status;
        guard.snapshot.model = self.config.model.clone();
        guard.snapshot.last_decision = decision.map(ToString::to_string);
        guard.snapshot.last_action_at = Some(Utc::now());
    }
}

fn process_envelope(
    state: &Arc<RwLock<SupervisorRuntimeState>>,
    config: &SupervisorConfig,
    deps: &SupervisorDependencies,
    envelope: SymphonyEventEnvelope,
) {
    let now = envelope.timestamp;
    let mut guard = state
        .write()
        .expect("supervisor state lock poisoned while processing event");

    guard.snapshot.last_decision = Some(format!("observed:{}", envelope.event));
    guard.snapshot.last_action_at = Some(Utc::now());

    if let Some(issue_identifier) = envelope.issue.clone() {
        let edited_path = {
            let worker = guard.workers.entry(issue_identifier.clone()).or_default();
            worker.observe_event(&envelope)
        };

        maybe_emit_stuck_steer(&mut guard, config, deps, &issue_identifier, now);

        if let Some(path) = edited_path {
            maybe_handle_file_conflict(
                &mut guard,
                config,
                deps,
                &issue_identifier,
                &path,
                now,
            );
        }
    }

    if envelope.kind == EventKind::SharedContextWritten || envelope.event == "shared_context_written"
    {
        maybe_handle_context_conflict(&mut guard, deps, now);
    }
}

fn maybe_emit_stuck_steer(
    state: &mut SupervisorRuntimeState,
    config: &SupervisorConfig,
    deps: &SupervisorDependencies,
    issue_identifier: &str,
    now: DateTime<Utc>,
) {
    let Some(stuck_reason) = state
        .workers
        .get(issue_identifier)
        .and_then(WorkerModel::detect_stuck_reason)
    else {
        return;
    };

    let Some(worker) = state.workers.get_mut(issue_identifier) else {
        return;
    };

    if !worker.can_steer(now, config.steer_cooldown_ms) {
        return;
    }

    worker.mark_steer(now);
    emit_supervisor_steer(
        state,
        deps,
        issue_identifier,
        stuck_reason.code(),
        &stuck_reason.brief(),
        &stuck_reason.guidance(),
        config.steer_cooldown_ms,
    );
}

fn maybe_handle_file_conflict(
    state: &mut SupervisorRuntimeState,
    config: &SupervisorConfig,
    deps: &SupervisorDependencies,
    issue_identifier: &str,
    file_path: &str,
    now: DateTime<Utc>,
) {
    let conflicting_issue = state
        .workers
        .iter()
        .find_map(|(other_issue, worker)| {
            if other_issue == issue_identifier {
                return None;
            }
            if worker.has_recent_file_edit(file_path, now) {
                Some(other_issue.clone())
            } else {
                None
            }
        });

    let Some(other_issue) = conflicting_issue else {
        return;
    };

    let key = conflict_key(issue_identifier, &other_issue, file_path);
    if !should_emit_conflict(&mut state.recent_conflicts, &key, now) {
        return;
    }

    state.snapshot.conflicts_detected = state.snapshot.conflicts_detected.saturating_add(1);
    state.snapshot.last_decision = Some(format!(
        "conflict detected: {} vs {} on {}",
        issue_identifier, other_issue, file_path
    ));
    state.snapshot.last_action_at = Some(Utc::now());

    deps.shared_context_store.write_entry(ContextEntryDraft {
        author_issue: "SUPERVISOR".to_string(),
        scope: ContextScope::Project,
        content: format!(
            "⚠️ Potential overlap detected: {issue_identifier} and {other_issue} are both editing `{file_path}`. Coordinate before additional changes."
        ),
        ttl_ms: Some(30 * 60 * 1000),
    });

    deps.event_hub.publish(
        EventKind::SupervisorConflictDetected,
        EventSeverity::Warn,
        Some(issue_identifier.to_string()),
        "supervisor_conflict_detected",
        serde_json::json!({
            "issues": [issue_identifier, other_issue],
            "conflict_type": "file_overlap",
            "file_path": file_path,
        }),
    );

    if let Some(worker) = state.workers.get_mut(issue_identifier) {
        if worker.can_steer(now, config.steer_cooldown_ms) {
            worker.mark_steer(now);
            emit_supervisor_steer(
                state,
                deps,
                issue_identifier,
                "file_conflict",
                &format!("overlap with {other_issue} on {file_path}"),
                &format!(
                    "Another worker ({other_issue}) is editing `{file_path}`. Align with shared context before proceeding."
                ),
                config.steer_cooldown_ms,
            );
        }
    }
}

fn maybe_handle_context_conflict(
    state: &mut SupervisorRuntimeState,
    deps: &SupervisorDependencies,
    now: DateTime<Utc>,
) {
    let entries = deps.shared_context_store.list();
    let Some(conflict) = detect_context_conflict(&entries) else {
        return;
    };

    let key = format!(
        "{}:{}:{}",
        conflict.scope_key, conflict.decision_a, conflict.decision_b
    );

    if !should_emit_conflict(&mut state.escalated_context_conflicts, &key, now) {
        return;
    }

    state.snapshot.conflicts_detected = state.snapshot.conflicts_detected.saturating_add(1);
    state.snapshot.escalations_created = state.snapshot.escalations_created.saturating_add(1);
    state.snapshot.last_decision = Some(format!(
        "context conflict escalated: {} vs {} ({})",
        conflict.issue_a, conflict.issue_b, conflict.scope_key
    ));
    state.snapshot.last_action_at = Some(Utc::now());

    deps.event_hub.publish(
        EventKind::SupervisorConflictDetected,
        EventSeverity::Warn,
        Some(conflict.issue_a.clone()),
        "supervisor_conflict_detected",
        serde_json::json!({
            "issues": [conflict.issue_a, conflict.issue_b],
            "conflict_type": "context_decision_conflict",
            "scope": conflict.scope_key,
            "decisions": [conflict.decision_a, conflict.decision_b],
        }),
    );

    emit_supervisor_escalation(
        deps,
        &conflict.issue_a,
        "context_decision_conflict",
        serde_json::json!({
            "scope": conflict.scope_key,
            "issue_a": conflict.issue_a,
            "issue_b": conflict.issue_b,
            "decision_a": conflict.decision_a,
            "decision_b": conflict.decision_b,
        }),
    );
}

fn emit_supervisor_steer(
    state: &mut SupervisorRuntimeState,
    deps: &SupervisorDependencies,
    issue_identifier: &str,
    reason: &str,
    detail: &str,
    guidance: &str,
    cooldown_ms: u64,
) {
    let guidance_preview = truncate_for_display(guidance, 140);

    state.snapshot.steers_issued = state.snapshot.steers_issued.saturating_add(1);
    state.snapshot.last_decision = Some(format!("steered {} ({reason})", issue_identifier));
    state.snapshot.last_action_at = Some(Utc::now());

    deps.event_hub.publish(
        EventKind::SupervisorSteer,
        EventSeverity::Warn,
        Some(issue_identifier.to_string()),
        "supervisor_steer",
        serde_json::json!({
            "target_issue": issue_identifier,
            "reason": reason,
            "detail": truncate_for_display(detail, 120),
            "guidance_preview": guidance_preview,
            "steer_cooldown_ms": cooldown_ms,
        }),
    );
}

fn emit_supervisor_escalation(
    deps: &SupervisorDependencies,
    issue_identifier: &str,
    reason: &str,
    context: serde_json::Value,
) {
    let request = EscalationRequest {
        id: format!("supervisor-{}", Uuid::new_v4()),
        issue_id: issue_identifier.to_string(),
        issue_identifier: issue_identifier.to_string(),
        method: "supervisor_escalation".to_string(),
        payload: serde_json::json!({
            "question": format!(
                "Supervisor escalation for {issue_identifier}: {reason}. Please resolve the conflicting worker decisions."
            ),
            "reason": reason,
            "context": context,
        }),
        created_at: Utc::now(),
        timeout_ms: SUPERVISOR_ESCALATION_TIMEOUT_MS,
    };

    let (response_tx, response_rx) = tokio::sync::oneshot::channel();
    deps.escalation_registry.register(request.clone(), response_tx);
    tokio::spawn(async move {
        let _ = response_rx.await;
    });

    deps.event_hub.publish(
        EventKind::SupervisorEscalated,
        EventSeverity::Warn,
        Some(issue_identifier.to_string()),
        "supervisor_escalated",
        serde_json::json!({
            "issue": issue_identifier,
            "reason": reason,
            "context": truncate_for_display(&request.payload.to_string(), 160),
            "request_id": request.id,
        }),
    );
}

#[derive(Debug, Clone)]
struct ContextConflict {
    scope_key: String,
    issue_a: String,
    issue_b: String,
    decision_a: String,
    decision_b: String,
}

fn detect_context_conflict(entries: &[crate::domain::ContextEntry]) -> Option<ContextConflict> {
    for left in entries {
        if left.author_issue.eq_ignore_ascii_case("supervisor") {
            continue;
        }
        let decision_a = decision_token(&left.content)?;
        for right in entries {
            if left.id == right.id || left.scope != right.scope {
                continue;
            }
            if right.author_issue.eq_ignore_ascii_case("supervisor") {
                continue;
            }
            let decision_b = decision_token(&right.content)?;
            if decision_a == decision_b {
                continue;
            }

            return Some(ContextConflict {
                scope_key: left.scope.as_scope_key(),
                issue_a: left.author_issue.clone(),
                issue_b: right.author_issue.clone(),
                decision_a,
                decision_b,
            });
        }
    }

    None
}

fn decision_token(content: &str) -> Option<String> {
    let normalized = normalize_whitespace(content).to_ascii_lowercase();

    for marker in ["use ", "using ", "library ", "framework "] {
        let Some(index) = normalized.find(marker) else {
            continue;
        };

        let tail = &normalized[index + marker.len()..];
        let token: String = tail
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
            .collect();

        if !token.is_empty() {
            return Some(token);
        }
    }

    None
}

fn conflict_key(issue_a: &str, issue_b: &str, resource: &str) -> String {
    if issue_a <= issue_b {
        format!("{issue_a}|{issue_b}|{resource}")
    } else {
        format!("{issue_b}|{issue_a}|{resource}")
    }
}

fn should_emit_conflict(
    recent: &mut HashMap<String, DateTime<Utc>>,
    key: &str,
    now: DateTime<Utc>,
) -> bool {
    recent.retain(|_, at| now.signed_duration_since(*at).num_milliseconds() < CONFLICT_DEDUP_WINDOW_MS);

    if recent.contains_key(key) {
        return false;
    }

    recent.insert(key.to_string(), now);
    true
}

fn should_ignore_event(envelope: &SymphonyEventEnvelope) -> bool {
    matches!(
        envelope.kind,
        EventKind::Heartbeat
            | EventKind::SupervisorSteer
            | EventKind::SupervisorConflictDetected
            | EventKind::SupervisorEscalated
            | EventKind::SupervisorPatternDetected
    )
}

fn event_summary_text(envelope: &SymphonyEventEnvelope) -> Option<String> {
    envelope
        .payload
        .get("summary")
        .and_then(|value| value.as_str())
        .map(normalize_whitespace)
        .filter(|text| !text.is_empty())
        .or_else(|| {
            envelope
                .payload
                .get("error")
                .and_then(|value| value.as_str())
                .map(normalize_whitespace)
                .filter(|text| !text.is_empty())
        })
}

fn is_error_event(event_name: &str) -> bool {
    matches!(
        event_name,
        "tool_error" | "turn_failed" | "turn_ended_with_error" | "worker_failed"
    )
}

fn tool_error_signature(summary: Option<&str>) -> String {
    let normalized = summary
        .map(normalize_whitespace)
        .unwrap_or_else(|| "tool_error".to_string());
    truncate_for_display(&normalized, 80)
}

fn file_edit_path(envelope: &SymphonyEventEnvelope, summary: Option<&str>) -> Option<String> {
    if envelope.event != "tool_start" {
        return None;
    }

    let summary = summary?;
    let mut parts = summary.splitn(2, char::is_whitespace);
    let tool_name = parts
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let args_raw = parts.next().unwrap_or_default().trim();

    if matches!(tool_name.as_str(), "edit" | "write" | "append" | "read") {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(args_raw) {
            let path = parsed
                .get("path")
                .and_then(|value| value.as_str())
                .or_else(|| parsed.get("filePath").and_then(|value| value.as_str()))
                .or_else(|| parsed.get("requestFilePath").and_then(|value| value.as_str()))
                .or_else(|| parsed.get("responseFilePath").and_then(|value| value.as_str()));
            if let Some(path) = path {
                return Some(path.to_string());
            }
        }
    }

    if tool_name == "bash" {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(args_raw) {
            if let Some(command) = parsed.get("command").and_then(|value| value.as_str()) {
                return FILE_PATH_RE.captures(command).and_then(|captures| {
                    captures
                        .name("path")
                        .map(|value| value.as_str().to_string())
                });
            }
        }
    }

    None
}

fn repeated_test_failure_signature(summary: Option<&str>) -> Option<String> {
    let summary = normalize_whitespace(summary?);
    let lower = summary.to_ascii_lowercase();

    if !lower.contains("test") {
        return None;
    }

    if !(lower.contains("fail") || lower.contains("error")) {
        return None;
    }

    Some(truncate_for_display(&summary, 90))
}
