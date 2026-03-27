use std::time::Duration;

use chrono::Utc;
use serde_json::json;
use symphony::config::from_workflow;
use symphony::domain::{
    EventKind, EventSeverity, SupervisorConfig, SupervisorStatus, SymphonyEventEnvelope,
    SYMPHONY_EVENT_STREAM_VERSION,
};
use symphony::event_stream::EventHub;
use symphony::orchestrator::EscalationRegistry;
use symphony::shared_context::SharedContextStore;
use symphony::supervisor::{SupervisorAgent, SupervisorDependencies};

fn envelope(issue: &str, event: &str, summary: &str) -> SymphonyEventEnvelope {
    SymphonyEventEnvelope {
        version: SYMPHONY_EVENT_STREAM_VERSION.to_string(),
        sequence: 1,
        timestamp: Utc::now(),
        kind: EventKind::Worker,
        severity: EventSeverity::Info,
        issue: Some(issue.to_string()),
        event: event.to_string(),
        payload: json!({ "summary": summary }),
    }
}

fn make_supervisor(config: SupervisorConfig) -> (SupervisorAgent, EventHub) {
    let hub = EventHub::new(64);
    let deps = SupervisorDependencies::new(
        hub.clone(),
        SharedContextStore::default(),
        EscalationRegistry::default(),
    );
    (SupervisorAgent::new(config, deps), hub)
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
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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
        let (mut supervisor, _hub) = make_supervisor(SupervisorConfig::default());

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

    #[tokio::test]
    async fn repeated_tool_error_triggers_supervisor_steer() {
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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
    async fn repeated_test_failure_triggers_supervisor_steer() {
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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

        let _first = recv_event_with_name(&mut rx, "supervisor_steer", Duration::from_secs(1)).await;

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
        let (mut supervisor, hub) = make_supervisor(SupervisorConfig {
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

    const NO_PROGRESS_EVENT_THRESHOLD_FOR_TEST: usize = 5;
}
