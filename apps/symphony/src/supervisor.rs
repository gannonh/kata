use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use chrono::{DateTime, Utc};
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::domain::{
    EventKind, EventSeverity, SupervisorConfig, SupervisorSnapshot, SupervisorStatus,
    SymphonyEventEnvelope,
};
use crate::error::{Result, SymphonyError};
use crate::event_stream::EventHub;
use crate::orchestrator::EscalationRegistry;
use crate::session_summary::{normalize_whitespace, truncate_for_display};
use crate::shared_context::SharedContextStore;

const RECENT_EVENT_BUFFER: usize = 20;
const REPEATED_TOOL_ERROR_THRESHOLD: u32 = 3;
const NO_PROGRESS_EVENT_THRESHOLD: u32 = 5;
const REPEATED_TEST_FAILURE_THRESHOLD: u32 = 2;

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
    last_steer_at: Option<DateTime<Utc>>,
}

impl WorkerModel {
    fn observe_event(&mut self, envelope: &SymphonyEventEnvelope) {
        self.push_recent_event(envelope.event.clone());

        if envelope.event == "turn_completed" {
            self.turn_count = self.turn_count.saturating_add(1);
        }

        let summary = event_summary_text(envelope);
        let is_file_edit = is_file_edit_event(envelope, summary.as_deref());
        if is_file_edit {
            self.events_since_file_edit = 0;
        } else {
            self.events_since_file_edit = self.events_since_file_edit.saturating_add(1);
        }

        if is_error_event(&envelope.event) {
            self.error_count = self.error_count.saturating_add(1);
        }

        if envelope.event == "tool_error" {
            let signature = tool_error_signature(summary.as_deref());
            if self.last_tool_error_signature.as_deref() == Some(signature.as_str()) {
                self.consecutive_tool_error_count = self.consecutive_tool_error_count.saturating_add(1);
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

    let Some(issue_identifier) = envelope.issue.clone() else {
        return;
    };

    let worker = guard.workers.entry(issue_identifier.clone()).or_default();
    worker.observe_event(&envelope);

    let Some(stuck_reason) = worker.detect_stuck_reason() else {
        return;
    };

    if !worker.can_steer(now, config.steer_cooldown_ms) {
        return;
    }

    worker.mark_steer(now);
    let guidance = stuck_reason.guidance();
    let guidance_preview = truncate_for_display(&guidance, 140);

    guard.snapshot.steers_issued = guard.snapshot.steers_issued.saturating_add(1);
    guard.snapshot.last_decision = Some(format!(
        "steered {} ({})",
        issue_identifier,
        stuck_reason.code()
    ));
    guard.snapshot.last_action_at = Some(Utc::now());

    deps.event_hub.publish(
        EventKind::SupervisorSteer,
        EventSeverity::Warn,
        Some(issue_identifier.clone()),
        "supervisor_steer",
        serde_json::json!({
            "target_issue": issue_identifier,
            "reason": stuck_reason.code(),
            "detail": stuck_reason.brief(),
            "guidance_preview": guidance_preview,
            "steer_cooldown_ms": config.steer_cooldown_ms,
        }),
    );
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

fn is_file_edit_event(envelope: &SymphonyEventEnvelope, summary: Option<&str>) -> bool {
    if envelope.event != "tool_start" {
        return false;
    }

    let Some(summary) = summary else {
        return false;
    };

    let tool_name = summary
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    matches!(tool_name.as_str(), "edit" | "write" | "append")
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
