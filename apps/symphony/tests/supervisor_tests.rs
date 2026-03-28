use std::time::Duration;

use chrono::Utc;
use serde_json::json;
use symphony::config::from_workflow;
use symphony::domain::{
    ContextScope, EventKind, EventSeverity, SupervisorConfig, SupervisorStatus,
    SymphonyEventEnvelope, SYMPHONY_EVENT_STREAM_VERSION,
};
use symphony::event_stream::EventHub;
use symphony::orchestrator::EscalationRegistry;
use symphony::shared_context::{ContextEntryDraft, SharedContextStore};
use symphony::supervisor::{SupervisorAgent, SupervisorDependencies};

fn envelope(issue: &str, event: &str, summary: &str) -> SymphonyEventEnvelope {
    envelope_with_kind(issue, event, summary, EventKind::Worker)
}

fn envelope_with_kind(
    issue: &str,
    event: &str,
    summary: &str,
    kind: EventKind,
) -> SymphonyEventEnvelope {
    envelope_with_payload(issue, event, json!({ "summary": summary }), kind)
}

fn envelope_with_payload(
    issue: &str,
    event: &str,
    payload: serde_json::Value,
    kind: EventKind,
) -> SymphonyEventEnvelope {
    SymphonyEventEnvelope {
        version: SYMPHONY_EVENT_STREAM_VERSION.to_string(),
        sequence: 1,
        timestamp: Utc::now(),
        kind,
        severity: EventSeverity::Info,
        issue: Some(issue.to_string()),
        event: event.to_string(),
        payload,
    }
}

fn make_supervisor(
    config: SupervisorConfig,
) -> (
    SupervisorAgent,
    EventHub,
    SharedContextStore,
    EscalationRegistry,
) {
    let hub = EventHub::new(64);
    let shared_context_store = SharedContextStore::default();
    let escalation_registry = EscalationRegistry::default();
    let deps = SupervisorDependencies::new(
        hub.clone(),
        shared_context_store.clone(),
        escalation_registry.clone(),
    );
    (
        SupervisorAgent::new(config, deps),
        hub,
        shared_context_store,
        escalation_registry,
    )
}

async fn wait_for_active(supervisor: &SupervisorAgent) {
    for _ in 0..50 {
        if supervisor.snapshot().status == SupervisorStatus::Active {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    panic!(
        "supervisor did not become active, last snapshot={:?}",
        supervisor.snapshot()
    );
}

async fn recv_event_with_name(
    rx: &mut tokio::sync::broadcast::Receiver<SymphonyEventEnvelope>,
    event_name: &str,
    timeout: Duration,
) -> SymphonyEventEnvelope {
    tokio::time::timeout(timeout, async {
        loop {
            let envelope = rx.recv().await.expect("event should be readable");
            if envelope.event == event_name {
                break envelope;
            }
        }
    })
    .await
    .expect("expected event before timeout")
}

mod lifecycle {
    use super::*;

    #[test]
    fn config_defaults_supervisor_disabled() {
        let raw = serde_yaml::from_str::<serde_yaml::Value>("tracker: { kind: linear }")
            .expect("yaml fixture should parse");
        let config = from_workflow(&raw).expect("workflow config should parse");

        assert!(!config.supervisor.enabled);
        assert!(config.supervisor.model.is_none());
        assert_eq!(config.supervisor.steer_cooldown_ms, 120_000);
    }

    #[tokio::test]
    async fn supervisor_starts_processes_event_and_stops() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: Some("anthropic/claude-sonnet-4-6".to_string()),
            steer_cooldown_ms: 120_000,
        });

        supervisor
            .start()
            .expect("supervisor should start inside tokio runtime");
        wait_for_active(&supervisor).await;

        hub.send(envelope("KAT-1327", "worker_started", "worker started"));

        tokio::time::sleep(Duration::from_millis(25)).await;

        let snapshot = supervisor.snapshot();
        assert!(
            snapshot
                .last_decision
                .as_deref()
                .unwrap_or_default()
                .contains("observed:worker_started"),
            "expected observed worker event in snapshot, got {:?}",
            snapshot.last_decision
        );

        supervisor.stop().await;
        assert_eq!(supervisor.snapshot().status, SupervisorStatus::Stopped);
    }

    #[test]
    fn disabled_supervisor_start_is_noop() {
        let (mut supervisor, _hub, _store, _registry) =
            make_supervisor(SupervisorConfig::default());

        supervisor
            .start()
            .expect("disabled supervisor start should be a no-op");

        let snapshot = supervisor.snapshot();
        assert_eq!(snapshot.status, SupervisorStatus::Disabled);
        assert!(!supervisor.is_running());
    }
}

mod stuck_worker {
    use super::*;

    const NO_PROGRESS_EVENT_THRESHOLD_FOR_TEST: usize = 5;

    #[tokio::test]
    async fn repeated_tool_error_triggers_supervisor_steer() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope("KAT-2001", "tool_error", "bash cargo test --all"));
        hub.send(envelope("KAT-2001", "tool_error", "bash cargo test --all"));
        hub.send(envelope("KAT-2001", "tool_error", "bash cargo test --all"));

        let steer_event =
            recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;

        assert_eq!(steer_event.kind, EventKind::SupervisorSteer);
        assert_eq!(steer_event.payload["reason"], "repeated_tool_error");

        let snapshot = supervisor.snapshot();
        assert_eq!(snapshot.steers_issued, 1);

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn no_progress_triggers_supervisor_steer() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        for _ in 0..NO_PROGRESS_EVENT_THRESHOLD_FOR_TEST {
            hub.send(envelope("KAT-2002", "worker_progress", "thinking"));
        }

        let steer_event =
            recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;
        assert_eq!(steer_event.payload["reason"], "no_progress");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn read_only_tool_activity_counts_as_no_progress() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        for _ in 0..NO_PROGRESS_EVENT_THRESHOLD_FOR_TEST {
            hub.send(envelope(
                "KAT-2003",
                "tool_start",
                "read {\"path\":\"src/auth.rs\"}",
            ));
        }

        let steer_event =
            recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;
        assert_eq!(steer_event.payload["reason"], "no_progress");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn repeated_test_failure_triggers_supervisor_steer() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-2003",
            "turn_failed",
            "test auth_flow failed: expected 200 got 401",
        ));
        hub.send(envelope(
            "KAT-2003",
            "turn_failed",
            "test auth_flow failed: expected 200 got 401",
        ));

        let steer_event =
            recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;
        assert_eq!(steer_event.payload["reason"], "repeated_test_failure");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn cooldown_prevents_rapid_resteer() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 300_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        for _ in 0..3 {
            hub.send(envelope("KAT-2004", "tool_error", "bash cargo test"));
        }

        let _first =
            recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;

        for _ in 0..3 {
            hub.send(envelope("KAT-2004", "tool_error", "bash cargo test"));
        }

        let second = tokio::time::timeout(Duration::from_millis(250), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if envelope.event == "supervisor_steer" {
                    return envelope;
                }
            }
        })
        .await;

        assert!(
            second.is_err(),
            "cooldown should suppress rapid second steer, got {:?}",
            second
        );

        assert_eq!(supervisor.snapshot().steers_issued, 1);
        supervisor.stop().await;
    }

    #[tokio::test]
    async fn mixed_non_stuck_events_do_not_trigger_steer() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-2005",
            "tool_start",
            "edit {\"path\":\"src/lib.rs\"}",
        ));
        hub.send(envelope("KAT-2005", "tool_end", "edit"));
        hub.send(envelope("KAT-2005", "worker_progress", "planning"));
        hub.send(envelope("KAT-2005", "worker_progress", "running"));

        let steer = tokio::time::timeout(Duration::from_millis(250), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if envelope.event == "supervisor_steer" {
                    return envelope;
                }
            }
        })
        .await;

        assert!(steer.is_err(), "did not expect a steer event");
        assert_eq!(supervisor.snapshot().steers_issued, 0);

        supervisor.stop().await;
    }
}

mod conflict_detection {
    use super::*;

    #[tokio::test]
    async fn overlapping_file_edits_emit_conflict_and_context_entry() {
        let (mut supervisor, hub, store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-3001",
            "tool_start",
            "edit {\"path\":\"src/auth.rs\"}",
        ));
        hub.send(envelope(
            "KAT-3002",
            "tool_start",
            "edit {\"path\":\"src/auth.rs\"}",
        ));

        let conflict_event = recv_event_with_name(
            &mut rx,
            "supervisor_conflict_detected",
            Duration::from_secs(1),
        )
        .await;

        assert_eq!(conflict_event.kind, EventKind::SupervisorConflictDetected);
        assert_eq!(conflict_event.payload["conflict_type"], "file_overlap");

        let context_entries = store.list();
        assert!(
            context_entries
                .iter()
                .any(|entry| entry.author_issue == "SUPERVISOR"
                    && entry.content.contains("src/auth.rs")
                    && entry.content.contains("KAT-3001")
                    && entry.content.contains("KAT-3002")),
            "expected supervisor coordination context entry, got {context_entries:?}"
        );

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn conflicting_entries_from_same_issue_do_not_trigger_conflict() {
        let (mut supervisor, hub, store, registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-3100".to_string(),
            scope: ContextScope::Project,
            content: "Decision: use jsonwebtoken for auth".to_string(),
            ttl_ms: Some(60_000),
        });
        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-3100".to_string(),
            scope: ContextScope::Project,
            content: "Decision: use paseto for auth".to_string(),
            ttl_ms: Some(60_000),
        });

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope_with_kind(
            "KAT-3100",
            "shared_context_written",
            "shared context updated",
            EventKind::SharedContextWritten,
        ));

        let conflict_or_escalation = tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if matches!(
                    envelope.event.as_str(),
                    "supervisor_conflict_detected" | "supervisor_escalated"
                ) {
                    return envelope;
                }
            }
        })
        .await;

        assert!(
            conflict_or_escalation.is_err(),
            "unexpected conflict/escalation event: {conflict_or_escalation:?}"
        );
        assert!(
            registry.pending_snapshot().is_empty(),
            "same-issue revisions should not create escalations"
        );

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn contradictory_context_entries_trigger_escalation() {
        let (mut supervisor, hub, store, registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-3101".to_string(),
            scope: ContextScope::Project,
            content: "Decision: use jsonwebtoken for auth".to_string(),
            ttl_ms: Some(60_000),
        });
        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-3102".to_string(),
            scope: ContextScope::Project,
            content: "Decision: use paseto for auth".to_string(),
            ttl_ms: Some(60_000),
        });

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope_with_payload(
            "KAT-3101",
            "worker_failed",
            json!({
                "summary": "worker failed",
                "issue_id": "issue-3101"
            }),
            EventKind::Worker,
        ));
        hub.send(envelope_with_payload(
            "KAT-3102",
            "worker_failed",
            json!({
                "summary": "worker failed",
                "issue_id": "issue-3102"
            }),
            EventKind::Worker,
        ));

        hub.send(envelope_with_kind(
            "KAT-3102",
            "shared_context_written",
            "shared context updated",
            EventKind::SharedContextWritten,
        ));

        let escalated =
            recv_event_with_name(&mut rx, "supervisor_escalated", Duration::from_secs(1)).await;
        assert_eq!(escalated.kind, EventKind::SupervisorEscalated);

        let pending = registry.pending_snapshot();
        assert_eq!(pending.len(), 1, "expected one pending escalation");
        assert!(
            pending[0].issue_identifier == "KAT-3101" || pending[0].issue_identifier == "KAT-3102",
            "expected escalation to reference one of the conflicting issues, got {:?}",
            pending[0].issue_identifier
        );
        assert!(
            pending[0].issue_id == "issue-3101" || pending[0].issue_id == "issue-3102",
            "expected escalation to carry canonical issue id, got {:?}",
            pending[0].issue_id
        );

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn overlapping_read_only_activity_does_not_emit_conflict() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-3200",
            "tool_start",
            "read {\"path\":\"src/shared.rs\"}",
        ));
        hub.send(envelope(
            "KAT-3201",
            "tool_start",
            "read {\"path\":\"src/shared.rs\"}",
        ));

        let conflict = tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if envelope.event == "supervisor_conflict_detected" {
                    return envelope;
                }
            }
        })
        .await;

        assert!(conflict.is_err(), "unexpected conflict event: {conflict:?}");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn non_overlapping_file_edits_do_not_emit_conflict() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-3201",
            "tool_start",
            "edit {\"path\":\"src/a.rs\"}",
        ));
        hub.send(envelope(
            "KAT-3202",
            "tool_start",
            "edit {\"path\":\"src/b.rs\"}",
        ));

        let conflict = tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if envelope.event == "supervisor_conflict_detected" {
                    return envelope;
                }
            }
        })
        .await;

        assert!(conflict.is_err(), "unexpected conflict event: {conflict:?}");
        assert_eq!(supervisor.snapshot().conflicts_detected, 0);

        supervisor.stop().await;
    }
}

mod failure_pattern {
    use super::*;

    #[tokio::test]
    async fn shared_error_across_workers_emits_pattern_event_and_warning() {
        let (mut supervisor, hub, store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-4001",
            "turn_failed",
            "cargo test failed: unresolved import crate::auth",
        ));
        hub.send(envelope(
            "KAT-4002",
            "turn_failed",
            "cargo test failed: unresolved import crate::auth",
        ));

        let pattern_event = recv_event_with_name(
            &mut rx,
            "supervisor_pattern_detected",
            Duration::from_secs(1),
        )
        .await;

        assert_eq!(pattern_event.kind, EventKind::SupervisorPatternDetected);
        assert_eq!(
            pattern_event.payload["pattern_type"],
            "shared_error_signature"
        );

        let warnings = store
            .list()
            .into_iter()
            .filter(|entry| entry.author_issue == "SUPERVISOR")
            .filter(|entry| entry.content.contains("Systemic failure pattern"))
            .count();
        assert!(warnings >= 1, "expected supervisor systemic warning entry");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn persistent_pattern_escalates_after_repeat_signal() {
        let (mut supervisor, hub, _store, registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-4101",
            "turn_failed",
            "cargo test failed: missing dependency serde_json",
        ));
        hub.send(envelope(
            "KAT-4102",
            "turn_failed",
            "cargo test failed: missing dependency serde_json",
        ));

        let _pattern_event = recv_event_with_name(
            &mut rx,
            "supervisor_pattern_detected",
            Duration::from_secs(1),
        )
        .await;

        hub.send(envelope(
            "KAT-4101",
            "turn_failed",
            "cargo test failed: missing dependency serde_json",
        ));

        let escalated =
            recv_event_with_name(&mut rx, "supervisor_escalated", Duration::from_secs(1)).await;
        assert_eq!(escalated.kind, EventKind::SupervisorEscalated);

        let pending = registry.pending_snapshot();
        assert_eq!(pending.len(), 1, "expected one pending escalation");

        supervisor.stop().await;
    }

    #[tokio::test]
    async fn distinct_errors_do_not_emit_pattern_event() {
        let (mut supervisor, hub, _store, _registry) = make_supervisor(SupervisorConfig {
            enabled: true,
            model: None,
            steer_cooldown_ms: 120_000,
        });
        let mut rx = hub.subscribe();

        supervisor.start().expect("supervisor should start");
        wait_for_active(&supervisor).await;

        hub.send(envelope(
            "KAT-4201",
            "turn_failed",
            "cargo test failed: unresolved import crate::alpha",
        ));
        hub.send(envelope(
            "KAT-4202",
            "turn_failed",
            "cargo test failed: unresolved import crate::beta",
        ));

        let pattern = tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                let envelope = rx.recv().await.expect("event should be readable");
                if envelope.event == "supervisor_pattern_detected" {
                    return envelope;
                }
            }
        })
        .await;

        assert!(pattern.is_err(), "unexpected pattern event: {pattern:?}");

        supervisor.stop().await;
    }
}

mod integration {
    use super::*;
    use symphony::domain::ServiceConfig;
    use symphony::orchestrator::Orchestrator;

    async fn wait_for_status(orchestrator: &Orchestrator, expected: SupervisorStatus) {
        for _ in 0..50 {
            if orchestrator
                .snapshot(Utc::now().timestamp_millis())
                .supervisor
                .status
                == expected
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        panic!(
            "supervisor did not reach status {:?}, last snapshot={:?}",
            expected,
            orchestrator
                .snapshot(Utc::now().timestamp_millis())
                .supervisor
        );
    }

    #[tokio::test]
    async fn orchestrator_lifecycle_starts_supervisor_and_exposes_snapshot_stats() {
        let mut config = ServiceConfig::default();
        config.supervisor = SupervisorConfig {
            enabled: true,
            model: Some("anthropic/claude-sonnet-4-6".to_string()),
            steer_cooldown_ms: 120_000,
        };

        let mut orchestrator = Orchestrator::new(config, "prompt".to_string());
        let hub = orchestrator.create_event_hub();
        let mut rx = hub.subscribe();

        orchestrator
            .ensure_supervisor_running()
            .expect("orchestrator should start supervisor");
        assert!(
            orchestrator.supervisor_is_running(),
            "supervisor should report running after start"
        );

        wait_for_status(&orchestrator, SupervisorStatus::Active).await;

        hub.send(envelope("KAT-5001", "tool_error", "bash cargo test --all"));
        hub.send(envelope("KAT-5001", "tool_error", "bash cargo test --all"));
        hub.send(envelope("KAT-5001", "tool_error", "bash cargo test --all"));

        let steer = recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;
        assert_eq!(steer.kind, EventKind::SupervisorSteer);

        let live_snapshot = orchestrator.snapshot(Utc::now().timestamp_millis());
        assert_eq!(live_snapshot.supervisor.status, SupervisorStatus::Active);
        assert_eq!(live_snapshot.supervisor.steers_issued, 1);

        orchestrator.shutdown_supervisor().await;
        assert!(
            !orchestrator.supervisor_is_running(),
            "supervisor should stop after orchestrator shutdown hook"
        );

        let stopped_snapshot = orchestrator.snapshot(Utc::now().timestamp_millis());
        assert_eq!(
            stopped_snapshot.supervisor.status,
            SupervisorStatus::Stopped
        );
    }
}
