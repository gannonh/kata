use chrono::Utc;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use crate::config;
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
    /// Normalized running issue state cache used for per-state slot accounting.
    running_issue_states: HashMap<String, String>,
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
            running_issue_states: HashMap::new(),
            next_retry_token: 0,
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        Ok(())
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

            self.dispatch_issue(&refreshed_issue);
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

    fn reconcile_running(&mut self, port: &mut dyn OrchestratorPort) -> Result<()> {
        let running_issue_ids: Vec<String> = self.state.running.keys().cloned().collect();
        let refreshed_issues = port.reconcile_running_issues(&running_issue_ids)?;

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

        if self.state.claimed.contains(&issue.id)
            || self.state.running.contains_key(&issue.id)
            || self.state.completed.contains(&issue.id)
        {
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

    fn dispatch_issue(&mut self, issue: &Issue) {
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
        self.state.retry_attempts.remove(&issue.id);
        self.running_issue_states
            .insert(issue.id.clone(), normalize_issue_state(&issue.state));
    }

    fn mark_issue_terminal(&mut self, issue_id: &str) {
        self.state.completed.insert(issue_id.to_string());
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
    }

    fn release_issue(&mut self, issue_id: &str) {
        self.state.running.remove(issue_id);
        self.state.claimed.remove(issue_id);
        self.state.retry_attempts.remove(issue_id);
        self.running_issue_states.remove(issue_id);
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
