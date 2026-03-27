use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use chrono::{DateTime, Utc};

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
        self.publish_with_timestamp(kind, severity, issue, event, payload, Utc::now())
    }

    pub fn publish_with_timestamp(
        &self,
        kind: EventKind,
        severity: EventSeverity,
        issue: Option<String>,
        event: impl Into<String>,
        payload: serde_json::Value,
        timestamp: DateTime<Utc>,
    ) -> SymphonyEventEnvelope {
        let envelope = SymphonyEventEnvelope::new(
            self.next_sequence(),
            timestamp,
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use chrono::Utc;
    use serde_json::json;

    use super::*;

    #[test]
    fn next_sequence_is_shared_across_clones() {
        let hub = EventHub::new(8);
        let clone = hub.clone();

        assert_eq!(hub.next_sequence(), 1);
        assert_eq!(clone.next_sequence(), 2);
        assert_eq!(hub.next_sequence(), 3);
    }

    #[tokio::test]
    async fn publish_subscribe_round_trip() {
        let hub = EventHub::new(8);
        let mut rx = hub.subscribe();
        let timestamp = Utc::now();

        let sent = hub.publish_with_timestamp(
            EventKind::Worker,
            EventSeverity::Info,
            Some("KAT-123".to_string()),
            "worker_started",
            json!({ "attempt": 1 }),
            timestamp,
        );

        let received = tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("receiver should get published envelope before timeout")
            .expect("published envelope should decode from channel");

        assert_eq!(received.sequence, sent.sequence);
        assert_eq!(received.version, sent.version);
        assert_eq!(received.kind, sent.kind);
        assert_eq!(received.severity, sent.severity);
        assert_eq!(received.timestamp, timestamp);
        assert_eq!(received.issue.as_deref(), Some("KAT-123"));
        assert_eq!(received.event, "worker_started");
        assert_eq!(received.payload, json!({ "attempt": 1 }));
    }

    #[tokio::test]
    async fn zero_capacity_hub_is_clamped_and_operational() {
        let hub = EventHub::new(0);
        let mut rx = hub.subscribe();

        let sent = hub.publish(
            EventKind::Runtime,
            EventSeverity::Debug,
            None,
            "refresh_requested",
            json!({}),
        );

        let received = tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("receiver should get envelope from clamped-capacity hub")
            .expect("envelope should decode");

        assert_eq!(received.sequence, sent.sequence);
        assert_eq!(received.version, sent.version);
        assert_eq!(received.kind, sent.kind);
        assert_eq!(received.severity, sent.severity);
        assert_eq!(received.sequence, 1);
    }
}
