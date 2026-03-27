use chrono::Duration;
use std::time::Duration as StdDuration;

use symphony::domain::{AgentConfig, ContextScope, EventKind, Issue, ServiceConfig, TrackerConfig};
use symphony::error::Result;
use symphony::orchestrator::{Orchestrator, OrchestratorPort};
use symphony::shared_context::{
    ContextEntryDraft, SharedContextStore, DEFAULT_SHARED_CONTEXT_TTL_MS,
    MAX_SHARED_CONTEXT_CONTENT_CHARS,
};

#[derive(Default)]
struct NoopPort;

impl OrchestratorPort for NoopPort {
    fn startup_terminal_issues(&mut self, _terminal_states: &[String]) -> Result<Vec<Issue>> {
        Ok(Vec::new())
    }

    fn reconcile_running_issues(&mut self, _running_issue_ids: &[String]) -> Result<Vec<Issue>> {
        Ok(Vec::new())
    }

    fn validate_dispatch_preflight(&mut self, _config: &ServiceConfig) -> Result<()> {
        Ok(())
    }

    fn fetch_candidate_issues(&mut self) -> Result<Vec<Issue>> {
        Ok(Vec::new())
    }

    fn refresh_issue(&mut self, _issue_id: &str) -> Result<Option<Issue>> {
        Ok(None)
    }

    fn update_issue_state(&mut self, _issue_id: &str, _state_name: &str) -> Result<()> {
        Ok(())
    }
}

fn orchestrator_config() -> ServiceConfig {
    let mut config = ServiceConfig::default();
    config.tracker = TrackerConfig {
        kind: Some("linear".to_string()),
        api_key: Some("test-key".into()),
        project_slug: Some("project".to_string()),
        active_states: vec!["Todo".to_string(), "In Progress".to_string()],
        terminal_states: vec!["Done".to_string()],
        ..TrackerConfig::default()
    };
    config.agent = AgentConfig {
        max_concurrent_agents: 1,
        max_turns: 1,
        max_retry_backoff_ms: 60_000,
        escalation_timeout_ms: 300_000,
    };
    config
}

#[test]
fn store_write_and_read_with_scope_filtering() {
    let store = SharedContextStore::new(DEFAULT_SHARED_CONTEXT_TTL_MS, 50);

    let project_entry = store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1323".to_string(),
        scope: ContextScope::Project,
        content: "Decision: use shared store".to_string(),
        ttl_ms: None,
    });

    let label_entry = store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1324".to_string(),
        scope: ContextScope::Label("backend".to_string()),
        content: "Pattern: keep scope labels lowercase".to_string(),
        ttl_ms: None,
    });

    let project_entries = store.read(&[ContextScope::Project]);
    assert_eq!(project_entries.len(), 1);
    assert_eq!(project_entries[0].id, project_entry.id);

    let label_entries = store.read(&[ContextScope::Label("BACKEND".to_string())]);
    assert_eq!(label_entries.len(), 1);
    assert_eq!(label_entries[0].id, label_entry.id);
}

#[test]
fn store_enforces_500_char_content_limit() {
    let store = SharedContextStore::default();
    let oversized = "a".repeat(MAX_SHARED_CONTEXT_CONTENT_CHARS + 100);

    let entry = store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1323".to_string(),
        scope: ContextScope::Project,
        content: oversized,
        ttl_ms: None,
    });

    assert_eq!(
        entry.content.chars().count(),
        MAX_SHARED_CONTEXT_CONTENT_CHARS
    );
}

#[test]
fn store_clear_scope_and_clear_all() {
    let store = SharedContextStore::default();

    store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1323".to_string(),
        scope: ContextScope::Project,
        content: "project decision".to_string(),
        ttl_ms: None,
    });
    store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1324".to_string(),
        scope: ContextScope::Label("ui".to_string()),
        content: "ui decision".to_string(),
        ttl_ms: None,
    });

    let removed = store.clear(Some(&[ContextScope::Label("ui".to_string())]));
    assert_eq!(removed, 1);
    assert_eq!(store.total_entries(), 1);

    let removed_all = store.clear(None);
    assert_eq!(removed_all, 1);
    assert_eq!(store.total_entries(), 0);
}

#[test]
fn store_prune_expired_removes_stale_entries() {
    let store = SharedContextStore::default();

    let stale = store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1323".to_string(),
        scope: ContextScope::Project,
        content: "stale".to_string(),
        ttl_ms: Some(5),
    });

    let fresh = store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1324".to_string(),
        scope: ContextScope::Project,
        content: "fresh".to_string(),
        ttl_ms: Some(60_000),
    });

    let expired = store.prune_expired_entries_at(stale.created_at + Duration::milliseconds(10));

    assert_eq!(expired.len(), 1);
    assert_eq!(expired[0].id, stale.id);

    let remaining = store.read(&[ContextScope::Project]);
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].id, fresh.id);
}

#[test]
fn store_summary_reports_scope_distribution() {
    let store = SharedContextStore::default();

    store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1323".to_string(),
        scope: ContextScope::Project,
        content: "project decision".to_string(),
        ttl_ms: None,
    });
    store.write_entry(ContextEntryDraft {
        author_issue: "KAT-1324".to_string(),
        scope: ContextScope::Label("backend".to_string()),
        content: "backend pattern".to_string(),
        ttl_ms: None,
    });

    let summary = store.summary();
    assert_eq!(summary.total_entries, 2);
    assert_eq!(summary.entries_by_scope.get("project"), Some(&1));
    assert_eq!(summary.entries_by_scope.get("label:backend"), Some(&1));
    assert!(summary.oldest_entry_at.is_some());
    assert!(summary.newest_entry_at.is_some());
}

#[tokio::test]
async fn shared_context_expired_event_emitted_when_orchestrator_prunes() {
    let mut orchestrator = Orchestrator::new(orchestrator_config(), "Prompt".to_string());
    let hub = orchestrator.create_event_hub();
    let mut events = hub.subscribe();

    orchestrator
        .shared_context_store()
        .write_entry(ContextEntryDraft {
            author_issue: "KAT-1323".to_string(),
            scope: ContextScope::Project,
            content: "temporary context".to_string(),
            ttl_ms: Some(1),
        });

    tokio::time::sleep(StdDuration::from_millis(10)).await;

    let mut port = NoopPort;
    orchestrator.tick(&mut port).expect("tick should succeed");

    let expired_event = tokio::time::timeout(StdDuration::from_secs(1), async {
        loop {
            let envelope = events.recv().await.expect("event should decode");
            if envelope.event == "shared_context_expired" {
                break envelope;
            }
        }
    })
    .await
    .expect("shared_context_expired event should be emitted");

    assert_eq!(expired_event.kind, EventKind::SharedContextExpired);
    assert_eq!(expired_event.payload["author_issue"], "KAT-1323");

    let snapshot = orchestrator.snapshot(chrono::Utc::now().timestamp_millis());
    assert_eq!(snapshot.shared_context.total_entries, 0);
}
