use chrono::Utc;
use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::domain::{
    CodexTotals, Issue, OrchestratorSnapshot, OrchestratorState, PollingSnapshot, RateLimitInfo,
    RetryEntry, RetrySnapshotEntry, RunAttempt, ServiceConfig,
};
use crate::error::Result;

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
    WorkerStalled {
        issue_id: String,
    },
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

pub trait OrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> Result<Vec<Issue>>;

    fn reconcile_running_issues(&mut self, running_issue_ids: &[String]) -> Result<Vec<Issue>>;

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> Result<()>;

    fn fetch_candidate_issues(&mut self) -> Result<Vec<Issue>>;

    fn refresh_issue(&mut self, issue_id: &str) -> Result<Option<Issue>>;
}

/// Minimal S06 T01 placeholder surface.
///
/// Intentionally incomplete runtime semantics. T01 creates failing contract
/// tests against this API; T02/T03 will implement real behavior.
pub struct Orchestrator {
    config: ServiceConfig,
    state: OrchestratorState,
    events: Vec<RuntimeEvent>,
    retry_tokens: HashMap<String, String>,
    worker_last_activity_ms: HashMap<String, i64>,
    next_retry_token: u64,
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
            next_retry_token: 0,
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        Ok(())
    }

    pub fn startup_cleanup(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        self.events.push(RuntimeEvent::StartupCleanup);
        let _ = port.startup_terminal_issues(&self.config.tracker.terminal_states)?;

        // Intentionally left incomplete in T01: terminal issue reconciliation is not
        // yet applied to state.completed.
        Ok(())
    }

    pub fn tick(&mut self, port: &mut dyn OrchestratorPort) -> Result<TickResult> {
        self.events.push(RuntimeEvent::Dispatch);
        let candidates = port.fetch_candidate_issues()?;

        self.events.push(RuntimeEvent::Validate);
        let _ = port.validate_dispatch_preflight(&self.config);

        self.events.push(RuntimeEvent::Reconcile);
        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();
        let _ = port.reconcile_running_issues(&running_issue_ids)?;

        // Intentionally left incomplete in T01:
        // - no ordering guarantees (dispatch currently first)
        // - no validation skip behavior
        // - no sorting/gating/blocker checks
        // - no stale-state refresh checks
        let mut dispatched_issue_ids = vec![];
        if let Some(issue) = candidates.first() {
            self.dispatch_placeholder(issue);
            dispatched_issue_ids.push(issue.id.clone());
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
        self.next_retry_token += 1;
        let token = format!("retry-{}", self.next_retry_token);

        // Intentionally incomplete in T01: failure backoff currently uses the
        // continuation delay placeholder.
        let due_at_ms = now_ms + CONTINUATION_RETRY_DELAY_MS;

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
                error,
                worker_host: None,
                workspace_path: None,
            },
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

    pub fn fire_retry(&mut self, issue_id: &str, _token: &str) -> bool {
        // Intentionally incomplete in T01: stale token suppression is not
        // implemented yet.
        self.retry_tokens.remove(issue_id);
        self.state.retry_attempts.remove(issue_id).is_some()
    }

    pub fn record_worker_activity(&mut self, issue_id: &str, timestamp_ms: i64) {
        self.worker_last_activity_ms
            .insert(issue_id.to_string(), timestamp_ms);
    }

    pub fn detect_stalled_workers(&mut self, _now_ms: i64, _stall_timeout_ms: i64) {
        // Intentionally incomplete in T01: stall detection and forced retry
        // scheduling are implemented in T03.
    }

    pub fn apply_turn_metrics(&mut self, _metrics: &TurnMetrics) {
        // Intentionally incomplete in T01: codex totals/rate-limit accumulation
        // is implemented in T03.
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

    fn dispatch_placeholder(&mut self, issue: &Issue) {
        let attempt = RunAttempt {
            issue_id: issue.id.clone(),
            issue_identifier: issue.identifier.clone(),
            attempt: None,
            workspace_path: "/tmp/symphony-workspace-placeholder".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
        };

        self.state.running.insert(issue.id.clone(), attempt);
        self.state.claimed.insert(issue.id.clone());
    }
}

pub fn rate_limit_info(data: serde_json::Value) -> RateLimitInfo {
    RateLimitInfo { data }
}
