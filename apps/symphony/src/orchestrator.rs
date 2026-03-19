use chrono::Utc;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::future::Future;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use crate::codex::app_server;
use crate::config;
use crate::domain::{
    AgentEvent, CodexTotals, Issue, OrchestratorSnapshot, OrchestratorState, PollingSnapshot,
    RateLimitInfo, RefreshRequestOutcome, RetryEntry, RetrySnapshotEntry, RunAttempt,
    ServiceConfig,
};
use crate::error::Result;
use crate::ssh::{self, WorkerHostSelection};
use crate::{path_safety, prompt_builder, workspace};

// ── Snapshot Handle (S07 read seam) ─────────────────────────────────────

/// Read-only handle to the latest orchestrator snapshot.
///
/// Clone-cheap (`Arc`-backed). Multiple HTTP handlers can hold references
/// and read concurrently without blocking the orchestrator's mutable loop.
/// The orchestrator publishes a fresh snapshot after every material state
/// change; readers always see a consistent point-in-time view.
#[derive(Clone)]
pub struct SnapshotHandle {
    inner: Arc<RwLock<OrchestratorSnapshot>>,
}

impl SnapshotHandle {
    /// Read the latest published snapshot. Returns a clone so the caller
    /// owns the data without holding the lock.
    pub fn read(&self) -> OrchestratorSnapshot {
        self.inner.read().expect("snapshot rwlock poisoned").clone()
    }

    /// Create a handle pre-loaded with the given snapshot.
    pub fn new(snapshot: OrchestratorSnapshot) -> Self {
        Self {
            inner: Arc::new(RwLock::new(snapshot)),
        }
    }

    /// Publish a new snapshot (called by the orchestrator).
    fn publish(&self, snapshot: OrchestratorSnapshot) {
        *self.inner.write().expect("snapshot rwlock poisoned") = snapshot;
    }
}

// ── Refresh Control Channel (S07 control seam) ──────────────────────────

/// Sender half of the refresh control channel.
///
/// Clone-cheap (`Arc`-backed). HTTP handlers hold this to request an
/// immediate orchestrator tick. Duplicate requests coalesce: if a refresh
/// is already pending, subsequent requests report `coalesced: true` and
/// do not queue additional ticks.
#[derive(Clone)]
pub struct RefreshSender {
    pending: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
}

impl RefreshSender {
    /// Request an immediate orchestrator refresh cycle.
    ///
    /// Returns `RefreshRequestOutcome` indicating whether this request was
    /// freshly queued or coalesced with an already-pending request.
    pub fn request_refresh(&self) -> RefreshRequestOutcome {
        let was_pending = self.pending.swap(true, Ordering::SeqCst);
        self.notify.notify_one();
        if was_pending {
            RefreshRequestOutcome {
                queued: false,
                coalesced: true,
                pending_requests: 1,
            }
        } else {
            RefreshRequestOutcome {
                queued: true,
                coalesced: false,
                pending_requests: 1,
            }
        }
    }
}

/// Receiver half of the refresh control channel.
///
/// Only the orchestrator holds this. It checks for pending refresh
/// requests in its runtime loop and clears the flag atomically.
pub struct RefreshReceiver {
    pending: Arc<AtomicBool>,
    notify: Arc<tokio::sync::Notify>,
}

impl RefreshReceiver {
    /// Atomically check and clear the pending refresh flag.
    /// Returns `true` if a refresh was requested since the last check.
    pub fn take_pending(&self) -> bool {
        self.pending.swap(false, Ordering::SeqCst)
    }

    /// Wait until a refresh is requested. This is cancel-safe and suitable
    /// for use inside `tokio::select!`.
    pub async fn notified(&self) {
        self.notify.notified().await;
    }
}

/// Create a paired refresh control channel (sender + receiver).
///
/// The sender is clone-cheap for sharing across HTTP handlers.
/// The receiver should be held by the orchestrator runtime loop.
pub fn refresh_channel() -> (RefreshSender, RefreshReceiver) {
    let pending = Arc::new(AtomicBool::new(false));
    let notify = Arc::new(tokio::sync::Notify::new());
    (
        RefreshSender {
            pending: pending.clone(),
            notify: notify.clone(),
        },
        RefreshReceiver { pending, notify },
    )
}

pub const CONTINUATION_RETRY_DELAY_MS: i64 = 1_000;
pub const FAILURE_RETRY_BASE_MS: i64 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetryKind {
    Continuation,
    Failure,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeEvent {
    StartupCleanup,
    Reconcile,
    Validate,
    Dispatch,
    ValidationSkippedDispatch,
    RetryScheduled {
        issue_id: String,
        attempt: u32,
        due_at_ms: i64,
        token: String,
        retry_kind: RetryKind,
    },
    RetryIgnoredStale {
        issue_id: String,
        token: String,
    },
    WorkerCompleted {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
    },
    WorkerFailed {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
        error: String,
    },
    WorkerStalled {
        issue_id: String,
        issue_identifier: String,
        session_id: Option<String>,
        elapsed_ms: i64,
    },
    /// An HTTP refresh request was received and will trigger an immediate tick.
    RefreshRequested,
    /// An HTTP refresh request was received but coalesced with an already-pending
    /// refresh (no additional tick needed).
    RefreshCoalesced,
}

#[derive(Debug, Clone)]
pub struct TickResult {
    pub dispatched_issue_ids: Vec<String>,
    pub dispatch_skipped: bool,
}

#[derive(Debug, Clone)]
pub struct TurnMetrics {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub rate_limits: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default)]
pub struct RetryContext {
    pub worker_host: Option<String>,
    pub workspace_path: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum WorkerCompletion {
    Completed,
    Failed { error: String },
}

pub trait OrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> Result<Vec<Issue>>;

    fn reconcile_running_issues(&mut self, running_issue_ids: &[String]) -> Result<Vec<Issue>>;

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> Result<()>;

    fn fetch_candidate_issues(&mut self) -> Result<Vec<Issue>>;

    fn refresh_issue(&mut self, issue_id: &str) -> Result<Option<Issue>>;
}

/// S06 runtime authority loop state.
///
/// The orchestrator is the single mutable owner of dispatch/reconcile/retry
/// state in this process. State mutation only happens through `&mut self`
/// methods (startup cleanup, tick, retry handlers).
pub struct Orchestrator {
    config: ServiceConfig,
    state: OrchestratorState,
    events: Vec<RuntimeEvent>,
    retry_tokens: HashMap<String, String>,
    worker_last_activity_ms: HashMap<String, i64>,
    worker_session_ids: HashMap<String, String>,
    /// Normalized running issue state cache used for per-state slot accounting.
    running_issue_states: HashMap<String, String>,
    next_retry_token: u64,
    /// Optional shared snapshot handle for HTTP read access.
    snapshot_handle: Option<SnapshotHandle>,
    /// Optional refresh receiver for HTTP control access.
    refresh_receiver: Option<RefreshReceiver>,
}

impl Orchestrator {
    pub fn new(config: ServiceConfig) -> Self {
        let poll_interval_ms = config.polling.interval_ms;
        let max_concurrent_agents = config.agent.max_concurrent_agents;

        Self {
            config,
            state: OrchestratorState {
                poll_interval_ms,
                max_concurrent_agents,
                running: HashMap::new(),
                claimed: std::collections::HashSet::new(),
                retry_attempts: HashMap::new(),
                completed: std::collections::HashSet::new(),
                codex_totals: CodexTotals::default(),
                codex_rate_limits: None,
            },
            events: vec![],
            retry_tokens: HashMap::new(),
            worker_last_activity_ms: HashMap::new(),
            worker_session_ids: HashMap::new(),
            running_issue_states: HashMap::new(),
            next_retry_token: 0,
            snapshot_handle: None,
            refresh_receiver: None,
        }
    }

    pub async fn run(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        self.startup_cleanup(port)?;
        self.publish_snapshot();

        loop {
            let now_ms = Utc::now().timestamp_millis();
            let stall_timeout_ms = self.config.codex.stall_timeout_ms.min(i64::MAX as u64) as i64;

            self.detect_stalled_workers(now_ms, stall_timeout_ms);

            if let Err(err) = self.tick(port) {
                tracing::warn!(
                    phase = "tick",
                    error = %err,
                    "orchestrator tick failed; continuing"
                );
            }

            self.process_due_retries(port, Utc::now().timestamp_millis());
            self.publish_snapshot();

            // Sleep until next poll interval, but wake early on refresh request.
            let sleep_duration = Duration::from_millis(self.state.poll_interval_ms);
            let refresh_notify = self.refresh_receiver.as_ref().map(|r| r.notify.clone());

            if let Some(notify) = refresh_notify {
                tokio::select! {
                    _ = tokio::time::sleep(sleep_duration) => {},
                    _ = notify.notified() => {
                        if let Some(receiver) = &self.refresh_receiver {
                            if receiver.take_pending() {
                                tracing::info!(
                                    event = "refresh_requested",
                                    "HTTP refresh request woke orchestrator loop; triggering immediate tick"
                                );
                                self.events.push(RuntimeEvent::RefreshRequested);
                            }
                        }
                    },
                }
            } else {
                tokio::time::sleep(sleep_duration).await;
            }
        }
    }

    pub fn startup_cleanup(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        self.events.push(RuntimeEvent::StartupCleanup);
        tracing::info!(
            phase = "startup_cleanup",
            "running startup terminal cleanup"
        );

        let terminal_issues = port.startup_terminal_issues(&self.config.tracker.terminal_states)?;

        for issue in terminal_issues {
            self.mark_issue_terminal(&issue.id);
        }

        Ok(())
    }

    pub fn tick(&mut self, port: &mut dyn OrchestratorPort) -> Result<TickResult> {
        self.events.push(RuntimeEvent::Reconcile);
        tracing::info!(phase = "reconcile", "starting orchestrator tick phase");
        self.reconcile_running(port)?;

        self.events.push(RuntimeEvent::Validate);
        tracing::info!(phase = "validate", "starting orchestrator tick phase");

        if let Err(err) = config::validate(&self.config) {
            tracing::warn!(
                phase = "dispatch",
                reason = "preflight_invalid",
                error = %err,
                "dispatch skipped due to invalid effective config"
            );
            self.events.push(RuntimeEvent::ValidationSkippedDispatch);
            return Ok(TickResult {
                dispatched_issue_ids: vec![],
                dispatch_skipped: true,
            });
        }

        if let Err(err) = port.validate_dispatch_preflight(&self.config) {
            tracing::warn!(
                phase = "dispatch",
                reason = "preflight_invalid",
                error = %err,
                "dispatch skipped due to preflight validation failure"
            );
            self.events.push(RuntimeEvent::ValidationSkippedDispatch);
            return Ok(TickResult {
                dispatched_issue_ids: vec![],
                dispatch_skipped: true,
            });
        }

        self.events.push(RuntimeEvent::Dispatch);
        tracing::info!(phase = "dispatch", "starting orchestrator tick phase");

        let candidates = port.fetch_candidate_issues()?;
        let mut dispatched_issue_ids = vec![];

        for candidate in self.sort_issues_for_dispatch(candidates) {
            if self.available_slots() == 0 {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "slot_full",
                    "global concurrency slots exhausted"
                );
                break;
            }

            if !self.should_dispatch_issue(&candidate) {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %candidate.id,
                    issue_identifier = %candidate.identifier,
                    "candidate rejected before refresh"
                );
                continue;
            }

            let Some(refreshed_issue) = port.refresh_issue(&candidate.id)? else {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %candidate.id,
                    issue_identifier = %candidate.identifier,
                    "candidate missing at pre-dispatch refresh"
                );
                continue;
            };

            if !self.should_dispatch_issue(&refreshed_issue) {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "blocked",
                    issue_id = %refreshed_issue.id,
                    issue_identifier = %refreshed_issue.identifier,
                    "candidate rejected after pre-dispatch refresh"
                );
                continue;
            }

            let state_key = normalize_issue_state(&refreshed_issue.state);
            if !self.state_slot_available(&state_key) {
                tracing::debug!(
                    phase = "dispatch",
                    reason = "slot_full",
                    issue_id = %refreshed_issue.id,
                    issue_identifier = %refreshed_issue.identifier,
                    state = %state_key,
                    "state concurrency slots exhausted"
                );
                continue;
            }

            // Select an SSH host (or local) for this fresh dispatch.
            let host_selection = self.select_worker_host(None);
            if matches!(host_selection, WorkerHostSelection::NoneAvailable) {
                tracing::warn!(
                    event = "ssh_pool_exhausted",
                    issue_id = %refreshed_issue.id,
                    issue_identifier = %refreshed_issue.identifier,
                    "SSH host pool exhausted, deferring dispatch"
                );
                continue;
            }
            let worker_host = match host_selection {
                WorkerHostSelection::Remote(ref host) => Some(host.clone()),
                _ => None,
            };
            self.dispatch_issue(&refreshed_issue, None, None, worker_host);
            dispatched_issue_ids.push(refreshed_issue.id);
        }

        Ok(TickResult {
            dispatched_issue_ids,
            dispatch_skipped: false,
        })
    }

    pub fn schedule_retry(
        &mut self,
        issue_id: &str,
        identifier: &str,
        attempt: u32,
        retry_kind: RetryKind,
        now_ms: i64,
        error: Option<String>,
    ) -> String {
        self.schedule_retry_with_context(
            issue_id,
            identifier,
            attempt,
            retry_kind,
            now_ms,
            error,
            RetryContext::default(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn schedule_retry_with_context(
        &mut self,
        issue_id: &str,
        identifier: &str,
        attempt: u32,
        retry_kind: RetryKind,
        now_ms: i64,
        error: Option<String>,
        context: RetryContext,
    ) -> String {
        self.next_retry_token += 1;
        let token = format!("retry-{}", self.next_retry_token);
        let due_at_ms = now_ms + self.retry_delay_ms(retry_kind, attempt);

        self.retry_tokens
            .insert(issue_id.to_string(), token.clone());

        self.state.retry_attempts.insert(
            issue_id.to_string(),
            RetryEntry {
                issue_id: issue_id.to_string(),
                identifier: identifier.to_string(),
                attempt,
                due_at_ms,
                timer_handle: Some(token.clone()),
                error: error.clone(),
                worker_host: context.worker_host.clone(),
                workspace_path: context.workspace_path.clone(),
            },
        );

        if let Some(session_id) = context.session_id.as_ref() {
            self.worker_session_ids
                .insert(issue_id.to_string(), session_id.clone());
        }

        tracing::info!(
            event = "retry_scheduled",
            issue_id = %issue_id,
            issue_identifier = %identifier,
            retry_kind = ?retry_kind,
            attempt,
            due_at_ms,
            token = %token,
            session_id = context.session_id.as_deref().unwrap_or("n/a"),
            worker_host = context.worker_host.as_deref().unwrap_or("local"),
            workspace_path = context.workspace_path.as_deref().unwrap_or("n/a"),
            error = error.as_deref().unwrap_or(""),
            "queued issue retry"
        );

        self.events.push(RuntimeEvent::RetryScheduled {
            issue_id: issue_id.to_string(),
            attempt,
            due_at_ms,
            token: token.clone(),
            retry_kind,
        });

        token
    }

    pub fn fire_retry(&mut self, issue_id: &str, token: &str) -> bool {
        let Some(current_token) = self.retry_tokens.get(issue_id).cloned() else {
            return false;
        };

        if current_token != token {
            tracing::info!(
                event = "retry_ignored_stale",
                issue_id = %issue_id,
                token = %token,
                current_token = %current_token,
                "ignored stale retry timer firing"
            );

            self.events.push(RuntimeEvent::RetryIgnoredStale {
                issue_id: issue_id.to_string(),
                token: token.to_string(),
            });
            return false;
        }

        self.retry_tokens.remove(issue_id);
        self.state.retry_attempts.remove(issue_id).is_some()
    }

    pub fn record_worker_activity(&mut self, issue_id: &str, timestamp_ms: i64) {
        self.worker_last_activity_ms
            .insert(issue_id.to_string(), timestamp_ms);
    }

    pub fn ingest_agent_event(&mut self, issue_id: &str, event: &AgentEvent) {
        self.record_worker_activity(issue_id, event_timestamp_ms(event));

        if let Some(session_id) = event_session_id(event) {
            self.worker_session_ids
                .insert(issue_id.to_string(), session_id.to_string());
        }

        if let Some(run_attempt) = self.state.running.get_mut(issue_id) {
            match event {
                AgentEvent::TurnFailed { error, .. }
                | AgentEvent::TurnEndedWithError { error, .. }
                | AgentEvent::StartupFailed { error, .. } => {
                    run_attempt.status = "failed".to_string();
                    run_attempt.error = Some(error.clone());
                }
                AgentEvent::TurnCancelled { .. } => {
                    run_attempt.status = "cancelled".to_string();
                }
                _ => {}
            }
        }

        tracing::debug!(
            issue_id = %issue_id,
            session_id = self
                .worker_session_ids
                .get(issue_id)
                .map(String::as_str)
                .unwrap_or("n/a"),
            event = %event_name(event),
            "ingested codex worker event"
        );
    }

    pub fn handle_worker_completion(
        &mut self,
        issue_id: &str,
        completion: WorkerCompletion,
        now_ms: i64,
    ) -> Option<String> {
        let run_attempt = self.state.running.remove(issue_id)?;
        self.state.claimed.remove(issue_id);
        self.running_issue_states.remove(issue_id);
        self.worker_last_activity_ms.remove(issue_id);

        let issue_identifier = run_attempt.issue_identifier.clone();
        let session_id = self.worker_session_ids.remove(issue_id);
        let retry_context = RetryContext {
            worker_host: run_attempt.worker_host.clone(),
            workspace_path: Some(run_attempt.workspace_path.clone()),
            session_id: session_id.clone(),
        };

        match completion {
            WorkerCompletion::Completed => {
                self.state.completed.insert(issue_id.to_string());

                tracing::info!(
                    event = "worker_completed",
                    issue_id = %issue_id,
                    issue_identifier = %issue_identifier,
                    session_id = session_id.as_deref().unwrap_or("n/a"),
                    "worker attempt completed; scheduling continuation retry"
                );

                self.events.push(RuntimeEvent::WorkerCompleted {
                    issue_id: issue_id.to_string(),
                    issue_identifier: issue_identifier.clone(),
                    session_id,
                });

                Some(self.schedule_retry_with_context(
                    issue_id,
                    &issue_identifier,
                    1,
                    RetryKind::Continuation,
                    now_ms,
                    None,
                    retry_context,
                ))
            }
            WorkerCompletion::Failed { error } => {
                self.state.completed.remove(issue_id);

                let attempt = run_attempt.attempt.unwrap_or(0).saturating_add(1).max(1);

                tracing::warn!(
                    event = "worker_failed",
                    issue_id = %issue_id,
                    issue_identifier = %issue_identifier,
                    session_id = session_id.as_deref().unwrap_or("n/a"),
                    attempt,
                    error = %error,
                    "worker attempt failed; scheduling failure retry"
                );

                self.events.push(RuntimeEvent::WorkerFailed {
                    issue_id: issue_id.to_string(),
                    issue_identifier: issue_identifier.clone(),
                    session_id,
                    error: error.clone(),
                });

                Some(self.schedule_retry_with_context(
                    issue_id,
                    &issue_identifier,
                    attempt,
                    RetryKind::Failure,
                    now_ms,
                    Some(error),
                    retry_context,
                ))
            }
        }
    }

    pub async fn execute_worker_attempt<E, EFut>(
        &mut self,
        issue: &Issue,
        prompt_template: &str,
        attempt: Option<u32>,
        graphql_executor: E,
    ) -> Result<()>
    where
        E: Fn(String, serde_json::Value) -> EFut + Clone + Send,
        EFut: Future<Output = Result<serde_json::Value>> + Send,
    {
        let workspace_info = workspace::ensure_workspace(
            &issue.identifier,
            &self.config.workspace,
            &self.config.hooks,
        )?;

        // Preserve the worker_host that dispatch_issue() already stored on the
        // scheduled RunAttempt (if present) so SSH dispatch is honoured here.
        let prior_worker_host = self
            .state
            .running
            .get(&issue.id)
            .and_then(|a| a.worker_host.clone());

        self.state.running.insert(
            issue.id.clone(),
            RunAttempt {
                issue_id: issue.id.clone(),
                issue_identifier: issue.identifier.clone(),
                attempt,
                workspace_path: workspace_info.path.clone(),
                started_at: Utc::now(),
                status: "running".to_string(),
                error: None,
                worker_host: prior_worker_host.clone(),
            },
        );
        self.state.claimed.insert(issue.id.clone());
        self.running_issue_states
            .insert(issue.id.clone(), normalize_issue_state(&issue.state));
        self.state.retry_attempts.remove(&issue.id);

        let workspace_path = Path::new(&workspace_info.path);
        if let Err(err) = workspace::run_before_run_hook(workspace_path, &self.config.hooks) {
            self.handle_worker_completion(
                &issue.id,
                WorkerCompletion::Failed {
                    error: err.to_string(),
                },
                Utc::now().timestamp_millis(),
            );
            return Err(err);
        }

        let prompt = match prompt_builder::render_prompt(prompt_template, issue, attempt) {
            Ok(prompt) => prompt,
            Err(err) => {
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Failed {
                        error: err.to_string(),
                    },
                    Utc::now().timestamp_millis(),
                );
                return Err(err);
            }
        };

        let mut session = match app_server::start_session(
            &self.config.codex,
            issue,
            workspace_path,
            Path::new(&self.config.workspace.root),
            prior_worker_host.as_deref(),
        )
        .await
        {
            Ok(session) => session,
            Err(err) => {
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Failed {
                        error: err.to_string(),
                    },
                    Utc::now().timestamp_millis(),
                );
                return Err(err);
            }
        };

        tracing::info!(
            event = "worker_started",
            issue_id = %issue.id,
            issue_identifier = %issue.identifier,
            session_id = %session.session_id,
            workspace_path = %workspace_info.path,
            "worker attempt started"
        );

        let mut observed_events: Vec<AgentEvent> = Vec::new();
        let run_result = app_server::run_turn(&mut session, &prompt, graphql_executor, |event| {
            observed_events.push(event);
        })
        .await;

        for event in &observed_events {
            self.ingest_agent_event(&issue.id, event);
        }

        if let Err(err) = app_server::stop_session(session).await {
            tracing::warn!(
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                error = %err,
                "failed to stop codex session cleanly"
            );
        }

        let _ = workspace::run_after_run_hook(workspace_path, &self.config.hooks);

        match run_result {
            Ok(turn_result) => {
                self.apply_turn_metrics(&TurnMetrics {
                    input_tokens: turn_result.input_tokens,
                    output_tokens: turn_result.output_tokens,
                    total_tokens: turn_result.total_tokens,
                    rate_limits: turn_result.rate_limits,
                });

                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Completed,
                    Utc::now().timestamp_millis(),
                );

                Ok(())
            }
            Err(err) => {
                self.handle_worker_completion(
                    &issue.id,
                    WorkerCompletion::Failed {
                        error: err.to_string(),
                    },
                    Utc::now().timestamp_millis(),
                );
                Err(err)
            }
        }
    }

    pub fn detect_stalled_workers(&mut self, now_ms: i64, stall_timeout_ms: i64) {
        if stall_timeout_ms <= 0 {
            return;
        }

        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();

        for issue_id in running_issue_ids {
            let Some(run_attempt) = self.state.running.get(&issue_id).cloned() else {
                continue;
            };

            let last_activity_ms = self
                .worker_last_activity_ms
                .get(&issue_id)
                .copied()
                .unwrap_or_else(|| run_attempt.started_at.timestamp_millis());

            let elapsed_ms = now_ms.saturating_sub(last_activity_ms);
            if elapsed_ms <= stall_timeout_ms {
                continue;
            }

            let session_id = self.worker_session_ids.get(&issue_id).cloned();

            tracing::warn!(
                event = "worker_stalled",
                issue_id = %issue_id,
                issue_identifier = %run_attempt.issue_identifier,
                session_id = session_id.as_deref().unwrap_or("n/a"),
                elapsed_ms,
                stall_timeout_ms,
                "detected stalled worker; scheduling failure retry"
            );

            self.events.push(RuntimeEvent::WorkerStalled {
                issue_id: issue_id.clone(),
                issue_identifier: run_attempt.issue_identifier.clone(),
                session_id,
                elapsed_ms,
            });

            self.handle_worker_completion(
                &issue_id,
                WorkerCompletion::Failed {
                    error: format!("stalled for {elapsed_ms}ms without codex activity"),
                },
                now_ms,
            );
        }
    }

    pub fn apply_turn_metrics(&mut self, metrics: &TurnMetrics) {
        self.state.codex_totals.input_tokens = self
            .state
            .codex_totals
            .input_tokens
            .saturating_add(metrics.input_tokens);
        self.state.codex_totals.output_tokens = self
            .state
            .codex_totals
            .output_tokens
            .saturating_add(metrics.output_tokens);
        self.state.codex_totals.total_tokens = self
            .state
            .codex_totals
            .total_tokens
            .saturating_add(metrics.total_tokens);

        if let Some(rate_limits) = metrics.rate_limits.clone() {
            self.state.codex_rate_limits = Some(rate_limit_info(rate_limits));
        }

        tracing::info!(
            event = "token_aggregate_updated",
            input_delta = metrics.input_tokens,
            output_delta = metrics.output_tokens,
            total_delta = metrics.total_tokens,
            input_total = self.state.codex_totals.input_tokens,
            output_total = self.state.codex_totals.output_tokens,
            total_total = self.state.codex_totals.total_tokens,
            has_rate_limits = metrics.rate_limits.is_some(),
            "updated codex aggregate token totals"
        );
    }

    pub fn events(&self) -> &[RuntimeEvent] {
        &self.events
    }

    pub fn state(&self) -> &OrchestratorState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut OrchestratorState {
        &mut self.state
    }

    /// Create a shared snapshot handle for concurrent HTTP reads.
    ///
    /// The handle is pre-loaded with the current snapshot. The orchestrator
    /// retains an internal reference and publishes updates after every
    /// material state change. Returns a clone-cheap handle for HTTP use.
    pub fn create_snapshot_handle(&mut self) -> SnapshotHandle {
        let snapshot = self.snapshot(Utc::now().timestamp_millis());
        let handle = SnapshotHandle::new(snapshot);
        self.snapshot_handle = Some(handle.clone());
        handle
    }

    /// Create a refresh control channel.
    ///
    /// Returns the sender half (clone-cheap, for HTTP handlers). The
    /// orchestrator retains the receiver and checks it in its runtime loop.
    pub fn create_refresh_channel(&mut self) -> RefreshSender {
        let (sender, receiver) = refresh_channel();
        self.refresh_receiver = Some(receiver);
        sender
    }

    /// Publish the current snapshot to the shared handle (if created).
    ///
    /// Called after every material state change in the runtime loop.
    /// No-op if `create_snapshot_handle()` was never called.
    pub fn publish_snapshot(&self) {
        if let Some(handle) = &self.snapshot_handle {
            let snapshot = self.snapshot(Utc::now().timestamp_millis());
            handle.publish(snapshot);
        }
    }

    pub fn snapshot(&self, now_ms: i64) -> OrchestratorSnapshot {
        let running: BTreeMap<String, RunAttempt> = self
            .state
            .running
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let claimed: BTreeSet<String> = self.state.claimed.iter().cloned().collect();
        let completed: BTreeSet<String> = self.state.completed.iter().cloned().collect();

        let mut retry_queue: Vec<RetrySnapshotEntry> = self
            .state
            .retry_attempts
            .values()
            .map(|entry| RetrySnapshotEntry {
                issue_id: entry.issue_id.clone(),
                identifier: entry.identifier.clone(),
                attempt: entry.attempt,
                due_in_ms: entry.due_at_ms - now_ms,
                error: entry.error.clone(),
                worker_host: entry.worker_host.clone(),
                workspace_path: entry.workspace_path.clone(),
            })
            .collect();

        retry_queue.sort_by(|a, b| {
            a.due_in_ms
                .cmp(&b.due_in_ms)
                .then_with(|| a.identifier.cmp(&b.identifier))
        });

        OrchestratorSnapshot {
            poll_interval_ms: self.state.poll_interval_ms,
            max_concurrent_agents: self.state.max_concurrent_agents,
            running,
            claimed,
            retry_queue,
            completed,
            codex_totals: self.state.codex_totals.clone(),
            codex_rate_limits: self.state.codex_rate_limits.clone(),
            polling: PollingSnapshot {
                checking: false,
                next_poll_in_ms: self.state.poll_interval_ms as i64,
                poll_interval_ms: self.state.poll_interval_ms,
            },
        }
    }

    fn reconcile_running(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();
        let refreshed_issues = match port.reconcile_running_issues(&running_issue_ids) {
            Ok(issues) => issues,
            Err(err) => {
                tracing::warn!(
                    phase = "reconcile",
                    issue_count = running_issue_ids.len(),
                    error = %err,
                    "reconcile_running: failed to refresh running issues; keeping active workers"
                );
                return Ok(());
            }
        };

        let terminal_states = self.terminal_state_set();
        let active_states = self.active_state_set();
        let mut visible_issue_ids: HashSet<String> = HashSet::new();

        for issue in refreshed_issues {
            visible_issue_ids.insert(issue.id.clone());

            let normalized_state = normalize_issue_state(&issue.state);
            if terminal_states.contains(&normalized_state) {
                self.mark_issue_terminal(&issue.id);
                continue;
            }

            if !issue.assigned_to_worker || !active_states.contains(&normalized_state) {
                self.release_issue(&issue.id);
                continue;
            }

            self.running_issue_states
                .insert(issue.id.clone(), normalized_state);
        }

        for running_id in running_issue_ids {
            if !visible_issue_ids.contains(&running_id) {
                self.release_issue(&running_id);
            }
        }

        Ok(())
    }

    fn sort_issues_for_dispatch(&self, mut issues: Vec<Issue>) -> Vec<Issue> {
        issues.sort_by(|a, b| {
            priority_rank(a.priority)
                .cmp(&priority_rank(b.priority))
                .then_with(|| issue_created_at_sort_key(a).cmp(&issue_created_at_sort_key(b)))
                .then_with(|| issue_identifier_sort_key(a).cmp(&issue_identifier_sort_key(b)))
        });

        issues
    }

    /// Select a worker host from the SSH pool for the next dispatch attempt.
    ///
    /// - Returns `Local` when no SSH hosts are configured.
    /// - Returns `Remote(host)` with the preferred host when it is still under cap.
    /// - Returns `Remote(host)` with the least-loaded eligible host otherwise.
    /// - Returns `NoneAvailable` when all hosts are at or above the per-host cap.
    fn select_worker_host(&self, preferred: Option<&str>) -> WorkerHostSelection {
        let ssh_hosts = &self.config.worker.ssh_hosts;
        let cap = self
            .config
            .worker
            .max_concurrent_agents_per_host
            .map(|c| c as usize)
            .unwrap_or(usize::MAX);

        let mut load: HashMap<String, usize> = HashMap::new();
        for attempt in self.state.running.values() {
            if let Some(host) = attempt.worker_host.as_deref() {
                *load.entry(host.to_string()).or_insert(0) += 1;
            }
        }

        ssh::select_worker_host(ssh_hosts, &load, cap, preferred)
    }

    fn should_dispatch_issue(&self, issue: &Issue) -> bool {
        if !issue_has_required_fields(issue) {
            return false;
        }

        if !issue.assigned_to_worker {
            return false;
        }

        let normalized_state = normalize_issue_state(&issue.state);

        if self.terminal_state_set().contains(&normalized_state) {
            return false;
        }

        if !self.active_state_set().contains(&normalized_state) {
            return false;
        }

        if self.todo_issue_blocked_by_non_terminal(issue) {
            return false;
        }

        if self.state.claimed.contains(&issue.id) || self.state.running.contains_key(&issue.id) {
            return false;
        }

        if self.available_slots() == 0 {
            return false;
        }

        self.state_slot_available(&normalized_state)
    }

    fn todo_issue_blocked_by_non_terminal(&self, issue: &Issue) -> bool {
        if normalize_issue_state(&issue.state) != "todo" {
            return false;
        }

        let terminal_states = self.terminal_state_set();

        issue.blocked_by.iter().any(|blocker| {
            blocker
                .state
                .as_ref()
                .map(|state| !terminal_states.contains(&normalize_issue_state(state)))
                .unwrap_or(true)
        })
    }

    fn available_slots(&self) -> u32 {
        self.state
            .max_concurrent_agents
            .saturating_sub(self.state.running.len() as u32)
    }

    fn state_slot_available(&self, state_key: &str) -> bool {
        let limit = self
            .config
            .agent
            .max_concurrent_agents_by_state
            .get(state_key)
            .copied()
            .unwrap_or(self.state.max_concurrent_agents);

        self.running_issue_count_for_state(state_key) < limit
    }

    fn running_issue_count_for_state(&self, state_key: &str) -> u32 {
        self.state
            .running
            .keys()
            .filter(|issue_id| {
                self.running_issue_states
                    .get(*issue_id)
                    .map(|running_state| running_state == state_key)
                    .unwrap_or(false)
            })
            .count() as u32
    }

    fn retry_delay_ms(&self, retry_kind: RetryKind, attempt: u32) -> i64 {
        match retry_kind {
            RetryKind::Continuation => CONTINUATION_RETRY_DELAY_MS,
            RetryKind::Failure => {
                let max_backoff_ms =
                    self.config.agent.max_retry_backoff_ms.min(i64::MAX as u64) as i64;
                let safe_attempt = attempt.max(1);
                let power = safe_attempt.saturating_sub(1).min(10);
                let exponential = FAILURE_RETRY_BASE_MS.saturating_mul(1_i64 << power);
                exponential.min(max_backoff_ms)
            }
        }
    }

    fn dispatch_issue(
        &mut self,
        issue: &Issue,
        attempt: Option<u32>,
        workspace_path: Option<String>,
        worker_host: Option<String>,
    ) {
        let attempt = RunAttempt {
            issue_id: issue.id.clone(),
            issue_identifier: issue.identifier.clone(),
            attempt,
            workspace_path: workspace_path
                .unwrap_or_else(|| self.default_workspace_path_for_issue(issue)),
            started_at: Utc::now(),
            status: "scheduled".to_string(),
            error: None,
            worker_host,
        };

        self.state.running.insert(issue.id.clone(), attempt);
        self.state.claimed.insert(issue.id.clone());
        self.state.retry_attempts.remove(&issue.id);
        self.running_issue_states
            .insert(issue.id.clone(), normalize_issue_state(&issue.state));
    }

    fn process_due_retries(&mut self, port: &mut dyn OrchestratorPort, now_ms: i64) {
        let due_retries: Vec<RetryEntry> = self
            .state
            .retry_attempts
            .values()
            .filter(|entry| entry.due_at_ms <= now_ms)
            .cloned()
            .collect();

        for retry in due_retries {
            let Some(token) = retry.timer_handle.clone() else {
                continue;
            };

            if !self.fire_retry(&retry.issue_id, &token) {
                continue;
            }

            let retry_context = RetryContext {
                worker_host: retry.worker_host.clone(),
                workspace_path: retry.workspace_path.clone(),
                session_id: self.worker_session_ids.get(&retry.issue_id).cloned(),
            };

            let candidates = match port.fetch_candidate_issues() {
                Ok(issues) => issues,
                Err(err) => {
                    tracing::warn!(
                        event = "retry_poll_failed",
                        issue_id = %retry.issue_id,
                        issue_identifier = %retry.identifier,
                        error = %err,
                        "retry poll failed; rescheduling"
                    );

                    self.schedule_retry_with_context(
                        &retry.issue_id,
                        &retry.identifier,
                        retry.attempt.saturating_add(1),
                        RetryKind::Failure,
                        now_ms,
                        Some(format!("retry poll failed: {err}")),
                        retry_context,
                    );
                    continue;
                }
            };

            let Some(issue) = candidates
                .into_iter()
                .find(|issue| issue.id == retry.issue_id)
            else {
                tracing::debug!(
                    event = "retry_issue_not_visible",
                    issue_id = %retry.issue_id,
                    issue_identifier = %retry.identifier,
                    "retry issue not visible in active candidates; releasing claim"
                );
                self.release_issue(&retry.issue_id);
                continue;
            };

            let normalized_state = normalize_issue_state(&issue.state);
            if self.terminal_state_set().contains(&normalized_state) {
                self.mark_issue_terminal(&issue.id);
                continue;
            }

            if self.should_dispatch_issue(&issue) {
                // Select an SSH host for retry, preferring the prior attempt's host.
                let host_selection = self.select_worker_host(retry.worker_host.as_deref());
                if matches!(host_selection, WorkerHostSelection::NoneAvailable) {
                    tracing::warn!(
                        event = "ssh_pool_exhausted_retry",
                        issue_id = %issue.id,
                        issue_identifier = %issue.identifier,
                        "SSH host pool exhausted on retry, deferring"
                    );
                    // Reschedule at continuation delay WITHOUT incrementing attempt —
                    // pool exhaustion is transient capacity pressure, not a worker
                    // failure, so we must not consume retry budget or apply
                    // exponential backoff.
                    self.schedule_retry_with_context(
                        &issue.id,
                        &issue.identifier,
                        retry.attempt,
                        RetryKind::Continuation,
                        now_ms,
                        Some("ssh pool exhausted".to_string()),
                        retry_context,
                    );
                    continue;
                }
                let worker_host = match host_selection {
                    WorkerHostSelection::Remote(ref host) => Some(host.clone()),
                    _ => None,
                };
                self.dispatch_issue(
                    &issue,
                    Some(retry.attempt),
                    retry.workspace_path.clone(),
                    worker_host,
                );
                continue;
            }

            if !self.active_state_set().contains(&normalized_state) {
                tracing::debug!(
                    event = "retry_issue_inactive",
                    issue_id = %issue.id,
                    issue_identifier = %issue.identifier,
                    state = %normalized_state,
                    "retry issue left active states; releasing claim"
                );
                self.release_issue(&issue.id);
                continue;
            }

            tracing::debug!(
                event = "retry_no_slots",
                issue_id = %issue.id,
                issue_identifier = %issue.identifier,
                "retry issue blocked by orchestrator slot constraints; rescheduling"
            );

            self.schedule_retry_with_context(
                &issue.id,
                &issue.identifier,
                retry.attempt.saturating_add(1),
                RetryKind::Failure,
                now_ms,
                Some("no available orchestrator slots".to_string()),
                retry_context,
            );
        }
    }

    fn default_workspace_path_for_issue(&self, issue: &Issue) -> String {
        let safe_identifier = path_safety::sanitize_identifier(&issue.identifier);
        Path::new(&self.config.workspace.root)
            .join(safe_identifier)
            .to_string_lossy()
            .to_string()
    }

    fn mark_issue_terminal(&mut self, issue_id: &str) {
        self.state.completed.insert(issue_id.to_string());
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
        self.retry_tokens.remove(issue_id);
        self.worker_last_activity_ms.remove(issue_id);
        self.worker_session_ids.remove(issue_id);
    }

    fn release_issue(&mut self, issue_id: &str) {
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
        self.retry_tokens.remove(issue_id);
        self.worker_last_activity_ms.remove(issue_id);
        self.worker_session_ids.remove(issue_id);
    }

    fn active_state_set(&self) -> HashSet<String> {
        self.config
            .tracker
            .active_states
            .iter()
            .map(|state| normalize_issue_state(state))
            .filter(|state| !state.is_empty())
            .collect()
    }

    fn terminal_state_set(&self) -> HashSet<String> {
        self.config
            .tracker
            .terminal_states
            .iter()
            .map(|state| normalize_issue_state(state))
            .filter(|state| !state.is_empty())
            .collect()
    }
}

fn event_timestamp_ms(event: &AgentEvent) -> i64 {
    match event {
        AgentEvent::SessionStarted { timestamp, .. }
        | AgentEvent::StartupFailed { timestamp, .. }
        | AgentEvent::TurnCompleted { timestamp, .. }
        | AgentEvent::TurnFailed { timestamp, .. }
        | AgentEvent::TurnCancelled { timestamp, .. }
        | AgentEvent::TurnEndedWithError { timestamp, .. }
        | AgentEvent::TurnInputRequired { timestamp, .. }
        | AgentEvent::ApprovalAutoApproved { timestamp, .. }
        | AgentEvent::ApprovalRequired { timestamp, .. }
        | AgentEvent::ToolCallCompleted { timestamp, .. }
        | AgentEvent::ToolCallFailed { timestamp, .. }
        | AgentEvent::ToolInputAutoAnswered { timestamp, .. }
        | AgentEvent::UnsupportedToolCall { timestamp, .. }
        | AgentEvent::Notification { timestamp, .. }
        | AgentEvent::OtherMessage { timestamp, .. }
        | AgentEvent::Malformed { timestamp, .. } => timestamp.timestamp_millis(),
    }
}

fn event_session_id(event: &AgentEvent) -> Option<&str> {
    match event {
        AgentEvent::SessionStarted { session_id, .. } => Some(session_id.as_str()),
        _ => None,
    }
}

fn event_name(event: &AgentEvent) -> &'static str {
    match event {
        AgentEvent::SessionStarted { .. } => "session_started",
        AgentEvent::StartupFailed { .. } => "startup_failed",
        AgentEvent::TurnCompleted { .. } => "turn_completed",
        AgentEvent::TurnFailed { .. } => "turn_failed",
        AgentEvent::TurnCancelled { .. } => "turn_cancelled",
        AgentEvent::TurnEndedWithError { .. } => "turn_ended_with_error",
        AgentEvent::TurnInputRequired { .. } => "turn_input_required",
        AgentEvent::ApprovalAutoApproved { .. } => "approval_auto_approved",
        AgentEvent::ApprovalRequired { .. } => "approval_required",
        AgentEvent::ToolCallCompleted { .. } => "tool_call_completed",
        AgentEvent::ToolCallFailed { .. } => "tool_call_failed",
        AgentEvent::ToolInputAutoAnswered { .. } => "tool_input_auto_answered",
        AgentEvent::UnsupportedToolCall { .. } => "unsupported_tool_call",
        AgentEvent::Notification { .. } => "notification",
        AgentEvent::OtherMessage { .. } => "other_message",
        AgentEvent::Malformed { .. } => "malformed",
    }
}

fn normalize_issue_state(state_name: &str) -> String {
    state_name.trim().to_ascii_lowercase()
}

fn issue_has_required_fields(issue: &Issue) -> bool {
    !issue.id.trim().is_empty()
        && !issue.identifier.trim().is_empty()
        && !issue.title.trim().is_empty()
        && !issue.state.trim().is_empty()
}

fn priority_rank(priority: Option<i32>) -> i32 {
    match priority {
        Some(value) if (1..=4).contains(&value) => value,
        _ => 5,
    }
}

fn issue_created_at_sort_key(issue: &Issue) -> i64 {
    issue
        .created_at
        .map(|created_at| created_at.timestamp_micros())
        .unwrap_or(i64::MAX)
}

fn issue_identifier_sort_key(issue: &Issue) -> (&str, &str) {
    (issue.identifier.as_str(), issue.id.as_str())
}

pub fn rate_limit_info(data: serde_json::Value) -> RateLimitInfo {
    RateLimitInfo { data }
}
