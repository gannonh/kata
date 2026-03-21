use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{Method, StatusCode, Uri};
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use tokio::net::TcpListener;

use crate::domain::{
    CodexTotals, OrchestratorSnapshot, PollingSnapshot, RefreshRequestOutcome, RetrySnapshotEntry,
    RunAttempt,
};
use crate::orchestrator::{RefreshSender, SnapshotHandle};

// ── Traits for testability ─────────────────────────────────────────────

pub trait SnapshotSource: Send + Sync {
    fn snapshot(&self) -> OrchestratorSnapshot;
}

impl<F> SnapshotSource for F
where
    F: Fn() -> OrchestratorSnapshot + Send + Sync,
{
    fn snapshot(&self) -> OrchestratorSnapshot {
        (self)()
    }
}

pub trait RefreshControl: Send + Sync {
    fn request_refresh(&self) -> RefreshRequestOutcome;
}

impl<F> RefreshControl for F
where
    F: Fn() -> RefreshRequestOutcome + Send + Sync,
{
    fn request_refresh(&self) -> RefreshRequestOutcome {
        (self)()
    }
}

// ── Trait implementations for orchestrator types ───────────────────────

impl SnapshotSource for SnapshotHandle {
    fn snapshot(&self) -> OrchestratorSnapshot {
        self.read()
    }
}

impl RefreshControl for RefreshSender {
    fn request_refresh(&self) -> RefreshRequestOutcome {
        self.request_refresh()
    }
}

// ── HTTP Server State ──────────────────────────────────────────────────

#[derive(Clone)]
pub struct HttpServerState {
    snapshot_source: Arc<dyn SnapshotSource>,
    refresh_control: Arc<dyn RefreshControl>,
}

impl HttpServerState {
    pub fn new(
        snapshot_source: Arc<dyn SnapshotSource>,
        refresh_control: Arc<dyn RefreshControl>,
    ) -> Self {
        Self {
            snapshot_source,
            refresh_control,
        }
    }

    pub fn snapshot(&self) -> OrchestratorSnapshot {
        self.snapshot_source.snapshot()
    }

    pub fn request_refresh(&self) -> RefreshRequestOutcome {
        self.refresh_control.request_refresh()
    }
}

// ── API Response Types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct ApiErrorEnvelope {
    error: ApiError,
}

#[derive(Debug, Serialize)]
struct ApiError {
    code: &'static str,
    message: String,
    status: u16,
}

#[derive(Debug, Serialize)]
struct StateResponse {
    poll_interval_ms: u64,
    max_concurrent_agents: u32,
    running: std::collections::BTreeMap<String, RunAttempt>,
    claimed: std::collections::BTreeSet<String>,
    retry_queue: Vec<RetrySnapshotEntry>,
    completed: Vec<crate::domain::CompletedEntry>,
    codex_totals: CodexTotals,
    codex_rate_limits: Option<serde_json::Value>,
    polling: PollingSnapshot,
}

#[derive(Debug, Serialize)]
struct IssueResponseEnvelope {
    issue: IssueProjection,
}

#[derive(Debug, Serialize)]
struct IssueProjection {
    issue_id: String,
    issue_identifier: String,
    status: &'static str,
    attempt: Option<u32>,
    error: Option<String>,
    worker_host: Option<String>,
    workspace_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct RefreshResponse {
    queued: bool,
    coalesced: bool,
    pending_requests: u64,
}

// ── Router ─────────────────────────────────────────────────────────────

pub fn build_router(state: HttpServerState) -> Router {
    Router::new()
        .route("/", get(get_dashboard))
        .route("/api/v1/state", get(get_state))
        .route("/api/v1/{issue_identifier}", get(get_issue))
        .route("/api/v1/refresh", post(post_refresh))
        .fallback(api_not_found)
        .method_not_allowed_fallback(api_method_not_allowed)
        .with_state(state)
}

pub async fn start_http_server(
    state: HttpServerState,
    port: u16,
    host: &str,
) -> std::io::Result<()> {
    let bind_addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_addr).await?;
    tracing::info!(
        event = "http_server_started",
        host = host,
        port,
        "HTTP observability server started"
    );
    axum::serve(listener, build_router(state)).await
}

// ── Route Handlers ─────────────────────────────────────────────────────

async fn get_dashboard(State(state): State<HttpServerState>) -> impl IntoResponse {
    let snapshot = state.snapshot();

    let running_count = snapshot.running.len();
    let retry_count = snapshot.retry_queue.len();
    let completed_count = snapshot.completed.len();
    let claimed_count = snapshot.claimed.len();
    let input_tokens = snapshot.codex_totals.input_tokens;
    let output_tokens = snapshot.codex_totals.output_tokens;
    let total_tokens = snapshot.codex_totals.total_tokens;
    let polling_checking = if snapshot.polling.checking {
        "yes"
    } else {
        "no"
    };

    let rate_limit_block = snapshot
        .codex_rate_limits
        .as_ref()
        .map(|rate_limits| {
            serde_json::to_string_pretty(&rate_limits.data).unwrap_or_else(|_| "{}".to_string())
        })
        .unwrap_or_else(|| "{}".to_string());

    let html = format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Symphony Dashboard</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #10131a; color: #f1f5f9; margin: 0; padding: 24px; line-height: 1.45; }}
    h1 {{ margin-top: 0; margin-bottom: 12px; }}
    h2 {{ margin: 0 0 10px; font-size: 18px; }}
    .grid {{ display: grid; gap: 12px; margin-bottom: 16px; }}
    .summary-grid {{ grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }}
    .token-grid {{ grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 0; }}
    .card {{ background: #1c2430; border: 1px solid #314154; border-radius: 10px; padding: 12px; }}
    .label {{ color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }}
    .value {{ font-size: 24px; font-weight: 700; margin-top: 4px; }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
    .section {{ margin-top: 12px; }}
    .table-wrap {{ overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th, td {{ padding: 8px; border-bottom: 1px solid #2b3a4e; text-align: left; vertical-align: top; }}
    th {{ color: #a8b8cc; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }}
    td {{ color: #d7e1ee; }}
    td.mono {{ word-break: break-all; }}
    .list {{ margin: 0; padding-left: 20px; }}
    .muted {{ color: #94a3b8; }}
    .error {{ margin-top: 12px; color: #fca5a5; }}
    .polling-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin: 0; }}
    .polling-grid div {{ background: #0f1724; border: 1px solid #27354a; border-radius: 8px; padding: 8px; }}
    details summary {{ cursor: pointer; font-weight: 600; }}
    pre {{ white-space: pre-wrap; word-break: break-word; background: #0b1119; border: 1px solid #27354a; border-radius: 8px; padding: 10px; margin-top: 10px; }}
  </style>
</head>
<body>
  <h1>Symphony Dashboard</h1>
  <div class="grid summary-grid">
    <section class="card"><div class="label">running</div><div class="value" id="running-count">{running_count}</div></section>
    <section class="card"><div class="label">retry</div><div class="value" id="retry-count">{retry_count}</div></section>
    <section class="card"><div class="label">claimed</div><div class="value" id="claimed-count">{claimed_count}</div></section>
    <section class="card"><div class="label">completed</div><div class="value" id="completed-count">{completed_count}</div></section>
  </div>

  <section class="card section">
    <h2>Token summary</h2>
    <div class="grid token-grid">
      <div><div class="label">input tokens</div><div class="value" id="token-input">{input_tokens}</div></div>
      <div><div class="label">output tokens</div><div class="value" id="token-output">{output_tokens}</div></div>
      <div><div class="label">total tokens</div><div class="value" id="token-total">{total_tokens}</div></div>
    </div>
  </section>

  <section class="card section">
    <h2>Running sessions</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Linear State</th>
            <th>Status</th>
            <th>Attempt</th>
            <th>Elapsed</th>
            <th>Workspace</th>
            <th>Worker host</th>
          </tr>
        </thead>
        <tbody id="running-table-body">
          <tr><td class="muted" colspan="7">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card section">
    <h2>Retry queue</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Identifier</th>
            <th>Attempt</th>
            <th>Error</th>
            <th>Retry after</th>
            <th>Worker host</th>
          </tr>
        </thead>
        <tbody id="retry-table-body">
          <tr><td class="muted" colspan="5">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card section">
    <h2>Completed issues</h2>
    <ul id="completed-list" class="list">
      <li class="muted">Loading...</li>
    </ul>
  </section>

  <section class="card section">
    <h2>Polling</h2>
    <div class="polling-grid">
      <div><div class="label">last poll at</div><div class="mono" id="polling-last-poll">n/a</div></div>
      <div><div class="label">poll count</div><div class="mono" id="polling-count">n/a</div></div>
      <div><div class="label">checking</div><div class="mono" id="polling-checking">{polling_checking}</div></div>
      <div><div class="label">next poll in</div><div class="mono" id="polling-next-poll">n/a</div></div>
      <div><div class="label">poll interval</div><div class="mono" id="polling-interval">n/a</div></div>
    </div>
  </section>

  <details class="card section" open>
    <summary>Rate limits</summary>
    <pre id="rate-limits" class="mono">{rate_limit_block}</pre>
  </details>

  <p id="refresh-error" class="error" hidden></p>

  <script>
    function escapeHtml(value) {{
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }}

    function formatDuration(ms) {{
      if (ms === null || ms === undefined) return 'n/a';
      const numeric = Number(ms);
      if (!Number.isFinite(numeric)) return 'n/a';
      const sign = numeric < 0 ? '-' : '';
      const totalSeconds = Math.floor(Math.abs(numeric) / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return sign + hours + 'h ' + minutes + 'm ' + seconds + 's';
      if (minutes > 0) return sign + minutes + 'm ' + seconds + 's';
      return sign + seconds + 's';
    }}

    function formatRetryDelay(ms) {{
      const numeric = Number(ms);
      if (!Number.isFinite(numeric)) return 'n/a';
      if (numeric <= 0) return 'ready';
      return 'in ' + formatDuration(numeric);
    }}

    function formatDate(value) {{
      if (value === null || value === undefined) return 'n/a';
      if (typeof value === 'string') {{
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
      }}
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return String(value);
      const parsed = new Date(numeric);
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
    }}

    function renderRunningTable(running) {{
      const rows = Object.values(running || {{}}).sort(function(a, b) {{
        return String(a.issue_identifier || '').localeCompare(String(b.issue_identifier || ''));
      }});

      if (rows.length === 0) {{
        return '<tr><td class="muted" colspan="7">No running sessions.</td></tr>';
      }}

      return rows.map(function(run) {{
        const startedAt = Date.parse(run.started_at || '');
        const elapsed = Number.isFinite(startedAt) ? formatDuration(Date.now() - startedAt) : 'n/a';
        const attempt = run.attempt ?? 1;
        return '<tr>' +
          '<td class="mono">' + escapeHtml(run.issue_identifier || '-') + '</td>' +
          '<td>' + escapeHtml(run.linear_state || '-') + '</td>' +
          '<td>' + escapeHtml(run.status || '-') + '</td>' +
          '<td>' + escapeHtml(attempt) + '</td>' +
          '<td class="mono">' + escapeHtml(elapsed) + '</td>' +
          '<td class="mono">' + escapeHtml(run.workspace_path || '-') + '</td>' +
          '<td>' + escapeHtml(run.worker_host || 'local') + '</td>' +
          '</tr>';
      }}).join('');
    }}

    function renderRetryTable(retryQueue) {{
      const rows = Array.isArray(retryQueue) ? retryQueue.slice() : [];

      function retryDelayValue(entry) {{
        return entry.retry_after_ms ?? entry.due_in_ms;
      }}

      rows.sort(function(a, b) {{
        return Number(retryDelayValue(a) ?? 0) - Number(retryDelayValue(b) ?? 0);
      }});

      if (rows.length === 0) {{
        return '<tr><td class="muted" colspan="5">No pending retries.</td></tr>';
      }}

      return rows.map(function(retry) {{
        const retryAfterMs = retryDelayValue(retry);
        return '<tr>' +
          '<td class="mono">' + escapeHtml(retry.identifier || '-') + '</td>' +
          '<td>' + escapeHtml(retry.attempt ?? '-') + '</td>' +
          '<td>' + escapeHtml(retry.error || '-') + '</td>' +
          '<td class="mono">' + escapeHtml(formatRetryDelay(retryAfterMs)) + '</td>' +
          '<td>' + escapeHtml(retry.worker_host || 'local') + '</td>' +
          '</tr>';
      }}).join('');
    }}

    function renderCompleted(completed) {{
      const items = Array.isArray(completed) ? completed : [];
      if (items.length === 0) {{
        return '<li class="muted">No completed issues yet.</li>';
      }}

      return items.map(function(entry) {{
        const id = entry.identifier || entry.issue_id || '-';
        const title = entry.title || '';
        const date = entry.completed_at ? new Date(entry.completed_at).toLocaleString() : '';
        const label = title ? id + ' — ' + title : id;
        const suffix = date ? ' <span class="muted" style="font-size:12px">(' + escapeHtml(date) + ')</span>' : '';
        return '<li class="mono">' + escapeHtml(label) + suffix + '</li>';
      }}).join('');
    }}

    function updatePolling(polling) {{
      const poll = polling || {{}};
      document.getElementById('polling-last-poll').textContent = formatDate(poll.last_poll_at);
      document.getElementById('polling-count').textContent =
        poll.poll_count === undefined || poll.poll_count === null ? 'n/a' : String(poll.poll_count);
      document.getElementById('polling-checking').textContent = poll.checking ? 'yes' : 'no';
      document.getElementById('polling-next-poll').textContent = formatDuration(poll.next_poll_in_ms);
      document.getElementById('polling-interval').textContent = formatDuration(poll.poll_interval_ms);
    }}

    function clearError() {{
      const error = document.getElementById('refresh-error');
      error.hidden = true;
      error.textContent = '';
    }}

    function showError(message) {{
      const error = document.getElementById('refresh-error');
      error.hidden = false;
      error.textContent = message;
    }}

    async function refreshState() {{
      try {{
        const response = await fetch('/api/v1/state');
        if (!response.ok) throw new Error('state fetch failed: ' + response.status);
        const state = await response.json();
        const running = state.running || {{}};
        const retryQueue = state.retry_queue || [];
        const completed = state.completed || [];

        document.getElementById('running-count').textContent = Object.keys(running).length;
        document.getElementById('retry-count').textContent = retryQueue.length;
        document.getElementById('claimed-count').textContent = (state.claimed || []).length;
        document.getElementById('completed-count').textContent = completed.length;
        document.getElementById('running-table-body').innerHTML = renderRunningTable(running);
        document.getElementById('retry-table-body').innerHTML = renderRetryTable(retryQueue);
        document.getElementById('completed-list').innerHTML = renderCompleted(completed);
        document.getElementById('token-input').textContent = state.codex_totals?.input_tokens ?? 0;
        document.getElementById('token-output').textContent = state.codex_totals?.output_tokens ?? 0;
        document.getElementById('token-total').textContent = state.codex_totals?.total_tokens ?? 0;
        document.getElementById('rate-limits').textContent = JSON.stringify(state.codex_rate_limits || {{}}, null, 2);
        updatePolling(state.polling);
        clearError();
      }} catch (error) {{
        showError(String(error));
      }}
    }}
    refreshState();
    setInterval(refreshState, 2000);
  </script>
</body>
</html>
"#
    );

    Html(html)
}

async fn get_state(State(state): State<HttpServerState>) -> impl IntoResponse {
    let snapshot = state.snapshot();
    Json(StateResponse {
        poll_interval_ms: snapshot.poll_interval_ms,
        max_concurrent_agents: snapshot.max_concurrent_agents,
        running: snapshot.running,
        claimed: snapshot.claimed,
        retry_queue: snapshot.retry_queue,
        completed: snapshot.completed,
        codex_totals: snapshot.codex_totals,
        codex_rate_limits: snapshot.codex_rate_limits.map(|r| r.data),
        polling: snapshot.polling,
    })
}

async fn get_issue(
    State(state): State<HttpServerState>,
    Path(issue_identifier): Path<String>,
    uri: Uri,
) -> impl IntoResponse {
    if !looks_like_issue_identifier(&issue_identifier) {
        return api_not_found(uri).await.into_response();
    }

    let snapshot = state.snapshot();

    if let Some(run) = snapshot
        .running
        .values()
        .find(|run| run.issue_identifier == issue_identifier)
    {
        return Json(IssueResponseEnvelope {
            issue: IssueProjection {
                issue_id: run.issue_id.clone(),
                issue_identifier: run.issue_identifier.clone(),
                status: "running",
                attempt: run.attempt,
                error: run.error.clone(),
                worker_host: run.worker_host.clone(),
                workspace_path: Some(run.workspace_path.clone()),
            },
        })
        .into_response();
    }

    if let Some(retry) = snapshot
        .retry_queue
        .iter()
        .find(|retry| retry.identifier == issue_identifier)
    {
        return Json(IssueResponseEnvelope {
            issue: IssueProjection {
                issue_id: retry.issue_id.clone(),
                issue_identifier: retry.identifier.clone(),
                status: "retry",
                attempt: Some(retry.attempt),
                error: retry.error.clone(),
                worker_host: retry.worker_host.clone(),
                workspace_path: retry.workspace_path.clone(),
            },
        })
        .into_response();
    }

    tracing::info!(
        event = "http_issue_not_found",
        issue_identifier = issue_identifier,
        "issue lookup failed in HTTP API"
    );

    (
        StatusCode::NOT_FOUND,
        Json(ApiErrorEnvelope {
            error: ApiError {
                code: "issue_not_found",
                message: format!("Issue identifier '{}' was not found", issue_identifier),
                status: StatusCode::NOT_FOUND.as_u16(),
            },
        }),
    )
        .into_response()
}

async fn post_refresh(State(state): State<HttpServerState>) -> impl IntoResponse {
    let outcome = state.request_refresh();

    if outcome.coalesced {
        tracing::info!(
            event = "http_refresh_coalesced",
            pending_requests = outcome.pending_requests,
            "HTTP refresh request coalesced with existing pending refresh"
        );
    } else {
        tracing::info!(
            event = "http_refresh_requested",
            pending_requests = outcome.pending_requests,
            "HTTP refresh request queued"
        );
    }

    (
        StatusCode::ACCEPTED,
        Json(RefreshResponse {
            queued: outcome.queued,
            coalesced: outcome.coalesced,
            pending_requests: outcome.pending_requests,
        }),
    )
}

async fn api_not_found(uri: Uri) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(ApiErrorEnvelope {
            error: ApiError {
                code: "not_found",
                message: format!("No route found for {}", uri.path()),
                status: StatusCode::NOT_FOUND.as_u16(),
            },
        }),
    )
}

async fn api_method_not_allowed(method: Method, uri: Uri) -> impl IntoResponse {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        Json(ApiErrorEnvelope {
            error: ApiError {
                code: "method_not_allowed",
                message: format!("Method {} is not allowed for {}", method, uri.path()),
                status: StatusCode::METHOD_NOT_ALLOWED.as_u16(),
            },
        }),
    )
}

fn looks_like_issue_identifier(candidate: &str) -> bool {
    let mut parts = candidate.split('-');
    let Some(prefix) = parts.next() else {
        return false;
    };
    let Some(number) = parts.next() else {
        return false;
    };
    if parts.next().is_some() {
        return false;
    }

    !prefix.is_empty()
        && prefix.chars().all(|c| c.is_ascii_uppercase())
        && !number.is_empty()
        && number.chars().all(|c| c.is_ascii_digit())
}
