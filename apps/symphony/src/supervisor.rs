use std::sync::{Arc, RwLock};
use std::time::Duration;

use chrono::Utc;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::domain::{
    EventKind, EventSeverity, SupervisorConfig, SupervisorSnapshot, SupervisorStatus,
    SymphonyEventEnvelope,
};
use crate::error::{Result, SymphonyError};
use crate::event_stream::EventHub;
use crate::orchestrator::EscalationRegistry;
use crate::shared_context::SharedContextStore;

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

/// Background supervisor task lifecycle controller.
pub struct SupervisorAgent {
    config: SupervisorConfig,
    deps: SupervisorDependencies,
    snapshot: Arc<RwLock<SupervisorSnapshot>>,
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
            snapshot: Arc::new(RwLock::new(initial_snapshot)),
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
        let snapshot = Arc::clone(&self.snapshot);
        let hub = self.deps.event_hub.clone();
        let config_model = self.config.model.clone();

        self.shutdown_tx = Some(shutdown_tx);
        self.update_snapshot_status(SupervisorStatus::Starting, Some("starting supervisor"));

        let task = tokio::spawn(async move {
            {
                let mut state = snapshot
                    .write()
                    .expect("supervisor snapshot lock poisoned on start");
                state.status = SupervisorStatus::Active;
                state.model = config_model;
                state.last_decision = Some("subscribed_to_event_stream".to_string());
                state.last_action_at = Some(Utc::now());
            }

            hub.publish(
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
                                let mut state = snapshot
                                    .write()
                                    .expect("supervisor snapshot lock poisoned while consuming event stream");
                                state.last_decision = Some(format!("observed:{}", envelope.event));
                                state.last_action_at = Some(Utc::now());
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
                let mut state = snapshot
                    .write()
                    .expect("supervisor snapshot lock poisoned on shutdown");
                state.status = SupervisorStatus::Stopped;
                state.last_decision = Some("stopped".to_string());
                state.last_action_at = Some(Utc::now());
            }

            hub.publish(
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
        self.snapshot
            .read()
            .expect("supervisor snapshot lock poisoned while reading")
            .clone()
    }

    fn update_snapshot_status(&self, status: SupervisorStatus, decision: Option<&str>) {
        let mut snapshot = self
            .snapshot
            .write()
            .expect("supervisor snapshot lock poisoned while updating status");
        snapshot.status = status;
        snapshot.model = self.config.model.clone();
        snapshot.last_decision = decision.map(ToString::to_string);
        snapshot.last_action_at = Some(Utc::now());
    }
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
