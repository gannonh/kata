//! Linear GraphQL client — fetches and normalizes issues from the Linear API.
//!
//! Ports the Elixir `SymphonyElixir.Linear.Client` module to idiomatic Rust.
//! Three fetch operations:
//! - `fetch_candidates` — cursor-paginated candidate issues by active states
//! - `fetch_issues_by_states` — cursor-paginated issues by arbitrary states (no assignee filter)
//! - `fetch_issue_states_by_ids` — batched ID-based fetch with order preservation

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde_json::Value;
use tracing::{error, info, warn};

use crate::domain::{BlockerRef, Issue, TrackerConfig};
use crate::error::{Result, SymphonyError};

// ── Constants ──────────────────────────────────────────────────────────

const ISSUE_PAGE_SIZE: usize = 50;
const REQUEST_TIMEOUT_SECS: u64 = 30;
const MAX_ERROR_BODY_LOG_BYTES: usize = 1_000;

// ── GraphQL Queries (match Elixir reference exactly) ───────────────────

const QUERY_CANDIDATES: &str = r#"
query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
      id
      identifier
      title
      description
      priority
      state {
        name
      }
      branchName
      url
      assignee {
        id
      }
      labels {
        nodes {
          name
        }
      }
      inverseRelations(first: $relationFirst) {
        nodes {
          type
          issue {
            id
            identifier
            state {
              name
            }
          }
        }
      }
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"#;

const QUERY_BY_IDS: &str = r#"
query SymphonyLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
  issues(filter: {id: {in: $ids}}, first: $first) {
    nodes {
      id
      identifier
      title
      description
      priority
      state {
        name
      }
      branchName
      url
      assignee {
        id
      }
      labels {
        nodes {
          name
        }
      }
      inverseRelations(first: $relationFirst) {
        nodes {
          type
          issue {
            id
            identifier
            state {
              name
            }
          }
        }
      }
      createdAt
      updatedAt
    }
  }
}
"#;

const VIEWER_QUERY: &str = r#"
query SymphonyLinearViewer {
  viewer {
    id
  }
}
"#;

// ── AssigneeFilter ─────────────────────────────────────────────────────

/// Filter for routing issues to the current worker based on assignee.
#[derive(Debug, Clone)]
pub struct AssigneeFilter {
    pub match_values: HashSet<String>,
}

// ── LinearClient ───────────────────────────────────────────────────────

/// GraphQL HTTP transport and issue-fetch operations for the Linear API.
#[derive(Debug, Clone)]
pub struct LinearClient {
    http: reqwest::Client,
    config: TrackerConfig,
}

impl LinearClient {
    /// Create a new `LinearClient` with a reusable HTTP client and the given tracker config.
    pub fn new(config: TrackerConfig) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("failed to build reqwest client");
        Self { http, config }
    }

    // ── Public fetch operations ────────────────────────────────────────

    /// Fetch candidate issues matching the configured active states and assignee filter.
    /// Uses cursor-based pagination to retrieve all matching issues.
    pub async fn fetch_candidates(&self) -> Result<Vec<Issue>> {
        self.validate_config()?;

        let assignee_filter = self.routing_assignee_filter().await?;
        let project_slug = self.config.project_slug.as_deref().unwrap();

        info!(operation = "fetch_candidates", "fetching candidate issues");
        let issues = self
            .do_fetch_by_states(
                project_slug,
                &self.config.active_states,
                assignee_filter.as_ref(),
            )
            .await?;
        info!(
            operation = "fetch_candidates",
            count = issues.len(),
            "fetched candidate issues"
        );
        Ok(issues)
    }

    /// Fetch issues by arbitrary state names. Does NOT apply the assignee filter.
    /// Returns `Ok(vec![])` for empty input without making an API call.
    pub async fn fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>> {
        let normalized: Vec<String> = dedup_strings(state_names);
        if normalized.is_empty() {
            return Ok(vec![]);
        }

        self.validate_config()?;
        let project_slug = self.config.project_slug.as_deref().unwrap();

        info!(
            operation = "fetch_issues_by_states",
            states = ?normalized,
            "fetching issues by states"
        );
        // No assignee filter for state-based fetch (used for terminal cleanup)
        let issues = self
            .do_fetch_by_states(project_slug, &normalized, None)
            .await?;
        info!(
            operation = "fetch_issues_by_states",
            count = issues.len(),
            "fetched issues by states"
        );
        Ok(issues)
    }

    /// Fetch issues by IDs, batched in chunks of 50, preserving original input order.
    /// Returns `Ok(vec![])` for empty input without making an API call.
    pub async fn fetch_issue_states_by_ids(&self, ids: &[String]) -> Result<Vec<Issue>> {
        let deduped = dedup_strings(ids);
        if deduped.is_empty() {
            return Ok(vec![]);
        }

        if self.config.api_key.is_none() {
            return Err(SymphonyError::MissingLinearApiToken);
        }
        let assignee_filter = self.routing_assignee_filter().await?;

        info!(
            operation = "fetch_issue_states_by_ids",
            id_count = deduped.len(),
            "fetching issues by IDs"
        );

        let issue_order_index = build_order_index(&deduped);
        let mut all_issues: Vec<Issue> = Vec::new();

        for batch in deduped.chunks(ISSUE_PAGE_SIZE) {
            let body = self
                .graphql(
                    QUERY_BY_IDS,
                    serde_json::json!({
                        "ids": batch,
                        "first": batch.len(),
                        "relationFirst": ISSUE_PAGE_SIZE,
                    }),
                )
                .await?;

            let issues = decode_linear_response(&body, assignee_filter.as_ref())?;
            all_issues.extend(issues);
        }

        sort_by_requested_order(&mut all_issues, &issue_order_index);

        info!(
            operation = "fetch_issue_states_by_ids",
            count = all_issues.len(),
            "fetched issues by IDs"
        );
        Ok(all_issues)
    }

    // ── GraphQL transport ──────────────────────────────────────────────

    /// Execute a GraphQL query against the Linear API.
    ///
    /// Sends the raw API key in the `Authorization` header (NOT Bearer-prefixed).
    /// Maps transport errors to `LinearApiRequest`, non-200 status to `LinearApiStatus`,
    /// GraphQL `errors` field to `LinearGraphqlErrors`, unknown shapes to `LinearUnknownPayload`.
    async fn graphql(&self, query: &str, variables: Value) -> Result<Value> {
        let api_key = self
            .config
            .api_key
            .as_ref()
            .ok_or(SymphonyError::MissingLinearApiToken)?;

        let payload = serde_json::json!({
            "query": query,
            "variables": variables,
        });

        let response = self
            .http
            .post(&self.config.endpoint)
            .header("Authorization", api_key.as_str())
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| {
                error!(error = %e, "Linear GraphQL transport error");
                SymphonyError::LinearApiRequest(e.to_string())
            })?;

        let status = response.status().as_u16();
        if status != 200 {
            let body_text = response.text().await.unwrap_or_default();
            let truncated = truncate_error_body(&body_text);
            warn!(
                status = status,
                body = %truncated,
                "Linear GraphQL non-200 response"
            );
            return Err(SymphonyError::LinearApiStatus(status));
        }

        let body: Value = response.json().await.map_err(|e| {
            error!(error = %e, "Linear GraphQL response parse error");
            SymphonyError::LinearApiRequest(e.to_string())
        })?;

        // Check for GraphQL-level errors
        if let Some(errors) = body.get("errors") {
            let errors_str =
                serde_json::to_string(errors).unwrap_or_else(|_| "unknown".to_string());
            return Err(SymphonyError::LinearGraphqlErrors(errors_str));
        }

        Ok(body)
    }

    // ── Internal pagination ────────────────────────────────────────────

    /// Cursor-paginated fetch for state-based queries.
    /// Uses the reverse+prepend accumulation pattern from the Elixir reference
    /// to preserve page ordering.
    async fn do_fetch_by_states(
        &self,
        project_slug: &str,
        state_names: &[String],
        assignee_filter: Option<&AssigneeFilter>,
    ) -> Result<Vec<Issue>> {
        let mut acc: Vec<Issue> = Vec::new();
        let mut after_cursor: Option<String> = None;

        loop {
            let mut variables = serde_json::json!({
                "projectSlug": project_slug,
                "stateNames": state_names,
                "first": ISSUE_PAGE_SIZE,
                "relationFirst": ISSUE_PAGE_SIZE,
            });

            if let Some(ref cursor) = after_cursor {
                variables["after"] = Value::String(cursor.clone());
            }

            let body = self.graphql(QUERY_CANDIDATES, variables).await?;

            let (issues, page_info) = decode_linear_page_response(&body, assignee_filter)?;

            // Accumulate: reverse page then prepend to accumulator
            // (equivalent to Elixir's Enum.reverse(issues, acc))
            prepend_page_issues(&mut acc, issues);

            match next_page_cursor(&page_info) {
                PageCursorResult::Continue(cursor) => {
                    after_cursor = Some(cursor);
                }
                PageCursorResult::Done => {
                    break;
                }
                PageCursorResult::Error => {
                    return Err(SymphonyError::LinearMissingEndCursor);
                }
            }
        }

        // Finalize: reverse the accumulated list to restore page order
        acc.reverse();
        Ok(acc)
    }

    // ── Config validation ──────────────────────────────────────────────

    fn validate_config(&self) -> Result<()> {
        if self.config.api_key.is_none() {
            return Err(SymphonyError::MissingLinearApiToken);
        }
        if self.config.project_slug.is_none() {
            return Err(SymphonyError::MissingLinearProjectSlug);
        }
        Ok(())
    }

    // ── Assignee routing ───────────────────────────────────────────────

    /// Build the assignee filter from `TrackerConfig.assignee`.
    /// - `None` or empty → no filter (all issues routable)
    /// - `"me"` → resolve via viewer query
    /// - anything else → literal match
    async fn routing_assignee_filter(&self) -> Result<Option<AssigneeFilter>> {
        match &self.config.assignee {
            None => Ok(None),
            Some(assignee) => build_assignee_filter(assignee, self).await,
        }
    }

    /// Execute the viewer query to resolve the authenticated user's ID.
    async fn resolve_viewer_assignee_filter(&self) -> Result<AssigneeFilter> {
        let body = self.graphql(VIEWER_QUERY, serde_json::json!({})).await?;

        let viewer_id = body
            .get("data")
            .and_then(|d| d.get("viewer"))
            .and_then(|v| v.get("id"))
            .and_then(|id| id.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        match viewer_id {
            Some(id) => {
                let mut match_values = HashSet::new();
                match_values.insert(id);
                Ok(AssigneeFilter { match_values })
            }
            None => Err(SymphonyError::Other(
                "missing Linear viewer identity".to_string(),
            )),
        }
    }
}

// ── Assignee filter construction ───────────────────────────────────────

/// Build an `AssigneeFilter` from a raw assignee string.
async fn build_assignee_filter(
    assignee: &str,
    client: &LinearClient,
) -> Result<Option<AssigneeFilter>> {
    let trimmed = assignee.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if trimmed == "me" {
        let filter = client.resolve_viewer_assignee_filter().await?;
        return Ok(Some(filter));
    }

    let mut match_values = HashSet::new();
    match_values.insert(trimmed.to_string());
    Ok(Some(AssigneeFilter { match_values }))
}

// ── Normalization ──────────────────────────────────────────────────────

/// Normalize a raw JSON issue node into a domain `Issue`.
///
/// Returns `None` if the input is not a JSON object (matching Elixir behavior
/// where non-map input returns `nil`).
pub fn normalize_issue(raw: &Value, assignee_filter: Option<&AssigneeFilter>) -> Option<Issue> {
    let obj = raw.as_object()?;

    let id = obj.get("id")?.as_str()?.to_string();
    let identifier = obj
        .get("identifier")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let description = obj
        .get("description")
        .and_then(|v| v.as_str())
        .map(String::from);
    let priority = parse_priority(obj.get("priority"));
    let state = obj
        .get("state")
        .and_then(|s| s.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .to_string();
    let branch_name = obj
        .get("branchName")
        .and_then(|v| v.as_str())
        .map(String::from);
    let url = obj.get("url").and_then(|v| v.as_str()).map(String::from);

    let assignee = obj.get("assignee");
    let assignee_id = assignee_field(assignee, "id");

    let labels = extract_labels(raw);
    let blocked_by = extract_blockers(raw);
    let assigned = assigned_to_worker(assignee, assignee_filter);

    let created_at = parse_datetime(obj.get("createdAt"));
    let updated_at = parse_datetime(obj.get("updatedAt"));

    Some(Issue {
        id,
        identifier,
        title,
        description,
        priority,
        state,
        branch_name,
        url,
        assignee_id,
        labels,
        blocked_by,
        assigned_to_worker: assigned,
        created_at,
        updated_at,
    })
}

/// Parse a priority value: integer stays, anything else → None.
fn parse_priority(val: Option<&Value>) -> Option<i32> {
    val.and_then(|v| {
        if v.is_i64() {
            v.as_i64().map(|n| n as i32)
        } else if v.is_u64() {
            v.as_u64().map(|n| n as i32)
        } else {
            None
        }
    })
}

/// Nil-safe nested field access on the assignee object.
fn assignee_field(assignee: Option<&Value>, field: &str) -> Option<String> {
    assignee
        .and_then(|a| a.get(field))
        .and_then(|v| v.as_str())
        .map(String::from)
}

/// Check if the issue is assigned to the current worker.
/// - No filter → true (all issues routable)
/// - Filter match → true
/// - Filter mismatch or no assignee → false
fn assigned_to_worker(assignee: Option<&Value>, filter: Option<&AssigneeFilter>) -> bool {
    let filter = match filter {
        None => return true,
        Some(f) => f,
    };

    let assignee_id = assignee
        .and_then(|a| a.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    match assignee_id {
        None => false,
        Some(id) => filter.match_values.contains(&id),
    }
}

/// Extract labels from `labels.nodes[].name`, reject nil, lowercase all.
fn extract_labels(raw: &Value) -> Vec<String> {
    raw.get("labels")
        .and_then(|l| l.get("nodes"))
        .and_then(|n| n.as_array())
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| node.get("name").and_then(|n| n.as_str()))
                .map(|name| name.to_lowercase())
                .collect()
        })
        .unwrap_or_default()
}

/// Extract blockers from `inverseRelations.nodes[]` where `type` (lowercased, trimmed) == "blocks".
fn extract_blockers(raw: &Value) -> Vec<BlockerRef> {
    raw.get("inverseRelations")
        .and_then(|ir| ir.get("nodes"))
        .and_then(|n| n.as_array())
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|node| {
                    let relation_type = node.get("type").and_then(|t| t.as_str())?;
                    if relation_type.to_lowercase().trim() != "blocks" {
                        return None;
                    }

                    let blocker_issue = node.get("issue")?;
                    Some(BlockerRef {
                        id: blocker_issue
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        identifier: blocker_issue
                            .get("identifier")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        state: blocker_issue
                            .get("state")
                            .and_then(|s| s.get("name"))
                            .and_then(|n| n.as_str())
                            .map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse an ISO-8601 datetime string, returning None on failure.
fn parse_datetime(val: Option<&Value>) -> Option<DateTime<Utc>> {
    val.and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc))
}

// ── Response decoding ──────────────────────────────────────────────────

/// Decode a standard Linear GraphQL response (no pageInfo).
fn decode_linear_response(
    body: &Value,
    assignee_filter: Option<&AssigneeFilter>,
) -> Result<Vec<Issue>> {
    if let Some(nodes) = body
        .get("data")
        .and_then(|d| d.get("issues"))
        .and_then(|i| i.get("nodes"))
        .and_then(|n| n.as_array())
    {
        let issues: Vec<Issue> = nodes
            .iter()
            .filter_map(|node| normalize_issue(node, assignee_filter))
            .collect();
        return Ok(issues);
    }

    if body.get("errors").is_some() {
        let errors_str = serde_json::to_string(body.get("errors").unwrap())
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(SymphonyError::LinearGraphqlErrors(errors_str));
    }

    Err(SymphonyError::LinearUnknownPayload)
}

/// Page info extracted from a paginated response.
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

/// Result of checking the next page cursor.
enum PageCursorResult {
    Continue(String),
    Done,
    Error,
}

/// Decode a paginated Linear response (with pageInfo).
fn decode_linear_page_response(
    body: &Value,
    assignee_filter: Option<&AssigneeFilter>,
) -> Result<(Vec<Issue>, PageInfo)> {
    let issues_obj = body.get("data").and_then(|d| d.get("issues"));

    if let Some(issues_val) = issues_obj {
        let nodes = issues_val.get("nodes").and_then(|n| n.as_array());
        let page_info_val = issues_val.get("pageInfo");

        if let (Some(nodes), Some(pi)) = (nodes, page_info_val) {
            let issues: Vec<Issue> = nodes
                .iter()
                .filter_map(|node| normalize_issue(node, assignee_filter))
                .collect();

            let has_next_page = pi
                .get("hasNextPage")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let end_cursor = pi
                .get("endCursor")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from);

            return Ok((
                issues,
                PageInfo {
                    has_next_page,
                    end_cursor,
                },
            ));
        }
    }

    // Fall back to non-paginated decode for error handling
    if body.get("errors").is_some() {
        let errors_str = serde_json::to_string(body.get("errors").unwrap())
            .unwrap_or_else(|_| "unknown".to_string());
        return Err(SymphonyError::LinearGraphqlErrors(errors_str));
    }

    Err(SymphonyError::LinearUnknownPayload)
}

/// Check the page info to determine if we should continue, stop, or error.
fn next_page_cursor(page_info: &PageInfo) -> PageCursorResult {
    if page_info.has_next_page {
        match &page_info.end_cursor {
            Some(cursor) => PageCursorResult::Continue(cursor.clone()),
            None => PageCursorResult::Error,
        }
    } else {
        PageCursorResult::Done
    }
}

// ── Pagination helpers ─────────────────────────────────────────────────

/// Prepend page issues to the accumulator using the reverse+prepend pattern.
/// Equivalent to Elixir's `Enum.reverse(issues, acc)`.
fn prepend_page_issues(acc: &mut Vec<Issue>, mut page: Vec<Issue>) {
    page.reverse();
    page.append(acc);
    *acc = page;
}

// ── Order preservation for ID-based fetch ──────────────────────────────

/// Build an order index map: ID → position in the original request.
fn build_order_index(ids: &[String]) -> HashMap<String, usize> {
    ids.iter()
        .enumerate()
        .map(|(i, id)| (id.clone(), i))
        .collect()
}

/// Sort issues to match the original requested ID order.
fn sort_by_requested_order(issues: &mut [Issue], order_index: &HashMap<String, usize>) {
    let fallback = order_index.len();
    issues.sort_by_key(|issue| *order_index.get(&issue.id).unwrap_or(&fallback));
}

// ── Utility ────────────────────────────────────────────────────────────

/// Deduplicate strings while preserving first-occurrence order.
fn dedup_strings(input: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    input
        .iter()
        .filter(|s| seen.insert((*s).clone()))
        .cloned()
        .collect()
}

/// Truncate an error body to ≤1000 bytes for logging.
/// UTF-8 safe: finds the nearest char boundary before the cut point.
/// Total output (including suffix) never exceeds MAX_ERROR_BODY_LOG_BYTES.
fn truncate_error_body(body: &str) -> String {
    const SUFFIX: &str = "...<truncated>";
    // Collapse whitespace for readability
    let collapsed: String = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.len() > MAX_ERROR_BODY_LOG_BYTES {
        let max_content = MAX_ERROR_BODY_LOG_BYTES.saturating_sub(SUFFIX.len());
        // Walk backwards to find a valid UTF-8 char boundary
        let mut end = max_content;
        while end > 0 && !collapsed.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}{}", &collapsed[..end], SUFFIX)
    } else {
        collapsed
    }
}

// Test helpers for normalization are added in T02 (integration test suite).
