//! TrackerAdapter trait and LinearAdapter implementation.
//!
//! Ports the Elixir `SymphonyElixir.Tracker` behaviour and
//! `SymphonyElixir.Linear.Adapter` module to idiomatic Rust.

use async_trait::async_trait;

use crate::domain::Issue;
use crate::error::{Result, SymphonyError};
use crate::linear::client::LinearClient;

// ── TrackerAdapter trait (spec §4.1.1, matches Elixir `tracker.ex`) ────

/// Adapter boundary for issue tracker reads and writes.
///
/// The 5 methods mirror the Elixir `SymphonyElixir.Tracker` callbacks:
/// - 3 read operations (implemented by `LinearAdapter`)
/// - 2 write operations (create_comment, update_issue_state)
#[async_trait]
pub trait TrackerAdapter: Send + Sync {
    /// Fetch candidate issues matching configured active states and assignee filter.
    async fn fetch_candidate_issues(&self) -> Result<Vec<Issue>>;

    /// Fetch issues by arbitrary state names (no assignee filter).
    async fn fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>>;

    /// Fetch issues by IDs, preserving original input order.
    async fn fetch_issue_states_by_ids(&self, issue_ids: &[String]) -> Result<Vec<Issue>>;

    /// Create a comment on an issue.
    async fn create_comment(&self, issue_id: &str, body: &str) -> Result<()>;

    /// Update an issue's workflow state.
    async fn update_issue_state(&self, issue_id: &str, state_name: &str) -> Result<()>;
}

// ── LinearAdapter ──────────────────────────────────────────────────────

/// Linear-backed tracker adapter. Delegates read operations to `LinearClient`.
/// Write operations are not yet implemented (returns `SymphonyError::Other`).
pub struct LinearAdapter {
    client: LinearClient,
}

impl LinearAdapter {
    /// Create a new `LinearAdapter` wrapping the given `LinearClient`.
    pub fn new(client: LinearClient) -> Self {
        Self { client }
    }
}

#[async_trait]
impl TrackerAdapter for LinearAdapter {
    async fn fetch_candidate_issues(&self) -> Result<Vec<Issue>> {
        self.client.fetch_candidates().await
    }

    async fn fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>> {
        self.client.fetch_issues_by_states(state_names).await
    }

    async fn fetch_issue_states_by_ids(&self, issue_ids: &[String]) -> Result<Vec<Issue>> {
        self.client.fetch_issue_states_by_ids(issue_ids).await
    }

    async fn create_comment(&self, _issue_id: &str, _body: &str) -> Result<()> {
        Err(SymphonyError::Other("not implemented".to_string()))
    }

    async fn update_issue_state(&self, _issue_id: &str, _state_name: &str) -> Result<()> {
        Err(SymphonyError::Other("not implemented".to_string()))
    }
}
