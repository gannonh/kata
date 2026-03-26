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
    RunAttempt, RunningSessionSnapshot, WorkerSessionInfo,
};
use crate::orchestrator::{RefreshSender, SnapshotHandle};

pub const HTTP_PORT_RETRY_LIMIT: u16 = 10;

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
    linear_project_url: Option<String>,
    running: std::collections::BTreeMap<String, RunAttempt>,
    running_sessions: std::collections::BTreeMap<String, RunningSessionSnapshot>,
    running_session_info: std::collections::BTreeMap<String, WorkerSessionInfo>,
    claimed: std::collections::BTreeSet<String>,
    retry_queue: Vec<RetrySnapshotEntry>,
    blocked: Vec<crate::domain::BlockedIssueEntry>,
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
    listener: TcpListener,
    host: &str,
    configured_port: u16,
    bound_port: u16,
) -> std::io::Result<()> {
    tracing::info!(
        event = "http_server_started",
        host = host,
        configured_port,
        port = bound_port,
        "HTTP observability server started"
    );
    axum::serve(listener, build_router(state)).await
}

pub async fn bind_http_listener_with_fallback(
    host: &str,
    configured_port: u16,
    max_port_offset: u16,
) -> std::io::Result<(TcpListener, u16)> {
    if configured_port == 0 {
        let listener = TcpListener::bind(format!("{host}:0")).await?;
        let bound_port = listener.local_addr()?.port();
        return Ok((listener, bound_port));
    }

    let mut attempt_port = configured_port;
    let max_port = configured_port.saturating_add(max_port_offset);

    loop {
        let bind_addr = format!("{host}:{attempt_port}");
        match TcpListener::bind(&bind_addr).await {
            Ok(listener) => {
                let bound_port = listener.local_addr()?.port();
                if attempt_port != configured_port {
                    tracing::warn!(
                        event = "http_server_port_auto_incremented",
                        host = host,
                        configured_port,
                        bound_port,
                        retries = attempt_port.saturating_sub(configured_port),
                        "Configured HTTP port was in use; bound the next available port"
                    );
                }
                return Ok((listener, bound_port));
            }
            Err(err) if err.kind() == std::io::ErrorKind::AddrInUse && attempt_port < max_port => {
                tracing::warn!(
                    event = "http_server_port_in_use_retry",
                    host = host,
                    configured_port,
                    attempted_port = attempt_port,
                    next_port = attempt_port + 1,
                    max_port,
                    "Configured HTTP port is in use; retrying on next port"
                );
                attempt_port += 1;
            }
            Err(err) => return Err(err),
        }
    }
}

// ── Route Handlers ─────────────────────────────────────────────────────

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

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
    let linear_project_card = snapshot
        .linear_project_url
        .as_deref()
        .map(|url| {
            let escaped_url = escape_html(url);
            format!(
                r#"<section class="card"><div class="label">linear project</div><div class="mono"><a id="linear-project-link" href="{escaped_url}" target="_blank" rel="noopener noreferrer">{escaped_url}</a></div></section>"#
            )
        })
        .unwrap_or_else(|| {
            r#"<section class="card"><div class="label">linear project</div><div class="mono muted">n/a</div></section>"#
                .to_string()
        });

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
    a {{ color: #93c5fd; }}
    a:hover {{ color: #bfdbfe; }}
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
    .stale-activity {{ color: #fca5a5; font-weight: 600; }}
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
    <div id="linear-project-card">{linear_project_card}</div>
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
            <th>Activity</th>
            <th>Attempt</th>
            <th>Turn</th>
            <th>Last Activity</th>
            <th>Elapsed</th>
            <th>Tokens</th>
            <th>Model</th>
            <th>Workspace</th>
            <th>Worker host</th>
          </tr>
        </thead>
        <tbody id="running-table-body">
          <tr><td class="muted" colspan="12">Loading...</td></tr>
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

  <section class="card section" id="blocked-section" style="display:none">
    <h2 style="color:#e6a817">Blocked issues</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>State</th>
            <th>Blocked by</th>
          </tr>
        </thead>
        <tbody id="blocked-table-body"></tbody>
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
    const STALE_ACTIVITY_THRESHOLD_MS = 120000;

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

    function formatTimeAgo(ms) {{
      const numeric = Number(ms);
      if (!Number.isFinite(numeric)) return 'n/a';
      if (numeric <= 0) return 'just now';
      const totalSeconds = Math.floor(numeric / 1000);
      if (totalSeconds < 60) return totalSeconds + 's ago';
      const totalMinutes = Math.floor(totalSeconds / 60);
      if (totalMinutes < 60) return totalMinutes + 'm ago';
      const totalHours = Math.floor(totalMinutes / 60);
      if (totalHours < 24) return totalHours + 'h ago';
      const totalDays = Math.floor(totalHours / 24);
      return totalDays + 'd ago';
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

    function renderRunningTable(running, sessionInfoByIssue) {{
      const rows = Object.entries(running || {{}}).sort(function(a, b) {{
        return String(a[1].issue_identifier || '').localeCompare(String(b[1].issue_identifier || ''));
      }});

      if (rows.length === 0) {{
        return '<tr><td class="muted" colspan="12">No running sessions.</td></tr>';
      }}

      return rows.map(function(entry) {{
        const issueId = entry[0];
        const run = entry[1];
        const sessionInfo = (sessionInfoByIssue && sessionInfoByIssue[issueId]) || {{}};
        const startedAt = Date.parse(run.started_at || '');
        const elapsed = Number.isFinite(startedAt) ? formatDuration(Date.now() - startedAt) : 'n/a';
        const attempt = run.attempt ?? 1;
        const maxTurns = Number(sessionInfo.max_turns);
        const turnCount = Number(sessionInfo.turn_count);
        const turnLabel = Number.isFinite(turnCount) && turnCount > 0
          ? String(turnCount) + '/' + (Number.isFinite(maxTurns) && maxTurns > 0 ? String(maxTurns) : '?')
          : 'n/a';
        const lastActivityValue = sessionInfo.last_activity_ms;
        const lastActivityMs = lastActivityValue != null ? Number(lastActivityValue) : NaN;
        const lastActivityAge = Number.isFinite(lastActivityMs) ? Math.max(0, Date.now() - lastActivityMs) : null;
        const lastActivityLabel = lastActivityAge === null ? 'n/a' : formatTimeAgo(lastActivityAge);
        const lastActivityClass = lastActivityAge !== null && lastActivityAge > STALE_ACTIVITY_THRESHOLD_MS
          ? 'mono stale-activity'
          : 'mono';
        const sessionTokens = sessionInfo.session_tokens || {{}};
        const tokenInput = Number(sessionTokens.input_tokens ?? 0);
        const tokenOutput = Number(sessionTokens.output_tokens ?? 0);
        const tokenTotal = Number(sessionTokens.total_tokens ?? 0);
        const tokenLabel = tokenInput + ' / ' + tokenOutput + ' / ' + tokenTotal;
        const toolName = sessionInfo.current_tool_name || '';
        const toolArgs = sessionInfo.current_tool_args_preview || '';
        const activityLabel = toolName ? 'tool: ' + toolName + (toolArgs ? ' (' + toolArgs + ')' : '') : '-';
        return '<tr>' +
          '<td class="mono">' + escapeHtml(run.issue_identifier || '-') + '</td>' +
          '<td>' + escapeHtml(run.linear_state || '-') + '</td>' +
          '<td>' + escapeHtml(run.status || '-') + '</td>' +
          '<td class="mono">' + escapeHtml(activityLabel) + '</td>' +
          '<td>' + escapeHtml(attempt) + '</td>' +
          '<td class="mono">' + escapeHtml(turnLabel) + '</td>' +
          '<td class="' + escapeHtml(lastActivityClass) + '">' + escapeHtml(lastActivityLabel) + '</td>' +
          '<td class="mono">' + escapeHtml(elapsed) + '</td>' +
          '<td class="mono">' + escapeHtml(tokenLabel) + '</td>' +
          '<td class="mono">' + escapeHtml(run.model || '-') + '</td>' +
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

    function renderLinearProjectCard(url) {{
      if (!url) {{
        return '<section class="card"><div class="label">linear project</div><div class="mono muted">n/a</div></section>';
      }}
      const escaped = escapeHtml(url);
      return '<section class="card"><div class="label">linear project</div><div class="mono"><a id="linear-project-link" href="' +
        escaped +
        '" target="_blank" rel="noopener noreferrer">' +
        escaped +
        '</a></div></section>';
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
        document.getElementById('linear-project-card').innerHTML =
          renderLinearProjectCard(state.linear_project_url);
        document.getElementById('running-table-body').innerHTML = renderRunningTable(
          running,
          state.running_session_info || {{}}
        );
        document.getElementById('retry-table-body').innerHTML = renderRetryTable(retryQueue);

        const blocked = state.blocked || [];
        const blockedSection = document.getElementById('blocked-section');
        if (blocked.length > 0) {{
          blockedSection.style.display = '';
          document.getElementById('blocked-table-body').innerHTML = blocked.map(function(entry) {{
            return '<tr><td>' + escapeHtml(entry.identifier) + '</td>'
              + '<td>' + escapeHtml(entry.title || '') + '</td>'
              + '<td>' + escapeHtml(entry.state || '') + '</td>'
              + '<td>' + escapeHtml((entry.blocker_identifiers || []).join(', ')) + '</td></tr>';
          }}).join('');
        }} else {{
          blockedSection.style.display = 'none';
        }}

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
        linear_project_url: snapshot.linear_project_url,
        running: snapshot.running,
        running_sessions: snapshot.running_sessions,
        running_session_info: snapshot.running_session_info,
        claimed: snapshot.claimed,
        retry_queue: snapshot.retry_queue,
        blocked: snapshot.blocked,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener as StdTcpListener;

    fn reserve_contiguous_ports(range_width: u16) -> (u16, Vec<StdTcpListener>) {
        for _ in 0..256 {
            let first = StdTcpListener::bind(("127.0.0.1", 0))
                .expect("should bind a seed loopback port for test");
            let base = first
                .local_addr()
                .expect("seed listener should expose local addr")
                .port();

            if u16::MAX - base < range_width {
                continue;
            }

            let mut listeners = vec![first];
            let mut all_reserved = true;
            for offset in 1..=range_width {
                match StdTcpListener::bind(("127.0.0.1", base + offset)) {
                    Ok(listener) => listeners.push(listener),
                    Err(_) => {
                        all_reserved = false;
                        break;
                    }
                }
            }

            if all_reserved {
                return (base, listeners);
            }
        }

        panic!("failed to reserve contiguous loopback ports for test");
    }

    #[tokio::test]
    async fn bind_http_listener_with_fallback_increments_when_configured_port_is_in_use() {
        const MAX_TEST_ATTEMPTS: usize = 5;

        for attempt in 1..=MAX_TEST_ATTEMPTS {
            // Reserve a full contiguous range first so retries are possible, then keep
            // only the configured port occupied while releasing fallback candidates.
            let (configured_port, mut listeners) = reserve_contiguous_ports(HTTP_PORT_RETRY_LIMIT);
            let occupied = listeners.remove(0);
            drop(listeners);

            match bind_http_listener_with_fallback(
                "127.0.0.1",
                configured_port,
                HTTP_PORT_RETRY_LIMIT,
            )
            .await
            {
                Ok((listener, bound_port)) => {
                    assert!(
                        bound_port > configured_port,
                        "bound port should move forward when configured port is taken: configured={configured_port}, bound={bound_port}"
                    );
                    assert!(
                        bound_port <= configured_port.saturating_add(HTTP_PORT_RETRY_LIMIT),
                        "bound port should remain within retry cap: configured={configured_port}, bound={bound_port}"
                    );
                    drop(occupied);
                    drop(listener);
                    return;
                }
                Err(err)
                    if err.kind() == std::io::ErrorKind::AddrInUse
                        && attempt < MAX_TEST_ATTEMPTS =>
                {
                    drop(occupied);
                }
                Err(err) => {
                    drop(occupied);
                    panic!(
                        "fallback bind should find an available nearby port (attempt {attempt}/{MAX_TEST_ATTEMPTS}): {err}"
                    );
                }
            }
        }

        panic!(
            "fallback bind should find an available nearby port after {MAX_TEST_ATTEMPTS} attempts"
        );
    }

    #[tokio::test]
    async fn bind_http_listener_with_fallback_errors_after_retry_cap_is_exhausted() {
        let (configured_port, listeners) = reserve_contiguous_ports(HTTP_PORT_RETRY_LIMIT);

        let err =
            bind_http_listener_with_fallback("127.0.0.1", configured_port, HTTP_PORT_RETRY_LIMIT)
                .await
                .expect_err("binding should fail when configured port and +10 range are occupied");
        assert_eq!(err.kind(), std::io::ErrorKind::AddrInUse);

        drop(listeners);
    }
}
