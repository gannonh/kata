use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use chrono::Utc;

use crate::domain::{EventKind, EventSeverity, SymphonyEventEnvelope};

const DEFAULT_EVENT_HUB_CAPACITY: usize = 512;

#[derive(Clone)]
pub struct EventHub {
    sender: tokio::sync::broadcast::Sender<SymphonyEventEnvelope>,
    next_sequence: Arc<AtomicU64>,
}

impl EventHub {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = tokio::sync::broadcast::channel(capacity.max(1));
        Self {
            sender,
            next_sequence: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn default_hub() -> Self {
        Self::new(DEFAULT_EVENT_HUB_CAPACITY)
    }

    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<SymphonyEventEnvelope> {
        self.sender.subscribe()
    }

    pub fn next_sequence(&self) -> u64 {
        self.next_sequence.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn send(&self, envelope: SymphonyEventEnvelope) {
        let _ = self.sender.send(envelope);
    }

    pub fn publish(
        &self,
        kind: EventKind,
        severity: EventSeverity,
        issue: Option<String>,
        event: impl Into<String>,
        payload: serde_json::Value,
    ) -> SymphonyEventEnvelope {
        let envelope = SymphonyEventEnvelope::new(
            self.next_sequence(),
            Utc::now(),
            kind,
            severity,
            issue,
            event,
            payload,
        );
        self.send(envelope.clone());
        envelope
    }
}
