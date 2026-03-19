use std::collections::HashMap;

use chrono::{Duration, Utc};

use symphony::domain::{AgentConfig, AgentEvent, BlockerRef, Issue, ServiceConfig, TrackerConfig};
use symphony::error::{Result, SymphonyError};
use symphony::orchestrator::{
    refresh_channel, Orchestrator, OrchestratorPort, RetryKind, RuntimeEvent, TurnMetrics,
    WorkerCompletion, CONTINUATION_RETRY_DELAY_MS,
};

#[derive(Default)]
struct FakePort {
    calls: Vec<String>,
    terminal_issues: Vec<Issue>,
    reconciled_issues: Vec<Issue>,
    candidate_issues: Vec<Issue>,
    refreshed_issues: HashMap<String, Option<Issue>>,
    validate_should_fail: bool,
    reconcile_should_fail: bool,
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
        if self.reconcile_should_fail {
            return Err(SymphonyError::Other("reconcile failed".to_string()));
        }

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

        if let Some(explicit) = self.refreshed_issues.get(issue_id) {
            return Ok(explicit.clone());
        }

        Ok(self
            .candidate_issues
            .iter()
            .find(|issue| issue.id == issue_id)
            .cloned())
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
fn test_reconcile_startup_terminal_cleanup_marks_terminal_issues_completed() {
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
fn test_reconcile_tick_reconcile_before_validate_before_dispatch() {
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
            "fetch_candidate_issues",
            "refresh_issue:issue-1"
        ],
        "tick must execute reconcile -> validate -> dispatch fetch ordering"
    );
}

#[test]
fn test_reconcile_refresh_failure_is_non_fatal_and_dispatch_continues() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let mut port = FakePort {
        reconcile_should_fail: true,
        candidate_issues: vec![issue("issue-1", "SIM-1", "Todo", Some(2), 0)],
        ..FakePort::default()
    };

    let result = orchestrator.tick(&mut port);
    assert!(
        result.is_ok(),
        "tick should continue when running-state refresh fails"
    );

    assert_eq!(
        port.call_history(),
        [
            "reconcile_running_issues",
            "validate_dispatch_preflight",
            "fetch_candidate_issues",
            "refresh_issue:issue-1"
        ],
        "reconcile refresh failures should not abort validation/dispatch phases"
    );
}

#[test]
fn test_completed_is_bookkeeping_and_does_not_block_dispatch() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let candidate = issue("issue-1", "SIM-1", "Todo", Some(1), 0);
    orchestrator
        .state_mut()
        .completed
        .insert(candidate.id.clone());

    let mut port = FakePort {
        candidate_issues: vec![candidate.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![candidate.id],
        "completed bookkeeping must not block dispatch eligibility"
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
fn test_dispatch_candidate_sorting_and_gating_rules() {
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
fn test_dispatch_enforces_per_state_concurrency_caps() {
    let mut orchestrator = Orchestrator::new(test_config(3));

    let seeded_todo = issue("issue-seeded", "SIM-23", "Todo", Some(1), -30);
    let mut seed_port = FakePort {
        candidate_issues: vec![seeded_todo.clone()],
        ..FakePort::default()
    };

    let seed_tick = orchestrator
        .tick(&mut seed_port)
        .expect("seed tick should pass");
    assert_eq!(
        seed_tick.dispatched_issue_ids,
        vec![seeded_todo.id.clone()],
        "first todo issue should dispatch into the only todo slot"
    );

    let blocked_todo = issue("issue-todo-overflow", "SIM-24", "Todo", Some(1), -20);
    let allowed_in_progress = issue("issue-in-progress", "SIM-25", "In Progress", Some(2), -10);

    let mut second_port = FakePort {
        reconciled_issues: vec![seeded_todo],
        candidate_issues: vec![blocked_todo, allowed_in_progress.clone()],
        ..FakePort::default()
    };

    let second_tick = orchestrator
        .tick(&mut second_port)
        .expect("second tick should pass");

    assert_eq!(
        second_tick.dispatched_issue_ids,
        vec![allowed_in_progress.id.clone()],
        "todo overflow should be blocked by per-state cap while in-progress still dispatches"
    );
}

#[test]
fn test_dispatch_predispatch_refresh_rejects_stale_state() {
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

    let stalled_event = orchestrator.events().iter().any(|event| {
        matches!(
            event,
            RuntimeEvent::WorkerStalled {
                issue_id,
                issue_identifier,
                elapsed_ms,
                ..
            } if issue_id == "issue-stalled" && issue_identifier == "SIM-60" && *elapsed_ms > 30_000
        )
    });
    assert!(
        stalled_event,
        "stalled worker path should emit worker_stalled diagnostic event"
    );
}

#[test]
fn test_token_totals_and_rate_limits_accumulate_into_snapshot() {
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

    orchestrator.schedule_retry_with_context(
        "issue-running",
        "SIM-70",
        3,
        RetryKind::Failure,
        1_000,
        Some("worker failed".to_string()),
        symphony::orchestrator::RetryContext {
            worker_host: Some("worker-a".to_string()),
            workspace_path: Some("/tmp/workspace-running".to_string()),
            session_id: Some("thread-70-turn-2".to_string()),
        },
    );

    let snapshot = orchestrator.snapshot(1_000);

    let has_running = snapshot.running.contains_key("issue-running");
    assert!(
        has_running,
        "snapshot should include currently running entries for diagnostics"
    );

    let retry_entry = snapshot
        .retry_queue
        .first()
        .expect("retry entry should exist");

    let retry_error = retry_entry.error.clone().unwrap_or_default();

    assert_eq!(
        retry_error, "worker failed",
        "snapshot retry queue should include error diagnostics for failed runs"
    );

    assert_eq!(
        retry_entry.worker_host.as_deref(),
        Some("worker-a"),
        "snapshot retry queue should preserve worker host diagnostics when available"
    );

    assert_eq!(
        retry_entry.workspace_path.as_deref(),
        Some("/tmp/workspace-running"),
        "snapshot retry queue should preserve workspace diagnostics when available"
    );
}

#[test]
fn test_worker_completion_schedules_continuation_retry_with_session_context() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    orchestrator.state_mut().running.insert(
        "issue-complete".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-complete".to_string(),
            issue_identifier: "SIM-80".to_string(),
            attempt: Some(2),
            workspace_path: "/tmp/workspace-complete".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: Some("worker-b".to_string()),
        },
    );

    orchestrator.ingest_agent_event(
        "issue-complete",
        &AgentEvent::SessionStarted {
            timestamp: Utc::now(),
            codex_app_server_pid: Some("4242".to_string()),
            session_id: "thread-80-turn-1".to_string(),
        },
    );

    orchestrator.handle_worker_completion("issue-complete", WorkerCompletion::Completed, 50_000);

    let retry_entry = orchestrator
        .state()
        .retry_attempts
        .get("issue-complete")
        .expect("continuation retry should be queued");

    assert_eq!(retry_entry.attempt, 1);
    assert_eq!(
        retry_entry.due_at_ms, 51_000,
        "continuation retries should always use +1s delay"
    );
    assert_eq!(retry_entry.worker_host.as_deref(), Some("worker-b"));
    assert_eq!(
        retry_entry.workspace_path.as_deref(),
        Some("/tmp/workspace-complete")
    );

    let worker_completed = orchestrator.events().iter().any(|event| {
        matches!(
            event,
            RuntimeEvent::WorkerCompleted {
                issue_id,
                issue_identifier,
                session_id,
            } if issue_id == "issue-complete"
                && issue_identifier == "SIM-80"
                && session_id.as_deref() == Some("thread-80-turn-1")
        )
    });

    assert!(
        worker_completed,
        "worker completion diagnostics should retain issue/session context"
    );
}

#[test]
fn test_worker_failure_preserves_attempt_and_backoff_cap() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    orchestrator.state_mut().running.insert(
        "issue-fail".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-fail".to_string(),
            issue_identifier: "SIM-81".to_string(),
            attempt: Some(5),
            workspace_path: "/tmp/workspace-fail".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: Some("worker-c".to_string()),
        },
    );

    orchestrator.handle_worker_completion(
        "issue-fail",
        WorkerCompletion::Failed {
            error: "agent exited: :boom".to_string(),
        },
        80_000,
    );

    let retry_entry = orchestrator
        .state()
        .retry_attempts
        .get("issue-fail")
        .expect("failure retry should be queued");

    assert_eq!(
        retry_entry.attempt, 6,
        "failure retries should preserve/increment attempt count from the run"
    );
    assert_eq!(
        retry_entry.due_at_ms, 140_000,
        "attempt 6 backoff should be capped by max_retry_backoff_ms (60s in test config)"
    );

    let worker_failed = orchestrator.events().iter().any(|event| {
        matches!(
            event,
            RuntimeEvent::WorkerFailed {
                issue_id,
                issue_identifier,
                error,
                ..
            } if issue_id == "issue-fail"
                && issue_identifier == "SIM-81"
                && error == "agent exited: :boom"
        )
    });

    assert!(
        worker_failed,
        "worker failure diagnostics should retain issue context and failure reason"
    );
}

// ── Snapshot Handle Tests ──────────────────────────────────────────────

#[test]
fn test_snapshot_handle_read_returns_published_state() {
    let mut orchestrator = Orchestrator::new(test_config(2));

    // Dispatch an issue so the snapshot has running state
    let candidate = issue("issue-snap", "SIM-90", "Todo", Some(1), 0);
    let mut port = FakePort {
        candidate_issues: vec![candidate.clone()],
        ..FakePort::default()
    };
    orchestrator.tick(&mut port).expect("tick should succeed");

    // Create handle after state mutation
    let handle = orchestrator.create_snapshot_handle();
    let snapshot = handle.read();

    assert!(
        snapshot.running.contains_key("issue-snap"),
        "snapshot handle should reflect orchestrator running state at creation time"
    );
    assert_eq!(
        snapshot.running.get("issue-snap").unwrap().issue_identifier,
        "SIM-90",
        "snapshot handle should carry full RunAttempt data"
    );
}

#[test]
fn test_snapshot_handle_updates_after_publish() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let handle = orchestrator.create_snapshot_handle();

    // Initially empty running state
    let snap1 = handle.read();
    assert!(
        snap1.running.is_empty(),
        "initial snapshot should have no running issues"
    );

    // Dispatch an issue
    let candidate = issue("issue-pub", "SIM-91", "Todo", Some(1), 0);
    let mut port = FakePort {
        candidate_issues: vec![candidate],
        ..FakePort::default()
    };
    orchestrator.tick(&mut port).expect("tick should succeed");

    // Before publish, handle still has old snapshot
    let snap_before = handle.read();
    assert!(
        snap_before.running.is_empty(),
        "snapshot should not update until publish_snapshot is called"
    );

    // Publish and verify update
    orchestrator.publish_snapshot();
    let snap_after = handle.read();
    assert!(
        snap_after.running.contains_key("issue-pub"),
        "snapshot handle should reflect new state after publish_snapshot"
    );
}

#[test]
fn test_snapshot_handle_is_clone_cheap_and_shares_state() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let handle1 = orchestrator.create_snapshot_handle();
    let handle2 = handle1.clone();

    // Dispatch and publish
    let candidate = issue("issue-clone", "SIM-92", "In Progress", Some(2), 0);
    let mut port = FakePort {
        candidate_issues: vec![candidate],
        ..FakePort::default()
    };
    orchestrator.tick(&mut port).expect("tick should succeed");
    orchestrator.publish_snapshot();

    let snap1 = handle1.read();
    let snap2 = handle2.read();
    assert_eq!(
        snap1.running.len(),
        snap2.running.len(),
        "cloned handles must share the same underlying snapshot"
    );
    assert!(snap1.running.contains_key("issue-clone"));
    assert!(snap2.running.contains_key("issue-clone"));
}

#[test]
fn test_snapshot_handle_preserves_codex_totals_and_rate_limits() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let handle = orchestrator.create_snapshot_handle();

    orchestrator.apply_turn_metrics(&TurnMetrics {
        input_tokens: 50,
        output_tokens: 30,
        total_tokens: 80,
        rate_limits: Some(serde_json::json!({ "remaining": 42, "limit": 100 })),
    });

    orchestrator.publish_snapshot();
    let snap = handle.read();

    assert_eq!(snap.codex_totals.total_tokens, 80);
    assert_eq!(snap.codex_totals.input_tokens, 50);
    assert_eq!(snap.codex_totals.output_tokens, 30);

    let remaining = snap
        .codex_rate_limits
        .as_ref()
        .and_then(|rl| rl.data.get("remaining"))
        .and_then(|v| v.as_i64())
        .unwrap_or_default();
    assert_eq!(
        remaining, 42,
        "snapshot handle should carry rate limit data for API consumption"
    );
}

// ── Refresh Channel Tests ──────────────────────────────────────────────

#[test]
fn test_refresh_channel_first_request_is_queued() {
    let (sender, receiver) = refresh_channel();

    let outcome = sender.request_refresh();
    assert!(
        outcome.queued,
        "first refresh request should report queued=true"
    );
    assert!(
        !outcome.coalesced,
        "first refresh request should report coalesced=false"
    );
    assert_eq!(
        outcome.pending_requests, 1,
        "pending_requests should be 1 after first request"
    );
    assert!(
        receiver.take_pending(),
        "receiver should see the pending flag"
    );
}

#[test]
fn test_refresh_channel_duplicate_requests_coalesce() {
    let (sender, _receiver) = refresh_channel();

    let first = sender.request_refresh();
    assert!(first.queued, "first request should be queued");
    assert!(!first.coalesced, "first request should not be coalesced");

    let second = sender.request_refresh();
    assert!(
        !second.queued,
        "duplicate refresh should report queued=false"
    );
    assert!(
        second.coalesced,
        "duplicate refresh should report coalesced=true"
    );
    assert_eq!(
        second.pending_requests, 1,
        "pending_requests stays 1 due to coalescing"
    );

    let third = sender.request_refresh();
    assert!(
        third.coalesced,
        "third consecutive refresh should also coalesce"
    );
}

#[test]
fn test_refresh_channel_take_pending_clears_flag() {
    let (sender, receiver) = refresh_channel();

    sender.request_refresh();
    assert!(receiver.take_pending(), "first take should return true");
    assert!(
        !receiver.take_pending(),
        "second take without new request should return false"
    );
}

#[test]
fn test_refresh_channel_resets_after_take_allows_new_queued_request() {
    let (sender, receiver) = refresh_channel();

    // First cycle
    let first = sender.request_refresh();
    assert!(first.queued);
    assert!(receiver.take_pending());

    // After take, a new request should be queued (not coalesced)
    let after_take = sender.request_refresh();
    assert!(
        after_take.queued,
        "request after take_pending should be freshly queued"
    );
    assert!(
        !after_take.coalesced,
        "request after take_pending should not be coalesced"
    );
}

#[test]
fn test_refresh_sender_is_clone_cheap() {
    let (sender1, receiver) = refresh_channel();
    let sender2 = sender1.clone();

    // First request from sender1
    let first = sender1.request_refresh();
    assert!(first.queued);

    // Duplicate from sender2 should coalesce
    let second = sender2.request_refresh();
    assert!(second.coalesced, "cloned sender should share pending state");

    // Receiver sees the combined request
    assert!(receiver.take_pending());
}

#[tokio::test]
async fn test_refresh_channel_notified_wakes_on_request() {
    let (sender, receiver) = refresh_channel();

    // Spawn a task that sends a refresh after a small delay
    let sender_clone = sender.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        sender_clone.request_refresh();
    });

    // Wait for notification with a timeout
    let result =
        tokio::time::timeout(std::time::Duration::from_millis(500), receiver.notified()).await;

    assert!(
        result.is_ok(),
        "refresh notified() should wake when request_refresh is called"
    );
    assert!(
        receiver.take_pending(),
        "pending flag should be set after notification"
    );
}

// ── Orchestrator + Refresh Integration Tests ───────────────────────────

#[test]
fn test_orchestrator_create_refresh_channel_returns_functional_sender() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let sender = orchestrator.create_refresh_channel();

    let outcome = sender.request_refresh();
    assert!(
        outcome.queued,
        "sender from orchestrator should be functional"
    );
}

#[test]
fn test_orchestrator_create_snapshot_handle_and_refresh_channel_independently() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let handle = orchestrator.create_snapshot_handle();
    let sender = orchestrator.create_refresh_channel();

    // Both should work independently
    let snap = handle.read();
    assert!(snap.running.is_empty());

    let outcome = sender.request_refresh();
    assert!(outcome.queued);
}

#[test]
fn test_snapshot_handle_reflects_retry_queue_for_api_use() {
    let mut orchestrator = Orchestrator::new(test_config(2));
    let handle = orchestrator.create_snapshot_handle();

    orchestrator.schedule_retry(
        "issue-retry-snap",
        "SIM-95",
        2,
        RetryKind::Failure,
        10_000,
        Some("timeout".to_string()),
    );

    orchestrator.publish_snapshot();
    let snap = handle.read();

    assert_eq!(
        snap.retry_queue.len(),
        1,
        "snapshot should expose retry queue for API consumption"
    );
    let entry = &snap.retry_queue[0];
    assert_eq!(entry.identifier, "SIM-95");
    assert_eq!(entry.attempt, 2);
    assert_eq!(entry.error.as_deref(), Some("timeout"));
}

#[test]
fn test_reconcile_non_active_state_stops_run_without_cleanup() {
    // Issue is running but its tracker state has moved to a non-active, non-terminal
    // state (e.g. "In Review" — not in active_states ["Todo", "In Progress"] and not
    // in terminal_states ["Done", "Canceled"]).
    // Expected: release_issue path fires → running entry is removed, but the issue is
    // NOT added to `completed` (no terminal cleanup).
    let mut orchestrator = Orchestrator::new(test_config(2));

    // Manually seed the running map as if the orchestrator already dispatched this issue.
    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-non-active".to_string(),
        issue_identifier: "SIM-97".to_string(),
        attempt: None,
        workspace_path: "/tmp/ws-non-active".to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-non-active".to_string(), attempt);

    assert!(
        orchestrator
            .state()
            .running
            .contains_key("issue-non-active"),
        "precondition: issue must be in running map before reconcile"
    );

    // Reconcile returns the issue in a non-active, non-terminal state.
    let mut port = FakePort {
        reconciled_issues: vec![issue("issue-non-active", "SIM-97", "In Review", Some(1), 0)],
        ..FakePort::default()
    };

    orchestrator.tick(&mut port).expect("tick should succeed");

    // The running entry must be removed (release_issue called).
    assert!(
        !orchestrator
            .state()
            .running
            .contains_key("issue-non-active"),
        "running entry must be removed when tracker state is non-active"
    );

    // The issue must NOT be in completed — non-terminal stop has no workspace cleanup.
    assert!(
        !orchestrator.state().completed.contains("issue-non-active"),
        "non-terminal state stop must not add issue to completed (no cleanup semantic)"
    );
}
