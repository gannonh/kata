use std::collections::{BTreeMap, HashSet};
use std::sync::{Arc, RwLock};

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::{ContextEntry, ContextScope, SharedContextSummary};

pub const DEFAULT_SHARED_CONTEXT_TTL_MS: u64 = 86_400_000;
pub const DEFAULT_SHARED_CONTEXT_MAX_ENTRIES: usize = 100;
pub const MAX_SHARED_CONTEXT_CONTENT_CHARS: usize = 500;

#[derive(Debug, Clone, Copy)]
struct SharedContextSettings {
    default_ttl_ms: u64,
    max_entries: usize,
}

#[derive(Debug, Clone)]
pub struct SharedContextStore {
    entries: Arc<RwLock<Vec<ContextEntry>>>,
    settings: Arc<RwLock<SharedContextSettings>>,
}

#[derive(Debug, Clone)]
pub struct ContextEntryDraft {
    pub author_issue: String,
    pub scope: ContextScope,
    pub content: String,
    pub ttl_ms: Option<u64>,
}

impl Default for SharedContextStore {
    fn default() -> Self {
        Self::new(
            DEFAULT_SHARED_CONTEXT_TTL_MS,
            DEFAULT_SHARED_CONTEXT_MAX_ENTRIES,
        )
    }
}

impl SharedContextStore {
    pub fn new(default_ttl_ms: u64, max_entries: usize) -> Self {
        Self {
            entries: Arc::new(RwLock::new(Vec::new())),
            settings: Arc::new(RwLock::new(SharedContextSettings {
                default_ttl_ms,
                max_entries: max_entries.max(1),
            })),
        }
    }

    pub fn update_settings(&self, default_ttl_ms: u64, max_entries: usize) {
        let max_entries = max_entries.max(1);
        {
            let mut settings = self
                .settings
                .write()
                .expect("shared context settings lock poisoned");
            settings.default_ttl_ms = default_ttl_ms;
            settings.max_entries = max_entries;
        }
        let mut entries = self.entries.write().expect("shared context lock poisoned");
        Self::enforce_max_entries(&mut entries, max_entries);
    }

    pub fn write(&self, draft: ContextEntryDraft) -> String {
        self.write_entry(draft).id
    }

    pub fn write_entry(&self, draft: ContextEntryDraft) -> ContextEntry {
        let settings = *self
            .settings
            .read()
            .expect("shared context settings lock poisoned");
        let ttl_ms = draft.ttl_ms.unwrap_or(settings.default_ttl_ms).max(1);
        let max_entries = settings.max_entries;
        let content = truncate_chars(&draft.content, MAX_SHARED_CONTEXT_CONTENT_CHARS);
        let author_issue = draft.author_issue.trim();

        let entry = ContextEntry {
            id: Uuid::new_v4().to_string(),
            author_issue: if author_issue.is_empty() {
                "unknown".to_string()
            } else {
                author_issue.to_string()
            },
            scope: normalize_scope(draft.scope),
            content,
            created_at: Utc::now(),
            ttl_ms,
        };

        let mut entries = self.entries.write().expect("shared context lock poisoned");
        entries.push(entry.clone());
        Self::enforce_max_entries(&mut entries, max_entries);

        entry
    }

    pub fn read(&self, scope_filter: &[ContextScope]) -> Vec<ContextEntry> {
        self.prune_expired();

        let filters: HashSet<ContextScope> =
            scope_filter.iter().cloned().map(normalize_scope).collect();
        let mut entries = self
            .entries
            .read()
            .expect("shared context lock poisoned")
            .clone();
        entries.retain(|entry| {
            filters.is_empty() || filters.contains(&normalize_scope(entry.scope.clone()))
        });
        entries.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| b.id.cmp(&a.id))
        });
        entries
    }

    pub fn list(&self) -> Vec<ContextEntry> {
        self.read(&[])
    }

    pub fn clear(&self, scope_filter: Option<&[ContextScope]>) -> usize {
        let mut entries = self.entries.write().expect("shared context lock poisoned");
        let before = entries.len();

        if let Some(filters) = scope_filter {
            if !filters.is_empty() {
                let filters: HashSet<ContextScope> =
                    filters.iter().cloned().map(normalize_scope).collect();
                entries.retain(|entry| !filters.contains(&normalize_scope(entry.scope.clone())));
            } else {
                entries.clear();
            }
        } else {
            entries.clear();
        }

        before.saturating_sub(entries.len())
    }

    pub fn remove_entry(&self, entry_id: &str) -> Option<ContextEntry> {
        let mut entries = self.entries.write().expect("shared context lock poisoned");
        let index = entries.iter().position(|entry| entry.id == entry_id)?;
        Some(entries.remove(index))
    }

    pub fn prune_expired(&self) -> usize {
        self.prune_expired_entries().len()
    }

    pub fn prune_expired_entries(&self) -> Vec<ContextEntry> {
        self.prune_expired_entries_at(Utc::now())
    }

    pub fn prune_expired_entries_at(&self, now: DateTime<Utc>) -> Vec<ContextEntry> {
        let mut entries = self.entries.write().expect("shared context lock poisoned");
        let mut expired = Vec::new();

        entries.retain(|entry| {
            if is_expired(entry, now) {
                expired.push(entry.clone());
                false
            } else {
                true
            }
        });

        expired
    }

    pub fn total_entries(&self) -> usize {
        self.entries
            .read()
            .expect("shared context lock poisoned")
            .len()
    }

    pub fn summary(&self) -> SharedContextSummary {
        self.prune_expired();
        let entries = self.entries.read().expect("shared context lock poisoned");

        let mut entries_by_scope: BTreeMap<String, usize> = BTreeMap::new();
        let mut oldest_entry_at: Option<DateTime<Utc>> = None;
        let mut newest_entry_at: Option<DateTime<Utc>> = None;

        for entry in entries.iter() {
            *entries_by_scope
                .entry(entry.scope.as_scope_key())
                .or_insert(0usize) += 1;

            oldest_entry_at = match oldest_entry_at {
                Some(current) if current <= entry.created_at => Some(current),
                _ => Some(entry.created_at),
            };

            newest_entry_at = match newest_entry_at {
                Some(current) if current >= entry.created_at => Some(current),
                _ => Some(entry.created_at),
            };
        }

        SharedContextSummary {
            total_entries: entries.len(),
            entries_by_scope,
            oldest_entry_at,
            newest_entry_at,
        }
    }

    fn enforce_max_entries(entries: &mut Vec<ContextEntry>, max_entries: usize) {
        let max_entries = max_entries.max(1);
        if entries.len() <= max_entries {
            return;
        }

        entries.sort_by(|a, b| {
            a.created_at
                .cmp(&b.created_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        let overflow = entries.len().saturating_sub(max_entries);
        entries.drain(0..overflow);
    }
}

fn normalize_scope(scope: ContextScope) -> ContextScope {
    match scope {
        ContextScope::Project => ContextScope::Project,
        ContextScope::Milestone(id) => ContextScope::Milestone(id.trim().to_string()),
        ContextScope::Label(label) => ContextScope::Label(label.trim().to_ascii_lowercase()),
    }
}

pub fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

pub fn is_expired(entry: &ContextEntry, now: DateTime<Utc>) -> bool {
    let age_ms = now
        .signed_duration_since(entry.created_at)
        .num_milliseconds()
        .max(0) as u64;
    age_ms > entry.ttl_ms
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn write_truncates_content_and_read_returns_newest_first() {
        let store = SharedContextStore::new(DEFAULT_SHARED_CONTEXT_TTL_MS, 100);
        let first = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-100".to_string(),
            scope: ContextScope::Project,
            content: "first".to_string(),
            ttl_ms: None,
        });
        let long_content = "x".repeat(MAX_SHARED_CONTEXT_CONTENT_CHARS + 25);
        let second = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-101".to_string(),
            scope: ContextScope::Project,
            content: long_content,
            ttl_ms: None,
        });

        let entries = store.read(&[ContextScope::Project]);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].id, second.id);
        assert_eq!(entries[1].id, first.id);
        assert_eq!(
            entries[0].content.chars().count(),
            MAX_SHARED_CONTEXT_CONTENT_CHARS
        );
    }

    #[test]
    fn clear_filters_by_scope() {
        let store = SharedContextStore::default();
        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-100".to_string(),
            scope: ContextScope::Project,
            content: "project".to_string(),
            ttl_ms: None,
        });
        store.write_entry(ContextEntryDraft {
            author_issue: "KAT-101".to_string(),
            scope: ContextScope::Label("api".to_string()),
            content: "label".to_string(),
            ttl_ms: None,
        });

        let removed = store.clear(Some(&[ContextScope::Label("api".to_string())]));
        assert_eq!(removed, 1);
        assert_eq!(store.total_entries(), 1);

        let removed_all = store.clear(None);
        assert_eq!(removed_all, 1);
        assert_eq!(store.total_entries(), 0);
    }

    #[test]
    fn prune_expired_entries_removes_stale_entries() {
        let store = SharedContextStore::default();
        let stale = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-200".to_string(),
            scope: ContextScope::Project,
            content: "stale".to_string(),
            ttl_ms: Some(10),
        });
        let fresh = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-201".to_string(),
            scope: ContextScope::Project,
            content: "fresh".to_string(),
            ttl_ms: Some(10_000),
        });

        let now = stale.created_at + Duration::milliseconds(20);
        let expired = store.prune_expired_entries_at(now);

        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].id, stale.id);

        let remaining = store.list();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, fresh.id);
    }

    #[test]
    fn max_entries_eviction_keeps_most_recent_entries() {
        let store = SharedContextStore::new(DEFAULT_SHARED_CONTEXT_TTL_MS, 2);

        let first = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-1".to_string(),
            scope: ContextScope::Project,
            content: "1".to_string(),
            ttl_ms: None,
        });
        let second = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-2".to_string(),
            scope: ContextScope::Project,
            content: "2".to_string(),
            ttl_ms: None,
        });
        let third = store.write_entry(ContextEntryDraft {
            author_issue: "KAT-3".to_string(),
            scope: ContextScope::Project,
            content: "3".to_string(),
            ttl_ms: None,
        });

        let ids: Vec<String> = store.list().into_iter().map(|entry| entry.id).collect();
        assert!(ids.contains(&second.id));
        assert!(ids.contains(&third.id));
        assert!(!ids.contains(&first.id));
    }
}
