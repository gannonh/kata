use std::time::Duration;

use chrono::Utc;
use serde_json::json;
use symphony::config::from_workflow;
use symphony::domain::{
    EventKind, EventSeverity, SupervisorStatus, SymphonyEventEnvelope, SYMPHONY_EVENT_STREAM_VERSION,
};
use symphony::event_stream::EventHub;
use symphony::orchestrator::EscalationRegistry;
use symphony::shared_context::SharedContextStore;
use symphony::supervisor::{SupervisorAgent, SupervisorDependencies};

fn event_envelope(issue: Option<&str>, event: &str) -> SymphonyEventEnvelope {
    SymphonyEventEnvelope {
        version: SYMPHONY_EVENT_STREAM_VERSION.to_string(),
        sequence: 1,
        timestamp: Utc::now(),
        kind: EventKind::Worker,
        severity: EventSeverity::Info,
        issue: issue.map(ToString::to_string),
        event: event.to_string(),
        payload: json!({ "summary": "event" }),
    }
}

#[test]
fn lifecycle_config_defaults_supervisor_disabled() {
    let raw = serde_yaml::from_str::<serde_yaml::Value>("tracker: { kind: linear }")
        .expect("yaml fixture should parse");
    let config = from_workflow(&raw).expect("workflow config should parse");

    assert!(!config.supervisor.enabled);
    assert!(config.supervisor.model.is_none());
    assert_eq!(config.supervisor.steer_cooldown_ms, 120_000);
}

#[tokio::test]
async fn lifecycle_supervisor_starts_processes_event_and_stops() {
    let hub = EventHub::new(32);
    let deps = SupervisorDependencies::new(
        hub.clone(),
        SharedContextStore::default(),
        EscalationRegistry::default(),
    );
    let mut supervisor = SupervisorAgent::new(
        symphony::domain::SupervisorConfig {
            enabled: true,
            model: Some("anthropic/claude-sonnet-4-6".to_string()),
            steer_cooldown_ms: 120_000,
        },
        deps,
    );

    supervisor
        .start()
        .expect("supervisor should start inside tokio runtime");

    for _ in 0..20 {
        if supervisor.snapshot().status == SupervisorStatus::Active {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    assert_eq!(supervisor.snapshot().status, SupervisorStatus::Active);

    hub.send(event_envelope(Some("KAT-1327"), "worker_started"));

    tokio::time::sleep(Duration::from_millis(20)).await;

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
fn lifecycle_disabled_supervisor_noop_start() {
    let hub = EventHub::new(4);
    let deps = SupervisorDependencies::new(
        hub,
        SharedContextStore::default(),
        EscalationRegistry::default(),
    );
    let mut supervisor = SupervisorAgent::new(Default::default(), deps);

    supervisor
        .start()
        .expect("disabled supervisor start should be a no-op");

    let snapshot = supervisor.snapshot();
    assert_eq!(snapshot.status, SupervisorStatus::Disabled);
    assert!(!supervisor.is_running());
}
