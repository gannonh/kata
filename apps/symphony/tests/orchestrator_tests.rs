use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration as StdDuration, Instant};

use chrono::{Duration, TimeZone, Utc};
use mockito::{Server, ServerGuard};
use serde_json::json;
use tempfile::{tempdir, NamedTempFile};

use symphony::domain::{
    AgentConfig, AgentEvent, ApiKey, BlockerRef, Issue, ServiceConfig, TrackerConfig,
    WorkspaceIsolation,
};
use symphony::error::{Result, SymphonyError};
use symphony::orchestrator::{
    refresh_channel, Orchestrator, OrchestratorPort, RetryContext, RetryKind, RuntimeEvent,
    TurnMetrics, WorkerCompletion, CONTINUATION_RETRY_DELAY_MS,
};
use symphony::workflow_store::WorkflowStore;

#[derive(Default)]
struct FakePort {
    calls: Vec<String>,
    terminal_issues: Vec<Issue>,
    reconciled_issues: Vec<Issue>,
    candidate_issues: Vec<Issue>,
    refreshed_issues: HashMap<String, Option<Issue>>,
    validated_server_ports: Vec<Option<u16>>,
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

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> Result<()> {
        self.calls.push("validate_dispatch_preflight".to_string());
        self.validated_server_ports.push(config.server.port);
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

    fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> Result<()> {
        self.calls
            .push(format!("update_issue_state:{issue_id}:{state_name}"));
        Ok(())
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
        children_count: 0,
        parent_identifier: None,
    }
}

fn overwrite_workflow_file(
    path: &Path,
    poll_interval_ms: u64,
    max_concurrent_agents: u32,
    stall_timeout_ms: u64,
    prompt_template: &str,
) {
    let mut file = File::create(path).expect("workflow file should be writable");
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: test-key\n  project_slug: project\npolling:\n  interval_ms: {poll_interval_ms}\nagent:\n  max_concurrent_agents: {max_concurrent_agents}\ncodex:\n  stall_timeout_ms: {stall_timeout_ms}\n---\n{prompt_template}"
    )
    .expect("workflow file should be updated");
}

fn wait_for_workflow_config(
    store: &WorkflowStore,
    expected_poll_interval_ms: u64,
    expected_max_concurrent_agents: u32,
    expected_stall_timeout_ms: u64,
    expected_prompt_fragment: &str,
) {
    let deadline = Instant::now() + StdDuration::from_secs(6);

    loop {
        let (workflow_def, config) = store.effective_config();
        let matches = config.polling.interval_ms == expected_poll_interval_ms
            && config.agent.max_concurrent_agents == expected_max_concurrent_agents
            && config.codex.stall_timeout_ms == expected_stall_timeout_ms
            && workflow_def
                .prompt_template
                .contains(expected_prompt_fragment);

        if matches {
            return;
        }

        if Instant::now() >= deadline {
            panic!(
                "timed out waiting for workflow reload (poll={}, max_agents={}, stall={}, prompt={:?}); observed poll={}, max_agents={}, stall={}, prompt={:?}",
                expected_poll_interval_ms,
                expected_max_concurrent_agents,
                expected_stall_timeout_ms,
                expected_prompt_fragment,
                config.polling.interval_ms,
                config.agent.max_concurrent_agents,
                config.codex.stall_timeout_ms,
                workflow_def.prompt_template
            );
        }

        std::thread::sleep(StdDuration::from_millis(100));
    }
}

#[test]
fn test_tick_refreshes_runtime_state_from_workflow_store_reload() {
    let workflow = NamedTempFile::new().expect("temp workflow should be created");
    overwrite_workflow_file(workflow.path(), 1000, 1, 60_000, "Prompt v1");

    let workflow_store = Arc::new(
        WorkflowStore::new(workflow.path())
            .expect("workflow store should initialize from temp file"),
    );

    wait_for_workflow_config(&workflow_store, 1000, 1, 60_000, "Prompt v1");

    let mut orchestrator = Orchestrator::new_with_workflow_store(Arc::clone(&workflow_store));
    let mut port = FakePort::default();

    let initial_tick = orchestrator
        .tick(&mut port)
        .expect("initial tick should succeed");
    assert!(
        initial_tick.dispatched_issue_ids.is_empty(),
        "baseline tick should not dispatch without candidates"
    );
    assert_eq!(orchestrator.state().max_concurrent_agents, 1);
    assert_eq!(orchestrator.state().poll_interval_ms, 1000);

    overwrite_workflow_file(workflow.path(), 2222, 4, 90_000, "Prompt v2");
    wait_for_workflow_config(&workflow_store, 2222, 4, 90_000, "Prompt v2");

    let after_reload_tick = orchestrator
        .tick(&mut port)
        .expect("tick after workflow reload should succeed");
    assert!(
        after_reload_tick.dispatched_issue_ids.is_empty(),
        "reload tick should remain non-dispatching without candidates"
    );

    assert_eq!(
        orchestrator.state().max_concurrent_agents,
        4,
        "tick should sync state.max_concurrent_agents from reloaded workflow config"
    );
    assert_eq!(
        orchestrator.state().poll_interval_ms,
        2222,
        "tick should sync state.poll_interval_ms from reloaded workflow config"
    );
}

#[test]
fn test_tick_applies_server_port_override_over_workflow_store_config() {
    let workflow = NamedTempFile::new().expect("temp workflow should be created");
    let mut file = File::create(workflow.path()).expect("workflow file should be writable");
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: test-key\n  project_slug: project\nserver:\n  port: 9100\n---\nPrompt v1"
    )
    .expect("workflow file should be written");

    let workflow_store = Arc::new(
        WorkflowStore::new(workflow.path())
            .expect("workflow store should initialize from temp file"),
    );

    let mut orchestrator = Orchestrator::new_with_workflow_store_and_port_override(
        Arc::clone(&workflow_store),
        Some(7777),
    );
    let mut port = FakePort::default();

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert!(
        tick.dispatched_issue_ids.is_empty(),
        "tick should not dispatch without candidates"
    );
    assert_eq!(
        port.validated_server_ports,
        vec![Some(7777)],
        "CLI override should be preserved in the runtime config passed to preflight validation"
    );
}

fn utc_ms(ms: i64) -> chrono::DateTime<Utc> {
    Utc.timestamp_millis_opt(ms)
        .single()
        .expect("millisecond timestamp should be representable")
}

#[test]
fn test_reconcile_startup_terminal_cleanup_excludes_terminal_issues_from_completed() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
        !completed.contains_key("issue-closed"),
        "startup cleanup should not include pre-existing terminal issues in session completed list"
    );
}

#[test]
fn test_startup_terminal_cleanup_clears_runtime_bookkeeping_without_completed_insert() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let mut port = FakePort {
        terminal_issues: vec![issue("issue-closed", "SIM-10", "Done", Some(1), 0)],
        ..FakePort::default()
    };

    orchestrator.state_mut().running.insert(
        "issue-closed".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-closed".to_string(),
            issue_identifier: "SIM-10".to_string(),
            issue_title: Some("Issue SIM-10".to_string()),
            attempt: Some(2),
            workspace_path: "/tmp/workspace-closed".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: Some("In Progress".to_string()),
        },
    );
    orchestrator
        .state_mut()
        .claimed
        .insert("issue-closed".to_string());
    orchestrator.state_mut().retry_attempts.insert(
        "issue-closed".to_string(),
        symphony::domain::RetryEntry {
            issue_id: "issue-closed".to_string(),
            identifier: "SIM-10".to_string(),
            attempt: 2,
            due_at_ms: 42_000,
            timer_handle: Some("timer-1".to_string()),
            error: Some("retry pending".to_string()),
            worker_host: None,
            workspace_path: Some("/tmp/workspace-closed".to_string()),
        },
    );
    orchestrator.state_mut().completed.insert(
        "issue-closed".to_string(),
        symphony::domain::CompletedEntry {
            issue_id: "issue-closed".to_string(),
            identifier: "SIM-10".to_string(),
            title: "Issue SIM-10".to_string(),
            completed_at: Some(Utc::now()),
        },
    );

    let result = orchestrator.startup_cleanup(&mut port);
    assert!(
        result.is_ok(),
        "startup cleanup should run without transport errors: {result:?}"
    );

    assert!(
        !orchestrator.state().running.contains_key("issue-closed"),
        "startup terminal cleanup should clear running bookkeeping"
    );
    assert!(
        !orchestrator.state().claimed.contains("issue-closed"),
        "startup terminal cleanup should clear claimed bookkeeping"
    );
    assert!(
        !orchestrator
            .state()
            .retry_attempts
            .contains_key("issue-closed"),
        "startup terminal cleanup should clear retry bookkeeping"
    );
    assert!(
        !orchestrator.state().completed.contains_key("issue-closed"),
        "startup terminal cleanup should still avoid completed session entries"
    );
}

#[test]
fn test_reconcile_tick_reconcile_before_validate_before_dispatch() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let candidate = issue("issue-1", "SIM-1", "Todo", Some(1), 0);
    orchestrator.state_mut().completed.insert(
        candidate.id.clone(),
        symphony::domain::CompletedEntry {
            issue_id: candidate.id.clone(),
            identifier: candidate.identifier.clone(),
            title: candidate.title.clone(),
            completed_at: Some(chrono::Utc::now()),
        },
    );

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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(1), String::new());

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
fn test_dispatch_docker_isolation_never_assigns_ssh_worker_host() {
    let mut config = test_config(1);
    config.workspace.isolation = WorkspaceIsolation::Docker;
    config.worker.ssh_hosts = vec!["worker-a".to_string(), "worker-b".to_string()];

    let mut orchestrator = Orchestrator::new(config, String::new());
    let candidate = issue("issue-docker", "SIM-DOCKER", "In Progress", Some(1), 0);
    let issue_id = candidate.id.clone();

    let mut port = FakePort {
        candidate_issues: vec![candidate],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![issue_id.clone()],
        "docker candidate should still dispatch"
    );

    let running = orchestrator
        .state()
        .running
        .get(&issue_id)
        .expect("run attempt should be tracked");
    assert!(
        running.worker_host.is_none(),
        "docker isolation must not assign SSH worker hosts"
    );
}

#[test]
fn test_dispatch_predispatch_refresh_rejects_stale_state() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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

#[tokio::test]
async fn test_due_continuation_retry_marks_terminal_issue_completed_when_not_visible_in_candidates()
{
    let mut config = test_config(1);
    config.polling.interval_ms = 60_000;
    let mut orchestrator = Orchestrator::new(config, String::new());

    orchestrator.schedule_retry(
        "issue-terminal-before-retry",
        "SIM-79",
        1,
        RetryKind::Continuation,
        0,
        None,
    );

    let mut port = FakePort {
        candidate_issues: vec![],
        refreshed_issues: HashMap::from([(
            "issue-terminal-before-retry".to_string(),
            Some(issue(
                "issue-terminal-before-retry",
                "SIM-79",
                "Done",
                Some(1),
                0,
            )),
        )]),
        ..FakePort::default()
    };

    let run_result = tokio::time::timeout(
        tokio::time::Duration::from_millis(200),
        orchestrator.run(&mut port),
    )
    .await;
    assert!(
        run_result.is_err(),
        "orchestrator run loop should be canceled by timeout in test harness"
    );

    assert!(
        orchestrator
            .state()
            .completed
            .contains_key("issue-terminal-before-retry"),
        "terminal issue reached during retry visibility gap must be tracked as completed"
    );
    assert!(
        !orchestrator
            .state()
            .retry_attempts
            .contains_key("issue-terminal-before-retry"),
        "terminal issue should be removed from retry queue after terminal refresh"
    );
    assert!(
        port.call_history()
            .iter()
            .any(|call| call == "refresh_issue:issue-terminal-before-retry"),
        "retry handling should refresh hidden issue by id before releasing it"
    );
}

#[test]
fn test_stall_detection_schedules_forced_retry() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    orchestrator.state_mut().running.insert(
        "issue-stalled".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stalled".to_string(),
            issue_identifier: "SIM-60".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stalled".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
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
fn test_streamed_event_updates_activity_before_worker_completion() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let now_ms = 1_000_000;
    orchestrator.state_mut().running.insert(
        "issue-stream-activity".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stream-activity".to_string(),
            issue_identifier: "SIM-STREAM-1".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stream-activity".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.ingest_agent_event(
        "issue-stream-activity",
        &AgentEvent::SessionStarted {
            timestamp: utc_ms(now_ms - 5_000),
            codex_app_server_pid: Some("1234".to_string()),
            session_id: "thread-stream-1-turn-1".to_string(),
        },
    );

    orchestrator.detect_stalled_workers(now_ms, 30_000);

    assert!(
        orchestrator
            .state()
            .running
            .contains_key("issue-stream-activity"),
        "recent streamed events should refresh activity and keep the worker running"
    );
    assert!(
        !orchestrator
            .state()
            .retry_attempts
            .contains_key("issue-stream-activity"),
        "worker should not be retried while streamed activity is within stall timeout"
    );

    let snapshot = orchestrator.snapshot(now_ms);
    let session = snapshot
        .running_sessions
        .get("issue-stream-activity")
        .expect("running session snapshot should include stream activity issue");
    assert_eq!(session.last_event.as_deref(), Some("session_started"));
    assert_eq!(
        session.last_event_message.as_deref(),
        Some("session thread-s")
    );
    assert_eq!(
        session.session_id.as_deref(),
        Some("thread-stream-1-turn-1")
    );
}

#[test]
fn test_streamed_events_keep_refreshing_stall_detection_window() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let start_ms = 2_000_000;
    orchestrator.state_mut().running.insert(
        "issue-stream-window".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stream-window".to_string(),
            issue_identifier: "SIM-STREAM-2".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stream-window".to_string(),
            started_at: utc_ms(start_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.ingest_agent_event(
        "issue-stream-window",
        &AgentEvent::SessionStarted {
            timestamp: utc_ms(start_ms - 20_000),
            codex_app_server_pid: Some("2222".to_string()),
            session_id: "thread-stream-2-turn-1".to_string(),
        },
    );
    orchestrator.detect_stalled_workers(start_ms, 30_000);
    assert!(
        orchestrator
            .state()
            .running
            .contains_key("issue-stream-window"),
        "first streamed event should prevent stall at initial check"
    );

    let later_ms = start_ms + 35_000;
    orchestrator.ingest_agent_event(
        "issue-stream-window",
        &AgentEvent::Notification {
            timestamp: utc_ms(later_ms - 5_000),
            codex_app_server_pid: Some("2222".to_string()),
            message: "progress update".to_string(),
        },
    );
    orchestrator.detect_stalled_workers(later_ms, 30_000);

    assert!(
        orchestrator
            .state()
            .running
            .contains_key("issue-stream-window"),
        "subsequent streamed events should keep extending the non-stalled window"
    );
    assert!(
        !orchestrator
            .state()
            .retry_attempts
            .contains_key("issue-stream-window"),
        "stalled retry should remain unscheduled when streamed activity continues"
    );
}

#[test]
fn test_streamed_notification_records_event_method_and_message() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let now_ms = 3_000_000;
    orchestrator.state_mut().running.insert(
        "issue-notification".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-notification".to_string(),
            issue_identifier: "SIM-STREAM-3".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-notification".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.ingest_agent_event(
        "issue-notification",
        &AgentEvent::Notification {
            timestamp: utc_ms(now_ms - 3_000),
            codex_app_server_pid: Some("3333".to_string()),
            message:
                r#"{"method":"codex/event/task_started","params":{"message":"running cargo test"}}"#
                    .to_string(),
        },
    );

    let snapshot = orchestrator.snapshot(now_ms);
    let session = snapshot
        .running_sessions
        .get("issue-notification")
        .expect("running session snapshot should include notification issue");
    assert_eq!(
        session.last_event.as_deref(),
        Some("codex/event/task_started")
    );
    assert_eq!(
        session.last_event_message.as_deref(),
        Some("running cargo test")
    );
}

#[test]
fn test_streamed_tool_call_completed_uses_completed_summary() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let now_ms = 3_500_000;
    orchestrator.state_mut().running.insert(
        "issue-tool-call".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-tool-call".to_string(),
            issue_identifier: "SIM-STREAM-TOOL".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-tool-call".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.ingest_agent_event(
        "issue-tool-call",
        &AgentEvent::ToolCallCompleted {
            timestamp: utc_ms(now_ms - 1_000),
            codex_app_server_pid: Some("4444".to_string()),
            tool_name: "cargo test".to_string(),
        },
    );

    let snapshot = orchestrator.snapshot(now_ms);
    let session = snapshot
        .running_sessions
        .get("issue-tool-call")
        .expect("running session snapshot should include tool call issue");
    assert_eq!(session.last_event.as_deref(), Some("tool_call_completed"));
    assert_eq!(
        session.last_event_message.as_deref(),
        Some("completed cargo test")
    );
}

#[test]
fn test_streamed_turn_completed_events_update_token_totals_in_real_time() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let now_ms = 3_000_000;
    orchestrator.state_mut().running.insert(
        "issue-stream-metrics".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stream-metrics".to_string(),
            issue_identifier: "SIM-STREAM-3".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stream-metrics".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    let event_time = Utc::now();
    orchestrator.ingest_agent_event(
        "issue-stream-metrics",
        &AgentEvent::TurnCompleted {
            timestamp: event_time,
            codex_app_server_pid: Some("3333".to_string()),
            turn_id: "turn-1".to_string(),
            message: None,
            input_tokens: 9,
            output_tokens: 4,
            total_tokens: 13,
            rate_limits: Some(json!({ "remaining": 91 })),
        },
    );

    assert_eq!(
        orchestrator.state().codex_totals.input_tokens,
        9,
        "streamed turn-completed events should apply input-token totals immediately"
    );
    assert_eq!(
        orchestrator.state().codex_totals.output_tokens,
        4,
        "streamed turn-completed events should apply output-token totals immediately"
    );
    assert_eq!(
        orchestrator.state().codex_totals.total_tokens,
        13,
        "streamed turn-completed events should apply total-token totals immediately"
    );

    orchestrator.ingest_agent_event(
        "issue-stream-metrics",
        &AgentEvent::TurnCompleted {
            timestamp: event_time,
            codex_app_server_pid: Some("3333".to_string()),
            turn_id: "turn-2".to_string(),
            message: None,
            input_tokens: 3,
            output_tokens: 2,
            total_tokens: 5,
            rate_limits: None,
        },
    );

    assert_eq!(
        orchestrator.state().codex_totals.input_tokens,
        12,
        "token totals should continue accumulating across streamed turns"
    );
    assert_eq!(
        orchestrator.state().codex_totals.output_tokens,
        6,
        "output totals should continue accumulating across streamed turns"
    );
    assert_eq!(
        orchestrator.state().codex_totals.total_tokens,
        18,
        "total token count should continue accumulating across streamed turns"
    );

    let snapshot = orchestrator.snapshot(now_ms + 5_000);
    let session = snapshot
        .running_sessions
        .get("issue-stream-metrics")
        .expect("running session snapshot should exist for active issue");
    assert_eq!(
        session.turn_count, 2,
        "running session snapshot should track streamed completed turns"
    );
    assert_eq!(
        session.total_tokens, 18,
        "running session snapshot should track per-session total tokens"
    );
    assert_eq!(
        session.last_activity_at,
        Some(event_time),
        "running session snapshot should preserve last activity timestamp"
    );

    let session_info = snapshot
        .running_session_info
        .get("issue-stream-metrics")
        .expect("running session info should exist for active issue");

    assert_eq!(
        session_info.turn_count, 3,
        "turn count should advance as streamed turn-completed events are ingested"
    );
    assert_eq!(
        session_info.max_turns, 20,
        "running session info should retain configured max-turn budget"
    );
    assert_eq!(
        session_info.session_tokens.input_tokens, 12,
        "session token accounting should accumulate input tokens per running session"
    );
    assert_eq!(
        session_info.session_tokens.output_tokens, 6,
        "session token accounting should accumulate output tokens per running session"
    );
    assert_eq!(
        session_info.session_tokens.total_tokens, 18,
        "session token accounting should accumulate total tokens per running session"
    );
    assert_eq!(
        session_info.last_activity_ms,
        Some(event_time.timestamp_millis()),
        "last activity should track the most recent streamed event timestamp"
    );
}

#[test]
fn test_event_count_increments_on_ingest() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let now_ms = 3_250_000;
    let issue_id = "issue-event-count";
    orchestrator.state_mut().running.insert(
        issue_id.to_string(),
        symphony::domain::RunAttempt {
            issue_id: issue_id.to_string(),
            issue_identifier: "SIM-EVENT-COUNT".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-event-count".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.ingest_agent_event(
        issue_id,
        &AgentEvent::Notification {
            timestamp: utc_ms(now_ms - 3_000),
            codex_app_server_pid: Some("9999".to_string()),
            message: "step started".to_string(),
        },
    );
    orchestrator.ingest_agent_event(
        issue_id,
        &AgentEvent::TurnCompleted {
            timestamp: utc_ms(now_ms - 2_000),
            codex_app_server_pid: Some("9999".to_string()),
            turn_id: "turn-1".to_string(),
            message: None,
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
            rate_limits: None,
        },
    );
    orchestrator.ingest_agent_event(
        issue_id,
        &AgentEvent::TurnFailed {
            timestamp: utc_ms(now_ms - 1_000),
            codex_app_server_pid: Some("9999".to_string()),
            turn_id: "turn-2".to_string(),
            error: "boom".to_string(),
        },
    );

    assert_eq!(
        orchestrator.state().codex_totals.event_count,
        3,
        "event_count should increment for every ingested event variant"
    );

    let snapshot = orchestrator.snapshot(now_ms);
    assert_eq!(
        snapshot.codex_totals.event_count, 3,
        "snapshot should expose the event counter"
    );
}

#[test]
fn test_late_streamed_event_after_completion_is_ignored() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let now_ms = 4_000_000;
    let issue_id = "issue-late-stream";

    orchestrator.state_mut().running.insert(
        issue_id.to_string(),
        symphony::domain::RunAttempt {
            issue_id: issue_id.to_string(),
            issue_identifier: "SIM-STREAM-LATE".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stream-late".to_string(),
            started_at: utc_ms(now_ms - 300_000),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    orchestrator.handle_worker_completion(
        issue_id,
        WorkerCompletion::Completed {
            schedule_continuation: false,
        },
        now_ms,
    );

    orchestrator.ingest_agent_event(
        issue_id,
        &AgentEvent::TurnCompleted {
            timestamp: utc_ms(now_ms - 1_000),
            codex_app_server_pid: Some("4444".to_string()),
            turn_id: "turn-late".to_string(),
            message: None,
            input_tokens: 11,
            output_tokens: 7,
            total_tokens: 18,
            rate_limits: Some(json!({ "remaining": 77 })),
        },
    );

    assert!(
        !orchestrator.state().running.contains_key(issue_id),
        "late streamed events must not resurrect completed run attempts"
    );
    assert_eq!(
        orchestrator.state().codex_totals.total_tokens,
        0,
        "late streamed events for completed issues should be ignored"
    );
    assert_eq!(
        orchestrator.state().codex_totals.event_count,
        0,
        "ignored events should not increment the event counter"
    );
}

#[test]
fn test_token_totals_and_rate_limits_accumulate_into_snapshot() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    orchestrator.state_mut().running.insert(
        "issue-running".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-running".to_string(),
            issue_identifier: "SIM-70".to_string(),
            issue_title: None,
            attempt: Some(2),
            workspace_path: "/tmp/workspace-running".to_string(),
            started_at: Utc::now(),
            status: "failed".to_string(),
            error: Some("worker failed".to_string()),
            worker_host: Some("worker-a".to_string()),
            model: None,
            linear_state: None,
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

    let running_session = snapshot
        .running_sessions
        .get("issue-running")
        .expect("snapshot should include running session diagnostics");
    assert_eq!(
        running_session.session_id, None,
        "running session snapshot should not reuse stale retry context session IDs before new streamed stats arrive"
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    orchestrator.state_mut().running.insert(
        "issue-complete".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-complete".to_string(),
            issue_identifier: "SIM-80".to_string(),
            issue_title: None,
            attempt: Some(2),
            workspace_path: "/tmp/workspace-complete".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: Some("worker-b".to_string()),
            model: None,
            linear_state: None,
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

    orchestrator.handle_worker_completion(
        "issue-complete",
        WorkerCompletion::Completed {
            schedule_continuation: true,
        },
        50_000,
    );

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
    assert!(
        !orchestrator.state().running.contains_key("issue-complete"),
        "completed turn should leave running map before retry scheduling"
    );
    assert!(
        !orchestrator
            .state()
            .completed
            .contains_key("issue-complete"),
        "continuation completions must stay out of completed until terminal state"
    );
    assert!(
        orchestrator.state().running.len()
            + orchestrator.state().retry_attempts.len()
            + orchestrator.state().completed.len()
            <= 1,
        "running + retry + completed bookkeeping must not exceed dispatched issue count"
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
fn test_worker_completion_without_continuation_does_not_queue_retry() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    orchestrator.state_mut().running.insert(
        "issue-stop".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-stop".to_string(),
            issue_identifier: "SIM-80B".to_string(),
            issue_title: None,
            attempt: Some(1),
            workspace_path: "/tmp/workspace-stop".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );

    let scheduled = orchestrator.handle_worker_completion(
        "issue-stop",
        WorkerCompletion::Completed {
            schedule_continuation: false,
        },
        50_000,
    );

    assert!(
        scheduled.is_none(),
        "completion without continuation should not enqueue retry"
    );
    assert!(
        !orchestrator
            .state()
            .retry_attempts
            .contains_key("issue-stop"),
        "retry queue should stay empty when continuation is disabled"
    );
    assert!(
        orchestrator.state().completed.contains_key("issue-stop"),
        "issue should still be marked completed in orchestrator bookkeeping"
    );
    assert!(
        orchestrator.state().running.len()
            + orchestrator.state().retry_attempts.len()
            + orchestrator.state().completed.len()
            <= 1,
        "running + retry + completed bookkeeping must not exceed dispatched issue count"
    );
}

#[test]
fn test_worker_failure_preserves_attempt_and_backoff_cap() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    orchestrator.state_mut().running.insert(
        "issue-fail".to_string(),
        symphony::domain::RunAttempt {
            issue_id: "issue-fail".to_string(),
            issue_identifier: "SIM-81".to_string(),
            issue_title: None,
            attempt: Some(5),
            workspace_path: "/tmp/workspace-fail".to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: Some("worker-c".to_string()),
            model: None,
            linear_state: None,
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
    assert!(
        !orchestrator.state().completed.contains_key("issue-fail"),
        "failed issues must not be retained in completed bookkeeping"
    );
    assert!(
        orchestrator.state().running.len()
            + orchestrator.state().retry_attempts.len()
            + orchestrator.state().completed.len()
            <= 1,
        "running + retry + completed bookkeeping must not exceed dispatched issue count"
    );
}

// ── Snapshot Handle Tests ──────────────────────────────────────────────

#[test]
fn test_snapshot_handle_read_returns_published_state() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let sender = orchestrator.create_refresh_channel();

    let outcome = sender.request_refresh();
    assert!(
        outcome.queued,
        "sender from orchestrator should be functional"
    );
}

#[test]
fn test_orchestrator_create_snapshot_handle_and_refresh_channel_independently() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
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
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    // Manually seed the running map as if the orchestrator already dispatched this issue.
    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-non-active".to_string(),
        issue_identifier: "SIM-97".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: "/tmp/ws-non-active".to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
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
        !orchestrator
            .state()
            .completed
            .contains_key("issue-non-active"),
        "non-terminal state stop must not add issue to completed (no cleanup semantic)"
    );
}

fn command_success(mut cmd: Command, context: &str) -> String {
    let output = cmd
        .output()
        .unwrap_or_else(|err| panic!("{context}: failed to run command: {err}"));
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "{context}: command failed\nstatus: {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        stdout,
        stderr
    );
    stdout.trim().to_string()
}

fn init_git_repo(path: &Path) {
    fs::create_dir_all(path).expect("source repo directory should be created");
    fs::write(path.join("README.md"), "hello\n").expect("source repo file should be written");

    let mut init = Command::new("git");
    init.current_dir(path).arg("init");
    command_success(init, "git init source repo");

    let mut set_name = Command::new("git");
    set_name
        .current_dir(path)
        .args(["config", "user.name", "Symphony Test"]);
    command_success(set_name, "git config user.name");

    let mut set_email = Command::new("git");
    set_email
        .current_dir(path)
        .args(["config", "user.email", "symphony-tests@example.com"]);
    command_success(set_email, "git config user.email");

    let mut add = Command::new("git");
    add.current_dir(path).args(["add", "."]);
    command_success(add, "git add source repo files");

    let mut commit = Command::new("git");
    commit
        .current_dir(path)
        .args(["commit", "-m", "initial commit"]);
    command_success(commit, "git commit source repo files");
}

fn shell_quote(path: &Path) -> String {
    let raw = path.to_string_lossy();
    format!("'{}'", raw.replace('\'', "'\"'\"'"))
}

#[test]
fn test_terminal_state_cleanup_removes_workspace_when_enabled() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let workspace_path = workspace_root.path().join("SIM-98");
    fs::create_dir_all(&workspace_path).expect("workspace should exist before cleanup");
    fs::write(workspace_path.join("artifact.txt"), "temp")
        .expect("workspace file should exist before cleanup");

    let mut config = test_config(2);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = true;
    let mut orchestrator = Orchestrator::new(config, String::new());

    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-terminal-cleanup".to_string(),
        issue_identifier: "SIM-98".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: workspace_path.to_string_lossy().to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-terminal-cleanup".to_string(), attempt);

    let mut port = FakePort {
        reconciled_issues: vec![issue(
            "issue-terminal-cleanup",
            "SIM-98",
            "Done",
            Some(1),
            0,
        )],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("tick should succeed while cleaning terminal workspace");

    assert!(
        !workspace_path.exists(),
        "terminal cleanup should remove workspace directory when enabled"
    );
}

#[test]
fn test_terminal_state_cleanup_preserves_workspace_when_disabled() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let workspace_path = workspace_root.path().join("SIM-99");
    fs::create_dir_all(&workspace_path).expect("workspace should exist before reconcile");

    let mut config = test_config(2);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = false;
    let mut orchestrator = Orchestrator::new(config, String::new());

    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-terminal-no-cleanup".to_string(),
        issue_identifier: "SIM-99".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: workspace_path.to_string_lossy().to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-terminal-no-cleanup".to_string(), attempt);

    let mut port = FakePort {
        reconciled_issues: vec![issue(
            "issue-terminal-no-cleanup",
            "SIM-99",
            "Done",
            Some(1),
            0,
        )],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("tick should succeed with cleanup disabled");

    assert!(
        workspace_path.exists(),
        "workspace should be preserved when cleanup_on_done is false"
    );
}

#[test]
fn test_terminal_state_cleanup_runs_before_remove_hook() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let workspace_path = workspace_root.path().join("SIM-100");
    let before_remove_log = workspace_root.path().join("before_remove.log");
    fs::create_dir_all(&workspace_path).expect("workspace should exist before cleanup");
    let expected_workspace_path = fs::canonicalize(&workspace_path)
        .expect("workspace path should canonicalize")
        .to_string_lossy()
        .to_string();

    let mut config = test_config(2);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = true;
    config.hooks.before_remove = Some(format!(
        "printf 'before-remove|%s|%s|%s|%s' \"$SYMPHONY_ISSUE_ID\" \"$SYMPHONY_ISSUE_IDENTIFIER\" \"$SYMPHONY_ISSUE_TITLE\" \"$SYMPHONY_WORKSPACE_PATH\" > {}",
        shell_quote(&before_remove_log)
    ));
    let mut orchestrator = Orchestrator::new(config, String::new());

    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-before-remove-hook".to_string(),
        issue_identifier: "SIM-100".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: workspace_path.to_string_lossy().to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-before-remove-hook".to_string(), attempt);

    let mut port = FakePort {
        reconciled_issues: vec![issue(
            "issue-before-remove-hook",
            "SIM-100",
            "Done",
            Some(1),
            0,
        )],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("tick should succeed while running before_remove hook");

    let hook_output =
        fs::read_to_string(&before_remove_log).expect("before_remove hook should write log");
    let mut fields = hook_output.splitn(5, '|');
    assert_eq!(fields.next(), Some("before-remove"));
    assert_eq!(fields.next(), Some("issue-before-remove-hook"));
    assert_eq!(fields.next(), Some("SIM-100"));
    assert_eq!(fields.next(), Some("Issue SIM-100"));
    assert_eq!(fields.next(), Some(expected_workspace_path.as_str()));
    assert!(
        !workspace_path.exists(),
        "workspace should still be removed after before_remove hook runs"
    );
}

#[test]
fn test_terminal_state_cleanup_defers_until_worker_completion() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let workspace_path = workspace_root.path().join("SIM-103");
    fs::create_dir_all(&workspace_path).expect("workspace should exist before cleanup");

    let mut config = test_config(2);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = true;
    let mut orchestrator = Orchestrator::new(config, String::new());

    let issue_id = "issue-terminal-deferred-cleanup";
    orchestrator.state_mut().running.insert(
        issue_id.to_string(),
        symphony::domain::RunAttempt {
            issue_id: issue_id.to_string(),
            issue_identifier: "SIM-103".to_string(),
            issue_title: None,
            attempt: None,
            workspace_path: workspace_path.to_string_lossy().to_string(),
            started_at: Utc::now(),
            status: "running".to_string(),
            error: None,
            worker_host: None,
            model: None,
            linear_state: None,
        },
    );
    orchestrator.schedule_retry_with_context(
        issue_id,
        "SIM-103",
        1,
        RetryKind::Failure,
        0,
        None,
        RetryContext {
            worker_host: None,
            workspace_path: None,
            session_id: Some("session-103".to_string()),
        },
    );
    orchestrator.state_mut().retry_attempts.remove(issue_id);

    let mut port = FakePort {
        reconciled_issues: vec![issue(issue_id, "SIM-103", "Done", Some(1), 0)],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("tick should succeed while marking active worker issue terminal");

    assert!(
        workspace_path.exists(),
        "workspace cleanup should be deferred while worker is still active"
    );

    let completion_result = orchestrator.handle_worker_completion(
        issue_id,
        WorkerCompletion::Completed {
            schedule_continuation: false,
        },
        0,
    );
    assert!(
        completion_result.is_none(),
        "terminal issue completion after deferred cleanup should not enqueue follow-up work"
    );
    assert!(
        !workspace_path.exists(),
        "deferred terminal cleanup should remove workspace when worker completion arrives"
    );
}

#[tokio::test]
async fn test_terminal_state_cleanup_removes_retry_workspace_when_enabled() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let workspace_path = workspace_root.path().join("SIM-104");
    fs::create_dir_all(&workspace_path).expect("retry workspace should exist before cleanup");
    fs::write(workspace_path.join("artifact.txt"), "retry-temp")
        .expect("retry workspace artifact should exist before cleanup");

    let mut config = test_config(1);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = true;
    let mut orchestrator = Orchestrator::new(config, String::new());

    let issue_id = "issue-terminal-retry-cleanup";
    orchestrator.schedule_retry_with_context(
        issue_id,
        "SIM-104",
        1,
        RetryKind::Continuation,
        0,
        None,
        RetryContext {
            worker_host: None,
            workspace_path: Some(workspace_path.to_string_lossy().to_string()),
            session_id: None,
        },
    );

    let mut port = FakePort {
        refreshed_issues: HashMap::from([(
            issue_id.to_string(),
            Some(issue(issue_id, "SIM-104", "Done", Some(1), 0)),
        )]),
        ..FakePort::default()
    };

    let run_result = tokio::time::timeout(
        tokio::time::Duration::from_millis(200),
        orchestrator.run(&mut port),
    )
    .await;
    assert!(
        run_result.is_err(),
        "orchestrator run loop should be canceled by timeout in test harness"
    );

    assert!(
        !workspace_path.exists(),
        "terminal retry issue should remove retained workspace path when cleanup is enabled"
    );
    assert!(
        !orchestrator.state().retry_attempts.contains_key(issue_id),
        "terminal retry issue should be removed from retry queue after cleanup"
    );
}

#[test]
fn test_terminal_state_cleanup_removes_worktree_checkout_when_enabled() {
    let tmp = tempdir().expect("test root should be created");
    let workspace_root = tmp.path().join("workspaces");
    let source_repo = tmp.path().join("source-repo");
    fs::create_dir_all(&workspace_root).expect("workspace root should be created");
    init_git_repo(&source_repo);

    let mut config = test_config(2);
    config.workspace.root = workspace_root.to_string_lossy().to_string();
    config.workspace.repo = Some(source_repo.to_string_lossy().to_string());
    config.workspace.strategy = symphony::domain::WorkspaceRepoStrategy::Worktree;
    config.workspace.cleanup_on_done = true;

    let active_issue = issue(
        "issue-worktree-cleanup",
        "SIM-101",
        "In Progress",
        Some(1),
        0,
    );
    let workspace = symphony::workspace::ensure_workspace_for_issue(
        &active_issue,
        &config.workspace,
        &config.hooks,
    )
    .expect("worktree workspace should be created");
    let workspace_path = PathBuf::from(&workspace.path);

    let source_repo_str = source_repo.to_string_lossy().to_string();
    let mut list_before_cmd = Command::new("git");
    list_before_cmd.args(["-C", &source_repo_str, "worktree", "list", "--porcelain"]);
    let list_before = command_success(list_before_cmd, "list worktrees before cleanup");
    assert!(
        list_before.contains(&workspace.path),
        "source repo should track worktree before terminal cleanup"
    );

    let mut orchestrator = Orchestrator::new(config, String::new());
    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-worktree-cleanup".to_string(),
        issue_identifier: "SIM-101".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: workspace.path.clone(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-worktree-cleanup".to_string(), attempt);

    let mut port = FakePort {
        reconciled_issues: vec![issue(
            "issue-worktree-cleanup",
            "SIM-101",
            "Done",
            Some(1),
            0,
        )],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("tick should succeed while cleaning terminal worktree");

    assert!(
        !workspace_path.exists(),
        "terminal cleanup should remove worktree directory"
    );

    let mut list_after_cmd = Command::new("git");
    list_after_cmd.args(["-C", &source_repo_str, "worktree", "list", "--porcelain"]);
    let list_after = command_success(list_after_cmd, "list worktrees after cleanup");
    assert!(
        !list_after.contains(&workspace.path),
        "terminal cleanup should detach worktree from source repository"
    );
}

#[test]
fn test_terminal_state_cleanup_failure_is_non_fatal() {
    let workspace_root = tempdir().expect("workspace root should be created");
    let outside_root = tempdir().expect("outside root should be created");
    let outside_workspace = outside_root.path().join("SIM-102");
    fs::create_dir_all(&outside_workspace).expect("outside workspace should be created");

    let mut config = test_config(2);
    config.workspace.root = workspace_root.path().to_string_lossy().to_string();
    config.workspace.cleanup_on_done = true;
    let mut orchestrator = Orchestrator::new(config, String::new());

    let attempt = symphony::domain::RunAttempt {
        issue_id: "issue-cleanup-failure".to_string(),
        issue_identifier: "SIM-102".to_string(),
        issue_title: None,
        attempt: None,
        workspace_path: outside_workspace.to_string_lossy().to_string(),
        started_at: Utc::now(),
        status: "running".to_string(),
        error: None,
        worker_host: None,
        model: None,
        linear_state: None,
    };
    orchestrator
        .state_mut()
        .running
        .insert("issue-cleanup-failure".to_string(), attempt);

    let mut port = FakePort {
        reconciled_issues: vec![issue(
            "issue-cleanup-failure",
            "SIM-102",
            "Done",
            Some(1),
            0,
        )],
        ..FakePort::default()
    };

    orchestrator
        .tick(&mut port)
        .expect("cleanup failure should not fail orchestrator tick");

    assert!(
        orchestrator
            .state()
            .completed
            .contains_key("issue-cleanup-failure"),
        "issue should still transition to completed despite cleanup failure"
    );
    assert!(
        !orchestrator
            .state()
            .running
            .contains_key("issue-cleanup-failure"),
        "running entry should still be removed despite cleanup failure"
    );
    assert!(
        outside_workspace.exists(),
        "cleanup failure scenario should preserve outside-root workspace path"
    );
}

fn write_script(dir: &Path, name: &str, content: &str) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, content).expect("script should be written");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)
            .expect("script metadata should be readable")
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).expect("script should be executable");
    }

    path
}

fn state_lookup_response(
    issue_id: &str,
    identifier: &str,
    state: &str,
    assignee_id: Option<&str>,
) -> serde_json::Value {
    let assignee = assignee_id
        .map(|id| json!({ "id": id }))
        .unwrap_or_else(|| json!(null));

    json!({
        "data": {
            "issues": {
                "nodes": [
                    {
                        "id": issue_id,
                        "identifier": identifier,
                        "title": format!("Issue {identifier}"),
                        "description": "state refresh",
                        "priority": 2,
                        "state": { "name": state },
                        "branchName": null,
                        "url": null,
                        "assignee": assignee,
                        "labels": { "nodes": [] },
                        "inverseRelations": { "nodes": [] },
                        "createdAt": "2026-01-01T00:00:00.000Z",
                        "updatedAt": "2026-01-01T00:00:00.000Z"
                    }
                ]
            }
        }
    })
}

fn make_worker_config(
    server: &ServerGuard,
    script_path: &Path,
    workspace_root: &Path,
    max_turns: u32,
) -> ServiceConfig {
    let mut config = test_config(1);
    config.workspace.root = workspace_root.to_string_lossy().to_string();
    config.workspace.repo = None;
    config.codex.command = vec![script_path.to_string_lossy().to_string()];
    config.codex.approval_policy = serde_json::Value::String("never".to_string());
    config.codex.turn_sandbox_policy = None;
    config.tracker.endpoint = format!("{}/graphql", server.url());
    config.tracker.api_key = Some(ApiKey::new("test-api-key"));
    config.agent.max_turns = max_turns;
    config
}

fn script_two_successful_turns(prompt_log: &Path) -> String {
    format!(
        r#"#!/bin/bash
set -euo pipefail
PROMPT_LOG="{prompt_log}"
read -r line
echo '{{"id":1,"result":{{"capabilities":{{}}}}}}'
read -r line
read -r line
echo '{{"id":2,"result":{{"thread":{{"id":"thread-multi-1"}}}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-1"}}}}}}'
echo '{{"method":"token/1","params":{{"tokenUsage":{{"total":{{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}}}}}}'
echo '{{"method":"turn/completed","params":{{}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-2"}}}}}}'
echo '{{"method":"token/2","params":{{"tokenUsage":{{"total":{{"input_tokens":14,"output_tokens":9,"total_tokens":23}}}}}}}}'
echo '{{"method":"turn/completed","params":{{"rate_limits":{{"limit_id":"req","primary":{{"remaining":42}}}}}}}}'
read -r line || true
"#,
        prompt_log = prompt_log.display(),
    )
}

fn script_second_turn_fails(prompt_log: &Path) -> String {
    format!(
        r#"#!/bin/bash
set -euo pipefail
PROMPT_LOG="{prompt_log}"
read -r line
echo '{{"id":1,"result":{{"capabilities":{{}}}}}}'
read -r line
read -r line
echo '{{"id":2,"result":{{"thread":{{"id":"thread-fail-1"}}}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-1"}}}}}}'
echo '{{"method":"token/1","params":{{"tokenUsage":{{"total":{{"input_tokens":7,"output_tokens":3,"total_tokens":10}}}}}}}}'
echo '{{"method":"turn/completed","params":{{}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-2"}}}}}}'
echo '{{"method":"turn/failed","params":{{"message":"boom"}}}}'
read -r line || true
"#,
        prompt_log = prompt_log.display(),
    )
}

fn script_second_turn_omits_rate_limits(prompt_log: &Path) -> String {
    format!(
        r#"#!/bin/bash
set -euo pipefail
PROMPT_LOG="{prompt_log}"
read -r line
echo '{{"id":1,"result":{{"capabilities":{{}}}}}}'
read -r line
read -r line
echo '{{"id":2,"result":{{"thread":{{"id":"thread-rate-limits"}}}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-1"}}}}}}'
echo '{{"method":"token/1","params":{{"tokenUsage":{{"total":{{"input_tokens":5,"output_tokens":2,"total_tokens":7}}}}}}}}'
echo '{{"method":"turn/completed","params":{{"rate_limits":{{"limit_id":"req","primary":{{"remaining":99}}}}}}}}'
read -r line
echo "$line" >> "$PROMPT_LOG"
echo '{{"id":3,"result":{{"turn":{{"id":"turn-2"}}}}}}'
echo '{{"method":"token/2","params":{{"tokenUsage":{{"total":{{"input_tokens":6,"output_tokens":3,"total_tokens":9}}}}}}}}'
echo '{{"method":"turn/completed","params":{{}}}}'
read -r line || true
"#,
        prompt_log = prompt_log.display(),
    )
}

#[tokio::test]
async fn test_execute_worker_attempt_runs_multiple_turns_in_one_session_and_uses_continuation_prompt(
) {
    let mut server = Server::new_async().await;
    let issue = issue("issue-multi", "SIM-MULTI", "In Progress", Some(1), 0);

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "In Progress",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_two_successful_turns(&prompt_log),
    );

    let mut orchestrator = Orchestrator::new(
        make_worker_config(&server, &script, workspace_root.path(), 2),
        String::new(),
    );

    let prompt_template = "Full prompt for {{ issue.identifier }} attempt={{ attempt }}";
    let result = orchestrator
        .execute_worker_attempt(&issue, prompt_template, Some(1), |_query, _vars| async {
            Ok(serde_json::json!({ "data": {} }))
        })
        .await;

    assert!(
        result.is_ok(),
        "multi-turn attempt should succeed: {result:?}"
    );

    let prompt_lines: Vec<String> = std::fs::read_to_string(&prompt_log)
        .expect("prompt log should exist")
        .lines()
        .map(|line| line.to_string())
        .collect();

    assert_eq!(
        prompt_lines.len(),
        2,
        "worker should execute exactly 2 turns"
    );
    assert!(
        prompt_lines[0].contains("Full prompt for SIM-MULTI attempt=1"),
        "turn 1 should use rendered issue prompt"
    );
    assert!(
        prompt_lines[1].contains("Continuation guidance"),
        "turn 2 should use continuation prompt"
    );
    assert!(
        prompt_lines[0].contains("\"threadId\":\"thread-multi-1\"")
            && prompt_lines[1].contains("\"threadId\":\"thread-multi-1\""),
        "both turns should run on the same thread/session id"
    );

    assert_eq!(
        orchestrator.state().codex_totals.input_tokens,
        24,
        "input tokens should accumulate across turns"
    );
    assert_eq!(
        orchestrator.state().codex_totals.output_tokens,
        14,
        "output tokens should accumulate across turns"
    );
    assert_eq!(
        orchestrator.state().codex_totals.total_tokens,
        38,
        "total tokens should accumulate across turns"
    );

    let remaining = orchestrator
        .state()
        .codex_rate_limits
        .as_ref()
        .and_then(|value| value.data.get("primary"))
        .and_then(|value| value.get("remaining"))
        .and_then(|value| value.as_u64());
    assert_eq!(
        remaining,
        Some(42),
        "latest turn rate-limits payload should be retained"
    );

    assert!(
        orchestrator.state().retry_attempts.contains_key(&issue.id),
        "completed worker attempts should hand off to continuation retry scheduling"
    );
}

#[tokio::test]
async fn test_execute_worker_attempt_stops_when_issue_turns_terminal_after_first_turn() {
    let mut server = Server::new_async().await;
    let issue = issue("issue-done", "SIM-DONE", "In Progress", Some(1), 0);

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "Done",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_two_successful_turns(&prompt_log),
    );

    let mut orchestrator = Orchestrator::new(
        make_worker_config(&server, &script, workspace_root.path(), 2),
        String::new(),
    );

    let result = orchestrator
        .execute_worker_attempt(
            &issue,
            "First prompt {{ issue.identifier }}",
            Some(1),
            |_query, _vars| async { Ok(serde_json::json!({ "data": {} })) },
        )
        .await;

    assert!(
        result.is_ok(),
        "worker should stop cleanly when tracker state becomes terminal"
    );

    let prompt_lines: Vec<String> = std::fs::read_to_string(&prompt_log)
        .expect("prompt log should exist")
        .lines()
        .map(|line| line.to_string())
        .collect();
    assert_eq!(
        prompt_lines.len(),
        1,
        "terminal issue state after turn 1 should prevent turn 2"
    );
    assert!(
        !orchestrator.state().retry_attempts.contains_key(&issue.id),
        "terminal stop should not enqueue continuation retry"
    );
}

#[tokio::test]
async fn test_execute_worker_attempt_preserves_last_non_null_rate_limits() {
    let mut server = Server::new_async().await;
    let issue = issue("issue-rate-limits", "SIM-RATE", "In Progress", Some(1), 0);

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "In Progress",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_second_turn_omits_rate_limits(&prompt_log),
    );

    let mut orchestrator = Orchestrator::new(
        make_worker_config(&server, &script, workspace_root.path(), 2),
        String::new(),
    );

    let result = orchestrator
        .execute_worker_attempt(
            &issue,
            "First prompt {{ issue.identifier }}",
            Some(1),
            |_query, _vars| async { Ok(serde_json::json!({ "data": {} })) },
        )
        .await;

    assert!(
        result.is_ok(),
        "worker attempt should complete successfully"
    );

    let remaining = orchestrator
        .state()
        .codex_rate_limits
        .as_ref()
        .and_then(|value| value.data.get("primary"))
        .and_then(|value| value.get("remaining"))
        .and_then(|value| value.as_u64());
    assert_eq!(
        remaining,
        Some(99),
        "later turns that omit rate limits should not clear prior payload"
    );
}

#[tokio::test]
async fn test_execute_worker_attempt_failure_on_turn_two_keeps_turn_one_metrics() {
    let mut server = Server::new_async().await;
    let issue = issue("issue-fail2", "SIM-FAIL2", "In Progress", Some(1), 0);

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "In Progress",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_second_turn_fails(&prompt_log),
    );

    let mut orchestrator = Orchestrator::new(
        make_worker_config(&server, &script, workspace_root.path(), 5),
        String::new(),
    );

    let result = orchestrator
        .execute_worker_attempt(
            &issue,
            "First prompt {{ issue.identifier }}",
            Some(1),
            |_query, _vars| async { Ok(serde_json::json!({ "data": {} })) },
        )
        .await;

    assert!(
        result.is_err(),
        "turn failure on turn 2 should propagate as worker failure"
    );

    assert_eq!(
        orchestrator.state().codex_totals.input_tokens,
        7,
        "turn 1 metrics should still be applied before turn 2 failure"
    );
    assert_eq!(
        orchestrator.state().codex_totals.output_tokens,
        3,
        "turn 1 metrics should still be applied before turn 2 failure"
    );
    assert_eq!(
        orchestrator.state().codex_totals.total_tokens,
        10,
        "turn 1 metrics should still be applied before turn 2 failure"
    );

    let retry_entry = orchestrator
        .state()
        .retry_attempts
        .get(&issue.id)
        .expect("failed worker attempt should schedule failure retry");
    assert_eq!(
        retry_entry.attempt, 2,
        "failure retry attempt should increment from the running attempt"
    );
}

#[tokio::test]
async fn test_execute_worker_attempt_stops_when_issue_leaves_active_state_after_first_turn() {
    let mut server = Server::new_async().await;
    let issue = issue(
        "issue-non-active",
        "SIM-NONACTIVE",
        "In Progress",
        Some(1),
        0,
    );

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "Human Review",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_two_successful_turns(&prompt_log),
    );

    let mut orchestrator = Orchestrator::new(
        make_worker_config(&server, &script, workspace_root.path(), 5),
        String::new(),
    );

    let result = orchestrator
        .execute_worker_attempt(
            &issue,
            "First prompt {{ issue.identifier }}",
            Some(1),
            |_query, _vars| async { Ok(serde_json::json!({ "data": {} })) },
        )
        .await;

    assert!(
        result.is_ok(),
        "worker should stop cleanly once issue leaves active states"
    );

    let prompt_lines: Vec<String> = std::fs::read_to_string(&prompt_log)
        .expect("prompt log should exist")
        .lines()
        .map(|line| line.to_string())
        .collect();
    assert_eq!(
        prompt_lines.len(),
        1,
        "non-active issue state after turn 1 should prevent turn 2"
    );
    assert!(
        !orchestrator.state().retry_attempts.contains_key(&issue.id),
        "non-active stop should not enqueue continuation retry"
    );
}

#[tokio::test]
async fn test_execute_worker_attempt_stops_when_issue_unassigned_between_turns() {
    let mut server = Server::new_async().await;
    let issue = issue(
        "issue-unassigned",
        "SIM-UNASSIGNED",
        "In Progress",
        Some(1),
        0,
    );

    let _state_lookup = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            serde_json::to_string(&state_lookup_response(
                &issue.id,
                &issue.identifier,
                "In Progress",
                None,
            ))
            .expect("state response should serialize"),
        )
        .expect(1)
        .create_async()
        .await;

    let scripts_dir = tempdir().expect("scripts dir should be created");
    let workspace_root = tempdir().expect("workspace root should be created");
    let prompt_log = scripts_dir.path().join("prompts.log");
    let script = write_script(
        scripts_dir.path(),
        "codex.sh",
        &script_two_successful_turns(&prompt_log),
    );

    let mut config = make_worker_config(&server, &script, workspace_root.path(), 5);
    config.tracker.assignee = Some("00000000-0000-0000-0000-000000000001".to_string());

    let mut orchestrator = Orchestrator::new(config, String::new());

    let result = orchestrator
        .execute_worker_attempt(
            &issue,
            "First prompt {{ issue.identifier }}",
            Some(1),
            |_query, _vars| async { Ok(serde_json::json!({ "data": {} })) },
        )
        .await;

    assert!(
        result.is_ok(),
        "worker should stop cleanly once issue is no longer assigned to this worker"
    );

    let prompt_lines: Vec<String> = std::fs::read_to_string(&prompt_log)
        .expect("prompt log should exist")
        .lines()
        .map(|line| line.to_string())
        .collect();
    assert_eq!(
        prompt_lines.len(),
        1,
        "unassigned issue after turn 1 should prevent turn 2"
    );
    assert!(
        !orchestrator.state().retry_attempts.contains_key(&issue.id),
        "unassigned stop should not enqueue continuation retry"
    );
}

// ── T01: Generalized blocker + circular dependency tests ──────────────

#[test]
fn test_blocked_issue_in_progress_not_dispatched() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let mut blocked = issue("issue-blocked", "SIM-50", "In Progress", Some(1), 0);
    blocked.blocked_by.push(BlockerRef {
        id: Some("issue-blocker".to_string()),
        identifier: Some("SIM-49".to_string()),
        state: Some("In Progress".to_string()),
    });

    let unblocked = issue("issue-ok", "SIM-51", "Todo", Some(2), 0);

    let mut port = FakePort {
        candidate_issues: vec![blocked.clone(), unblocked.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![unblocked.id],
        "In Progress issue with non-terminal blocker must not dispatch"
    );
}

#[test]
fn test_blocked_issue_with_terminal_blocker_dispatched() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let mut candidate = issue("issue-unblocked", "SIM-52", "Todo", Some(1), 0);
    candidate.blocked_by.push(BlockerRef {
        id: Some("issue-done".to_string()),
        identifier: Some("SIM-48".to_string()),
        state: Some("Done".to_string()),
    });

    let mut port = FakePort {
        candidate_issues: vec![candidate.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![candidate.id],
        "issue with terminal blocker should dispatch normally"
    );
}

#[test]
fn test_blocked_issue_in_agent_review_not_dispatched() {
    let mut config = test_config(2);
    config
        .tracker
        .active_states
        .push("Agent Review".to_string());
    let mut orchestrator = Orchestrator::new(config, String::new());

    let mut blocked = issue("issue-ar", "SIM-53", "Agent Review", Some(1), 0);
    blocked.blocked_by.push(BlockerRef {
        id: Some("issue-dep".to_string()),
        identifier: Some("SIM-47".to_string()),
        state: Some("Todo".to_string()),
    });

    let mut port = FakePort {
        candidate_issues: vec![blocked.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert!(
        tick.dispatched_issue_ids.is_empty(),
        "Agent Review issue with non-terminal blocker must not dispatch"
    );
}

#[test]
fn test_circular_dependency_blocks_both_issues() {
    let mut orchestrator = Orchestrator::new(test_config(5), String::new());

    let mut issue_a = issue("issue-a", "SIM-60", "Todo", Some(1), 0);
    issue_a.blocked_by.push(BlockerRef {
        id: Some("issue-b".to_string()),
        identifier: Some("SIM-61".to_string()),
        state: Some("Todo".to_string()),
    });

    let mut issue_b = issue("issue-b", "SIM-61", "Todo", Some(1), 0);
    issue_b.blocked_by.push(BlockerRef {
        id: Some("issue-a".to_string()),
        identifier: Some("SIM-60".to_string()),
        state: Some("Todo".to_string()),
    });

    let mut port = FakePort {
        candidate_issues: vec![issue_a.clone(), issue_b.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert!(
        tick.dispatched_issue_ids.is_empty(),
        "circular dependency: neither issue should dispatch"
    );
}

#[test]
fn test_cross_project_unknown_blocker_treated_as_non_blocking() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let mut candidate = issue("issue-cross", "SIM-70", "Todo", Some(1), 0);
    candidate.blocked_by.push(BlockerRef {
        id: Some("ext-issue".to_string()),
        identifier: Some("EXT-99".to_string()),
        state: None, // cross-project, unknown state
    });

    let mut port = FakePort {
        candidate_issues: vec![candidate.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![candidate.id],
        "cross-project blocker with unknown state should be treated as non-blocking"
    );
}

#[test]
fn test_unblocked_issue_dispatches_normally() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());
    let candidate = issue("issue-free", "SIM-80", "Todo", Some(1), 0);

    let mut port = FakePort {
        candidate_issues: vec![candidate.clone()],
        ..FakePort::default()
    };

    let tick = orchestrator.tick(&mut port).expect("tick should succeed");
    assert_eq!(
        tick.dispatched_issue_ids,
        vec![candidate.id],
        "issue with no blockers should dispatch normally"
    );
}

#[test]
fn test_snapshot_includes_blocked_issues() {
    let mut orchestrator = Orchestrator::new(test_config(2), String::new());

    let mut blocked = issue("issue-snap-blocked", "SIM-90", "Todo", Some(1), 0);
    blocked.blocked_by.push(BlockerRef {
        id: Some("issue-snap-blocker".to_string()),
        identifier: Some("SIM-89".to_string()),
        state: Some("In Progress".to_string()),
    });

    let mut port = FakePort {
        candidate_issues: vec![blocked.clone()],
        ..FakePort::default()
    };

    orchestrator.tick(&mut port).expect("tick should succeed");
    let snapshot = orchestrator.snapshot(chrono::Utc::now().timestamp_millis());

    assert_eq!(
        snapshot.blocked.len(),
        1,
        "snapshot should have 1 blocked entry"
    );
    assert_eq!(snapshot.blocked[0].identifier, "SIM-90");
    assert_eq!(snapshot.blocked[0].blocker_identifiers, vec!["SIM-89"]);
}
