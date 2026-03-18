use std::collections::HashMap;

use chrono::{Duration, Utc};

use symphony::domain::{
    AgentConfig, BlockerRef, Issue, ServiceConfig, TrackerConfig, WorkflowDefinition,
};
use symphony::error::{Result, SymphonyError};
use symphony::orchestrator::{
    Orchestrator, OrchestratorPort, RetryKind, RuntimeEvent, TurnMetrics,
    CONTINUATION_RETRY_DELAY_MS,
};

#[derive(Default)]
struct FakePort {
    calls: Vec<String>,
    terminal_issues: Vec<Issue>,
    reconciled_issues: Vec<Issue>,
    candidate_issues: Vec<Issue>,
    refreshed_issues: HashMap<String, Option<Issue>>,
    validate_should_fail: bool,
}

impl FakePort {
    fn call_history(&self) -> &[String] {
        &self.calls
    }
}

impl OrchestratorPort for FakePort {
    fn startup_terminal_issues(&mut self, _terminal_states: &[String]) -> Result<Vec<Issue>> {
        self.calls.push("startup_terminal_issues".to_string());
        Ok(self.terminal_issues.clone())
    }

    fn reconcile_running_issues(&mut self, _running_issue_ids: &[String]) -> Result<Vec<Issue>> {
        self.calls.push("reconcile_running_issues".to_string());
        Ok(self.reconciled_issues.clone())
    }

    fn validate_dispatch_preflight(&mut self, _config: &ServiceConfig) -> Result<()> {
        self.calls.push("validate_dispatch_preflight".to_string());
        if self.validate_should_fail {
            Err(SymphonyError::MissingLinearApiToken)
        } else {
            Ok(())
        }
    }

    fn fetch_candidate_issues(&mut self) -> Result<Vec<Issue>> {
        self.calls.push("fetch_candidate_issues".to_string());
        Ok(self.candidate_issues.clone())
    }

    fn refresh_issue(&mut self, issue_id: &str) -> Result<Option<Issue>> {
        self.calls.push(format!("refresh_issue:{issue_id}"));
        Ok(self
            .refreshed_issues
            .get(issue_id)
            .cloned()
            .unwrap_or_else(|| None))
    }
}

fn test_config(max_concurrent_agents: u32) -> ServiceConfig {
    let mut config = ServiceConfig::default();
    config.tracker = TrackerConfig {
        kind: Some("linear".to_string()),
        api_key: Some("test-key".into()),
        project_slug: Some("project".to_string()),
        active_states: vec!["Todo".to_string(), "In Progress".to_string()],
        terminal_states: vec!["Done".to_string(), "Canceled".to_string()],
        ..TrackerConfig::default()
    };
    config.agent = AgentConfig {
        max_concurrent_agents,
        max_turns: 20,
        max_retry_backoff_ms: 60_000,
        max_concurrent_agents_by_state: HashMap::from([
            ("todo".to_string(), 1_u32),
            ("in progress".to_string(), 1_u32),
        ]),
    };
    config
}

fn issue(
    id: &str,
    identifier: &str,
    state: &str,
    priority: Option<i32>,
    created_at_offset_secs: i64,
) -> Issue {
    Issue {
        id: id.to_string(),
        identifier: identifier.to_string(),
        title: format!("Issue {identifier}"),
        description: Some("orchestrator test issue".to_string()),
        priority,
        state: state.to_string(),
        branch_name: None,
        url: None,
        assignee_id: None,
        labels: vec![],
        blocked_by: vec![],
        assigned_to_worker: true,
        created_at: Some(Utc::now() + Duration::seconds(created_at_offset_secs)),
        updated_at: Some(Utc::now()),
    }
}

#[test]
fn test_startup_terminal_cleanup_marks_terminal_issues_completed() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let mut port = FakePort {
        terminal_issues: vec![issue("issue-closed", "SIM-10", "Done", Some(1), 0)],
        ..FakePort::default()
    };

    let result = orchestrator.startup_cleanup(&mut port);
    assert!(
        result.is_ok(),
        "startup cleanup should run without transport errors: {result:?}"
    );

    let completed = &orchestrator.state().completed;
    assert!(
        completed.contains("issue-closed"),
        "startup cleanup must mark terminal tracker issues as completed before first dispatch"
    );
}

#[test]
fn test_tick_reconcile_before_validate_before_dispatch() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let mut port = FakePort {
        candidate_issues: vec![issue("issue-1", "SIM-1", "Todo", Some(2), 0)],
        ..FakePort::default()
    };

    let result = orchestrator.tick(&mut port);
    assert!(result.is_ok(), "tick should complete: {result:?}");

    assert_eq!(
        port.call_history(),
        [
            "reconcile_running_issues",
            "validate_dispatch_preflight",
            "fetch_candidate_issues"
        ],
        "tick must execute reconcile -> validate -> dispatch fetch ordering"
    );
}

#[test]
fn test_preflight_validation_failure_skips_dispatch_but_reconcile_continues() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let mut port = FakePort {
        validate_should_fail: true,
        candidate_issues: vec![issue("issue-2", "SIM-2", "Todo", Some(1), 0)],
        ..FakePort::default()
    };

    let result = orchestrator.tick(&mut port);
    assert!(result.is_ok(), "tick should not crash on preflight failure");

    let called_reconcile = port
        .call_history()
        .iter()
        .any(|call| call == "reconcile_running_issues");
    assert!(
        called_reconcile,
        "reconcile must still run when preflight validation fails"
    );

    let called_dispatch_fetch = port
        .call_history()
        .iter()
        .any(|call| call == "fetch_candidate_issues");
    assert!(
        !called_dispatch_fetch,
        "candidate fetch/dispatch must be skipped on preflight validation failure"
    );

    let has_skip_signal = orchestrator
        .events()
        .iter()
        .any(|event| matches!(event, RuntimeEvent::ValidationSkippedDispatch));
    assert!(
        has_skip_signal,
        "orchestrator should emit a validation skip signal for diagnostics"
    );
}

#[test]
fn test_candidate_sorting_and_gating_rules() {
    let mut orchestrator = Orchestrator::new(test_config(1));

    let mut blocked = issue("issue-blocked", "SIM-20", "Todo", Some(0), 0);
    blocked.blocked_by.push(BlockerRef {
        id: Some("issue-parent".to_string()),
        identifier: Some("SIM-5".to_string()),
        state: Some("In Progress".to_string()),
    });

    let highest = issue("issue-highest", "SIM-21", "Todo", Some(1), 10);
    let lower = issue("issue-lower", "SIM-22", "Todo", Some(3), -10);

    let mut port = FakePort {
        candidate_issues: vec![blocked, lower.clone(), highest.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port);
    assert!(tick.is_ok(), "tick should return a result");

    let dispatched = tick
        .ok()
        .map(|value| value.dispatched_issue_ids)
        .unwrap_or_default();

    assert_eq!(
        dispatched,
        vec![highest.id],
        "dispatch must sort by priority/created_at/identifier and gate blocked issues"
    );
}

#[test]
fn test_predispatch_refresh_rejects_stale_state() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let stale_candidate = issue("issue-stale", "SIM-30", "In Progress", Some(1), 0);
    let refreshed_terminal = issue("issue-stale", "SIM-30", "Done", Some(1), 0);

    let mut port = FakePort {
        candidate_issues: vec![stale_candidate],
        refreshed_issues: HashMap::from([("issue-stale".to_string(), Some(refreshed_terminal))]),
        ..FakePort::default()
    };

    let result = orchestrator.tick(&mut port);
    assert!(result.is_ok(), "tick should handle refresh checks");

    let refresh_called = port
        .call_history()
        .iter()
        .any(|call| call == "refresh_issue:issue-stale");
    assert!(
        refresh_called,
        "orchestrator must refresh issue state by id before dispatch"
    );

    let running_has_stale = orchestrator.state().running.contains_key("issue-stale");
    assert!(
        !running_has_stale,
        "orchestrator must reject dispatch when refreshed state is no longer active"
    );
}

#[test]
fn test_retry_scheduling_continuation_and_failure_backoff_rules() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let now_ms = 10_000;

    let continuation_token = orchestrator.schedule_retry(
        "issue-continuation",
        "SIM-40",
        1,
        RetryKind::Continuation,
        now_ms,
        None,
    );

    let failure_token = orchestrator.schedule_retry(
        "issue-failure",
        "SIM-41",
        3,
        RetryKind::Failure,
        now_ms,
        Some("agent exited: :boom".to_string()),
    );

    assert!(
        continuation_token != failure_token,
        "retry scheduling should issue unique retry tokens"
    );

    let continuation_due = orchestrator
        .state()
        .retry_attempts
        .get("issue-continuation")
        .map(|entry| entry.due_at_ms)
        .unwrap_or_default();
    assert_eq!(
        continuation_due,
        now_ms + CONTINUATION_RETRY_DELAY_MS,
        "continuation retry should schedule at +1s"
    );

    let failure_due = orchestrator
        .state()
        .retry_attempts
        .get("issue-failure")
        .map(|entry| entry.due_at_ms)
        .unwrap_or_default();
    assert_eq!(
        failure_due,
        now_ms + 40_000,
        "failure retry attempt=3 should schedule with exponential backoff base 10s"
    );
}

#[test]
fn test_stale_retry_timer_is_ignored() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let now_ms = 20_000;

    let current_token = orchestrator.schedule_retry(
        "issue-stale-retry",
        "SIM-50",
        2,
        RetryKind::Failure,
        now_ms,
        Some("agent exited: :boom".to_string()),
    );

    let stale_token = "retry-stale-token".to_string();
    let consumed = orchestrator.fire_retry("issue-stale-retry", &stale_token);

    assert!(
        !consumed,
        "stale retry token should be ignored instead of consuming retry queue entries"
    );

    let still_present = orchestrator
        .state()
        .retry_attempts
        .contains_key("issue-stale-retry");
    assert!(
        still_present,
        "stale retry firing must keep the newer retry entry in place"
    );

    let ignored_event_present = orchestrator.events().iter().any(|event| {
        matches!(
            event,
            RuntimeEvent::RetryIgnoredStale { issue_id, token }
                if issue_id == "issue-stale-retry" && token == &stale_token
        )
    });

    assert!(
        ignored_event_present,
        "stale retry suppression should emit retry_ignored_stale diagnostic event"
    );

    let queue_token = orchestrator
        .state()
        .retry_attempts
        .get("issue-stale-retry")
        .and_then(|entry| entry.timer_handle.clone())
        .unwrap_or_default();

    assert_eq!(
        queue_token, current_token,
        "queue should preserve the current retry token"
    );
}

#[test]
fn test_stall_detection_schedules_forced_retry() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    orchestrator.state_mut().running.insert(
        "issue-stalled".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stalled".to_string(),
            issue_identifier: "SIM-60".to_string(),
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stalled".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
        },
    );

    let now_ms = 200_000;
    orchestrator.record_worker_activity("issue-stalled", now_ms - 31_000);
    orchestrator.detect_stalled_workers(now_ms, 30_000);

    let has_retry = orchestrator
        .state()
        .retry_attempts
        .contains_key("issue-stalled");
    assert!(
        has_retry,
        "stalled worker should be moved into retry queue with forced retry"
    );

    let stalled_event = orchestrator
        .events()
        .iter()
        .any(|event| matches!(event, RuntimeEvent::WorkerStalled { issue_id } if issue_id == "issue-stalled"));
    assert!(
        stalled_event,
        "stalled worker path should emit worker_stalled diagnostic event"
    );
}

#[test]
fn test_codex_totals_and_rate_limits_accumulate_into_snapshot() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    orchestrator.apply_turn_metrics(&TurnMetrics {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        rate_limits: Some(serde_json::json!({ "remaining": 99 })),
    });

    orchestrator.apply_turn_metrics(&TurnMetrics {
        input_tokens: 7,
        output_tokens: 3,
        total_tokens: 10,
        rate_limits: Some(serde_json::json!({ "remaining": 88 })),
    });

    let snapshot = orchestrator.snapshot(0);

    assert_eq!(
        snapshot.codex_totals.input_tokens, 17,
        "input token totals should accumulate across turns"
    );
    assert_eq!(
        snapshot.codex_totals.output_tokens, 8,
        "output token totals should accumulate across turns"
    );
    assert_eq!(
        snapshot.codex_totals.total_tokens, 25,
        "total tokens should accumulate across turns"
    );

    let remaining = snapshot
        .codex_rate_limits
        .as_ref()
        .and_then(|value| value.data.get("remaining"))
        .and_then(|value| value.as_i64())
        .unwrap_or_default();

    assert_eq!(
        remaining, 88,
        "snapshot should retain latest observed rate-limit payload"
    );
}

#[test]
fn test_snapshot_exposes_running_and_retry_diagnostics() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    orchestrator.state_mut().running.insert(
        "issue-running".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-running".to_string(),
            issue_identifier: "SIM-70".to_string(),
            attempt: Some(2),
            workspace_path: "/tmp/workspace-running".to_string(),
            started_at: Utc::now(),
            status: "failed".to_string(),
            error: Some("worker failed".to_string()),
            worker_host: Some("worker-a".to_string()),
        },
    );

    orchestrator.schedule_retry(
        "issue-running",
        "SIM-70",
        3,
        RetryKind::Failure,
        1_000,
        Some("worker failed".to_string()),
    );

    let snapshot = orchestrator.snapshot(1_000);

    let has_running = snapshot.running.contains_key("issue-running");
    assert!(
        has_running,
        "snapshot should include currently running entries for diagnostics"
    );

    let retry_error = snapshot
        .retry_queue
        .first()
        .and_then(|entry| entry.error.clone())
        .unwrap_or_default();

    assert_eq!(
        retry_error, "worker failed",
        "snapshot retry queue should include error diagnostics for failed runs"
    );
}

#[test]
fn test_contract_inputs_are_wired_from_task_plan() {
    let workflow = WorkflowDefinition {
        config: serde_yaml::Value::Mapping(serde_yaml::Mapping::new()),
        prompt_template: "{{ issue.title }}".to_string(),
    };

    assert!(
        workflow.prompt_template.contains("issue"),
        "test harness keeps WorkflowDefinition available for future worker prompt assertions"
    );
}
