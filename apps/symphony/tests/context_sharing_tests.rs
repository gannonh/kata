use chrono::Duration;
use symphony::domain::ContextScope;
use symphony::shared_context::{
    ContextEntryDraft, SharedContextStore, DEFAULT_SHARED_CONTEXT_TTL_MS,
    MAX_SHARED_CONTEXT_CONTENT_CHARS,
};

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
