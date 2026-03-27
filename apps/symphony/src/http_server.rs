use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{close_code, CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{Method, StatusCode, Uri};
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;

use crate::domain::{
    CodexTotals, EventFilter, EventKind, EventSeverity, OrchestratorSnapshot, PendingEscalation,
    PollingSnapshot, RefreshRequestOutcome, RetrySnapshotEntry, RunAttempt, RunningSessionSnapshot,
    SymphonyEventEnvelope, WorkerSessionInfo,
};
use crate::event_stream::EventHub;
use crate::orchestrator::{
    EscalationRegistry, EscalationResolveResult, RefreshSender, SnapshotHandle,
};

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

// ── Event hub + HTTP server state ──────────────────────────────────────

const DEFAULT_WS_HEARTBEAT_INTERVAL_MS: u64 = 5_000;
const DEFAULT_WS_CLIENT_QUEUE_CAPACITY: usize = 64;
const DEFAULT_WS_BACKPRESSURE_DROP_THRESHOLD: u64 = 1;
const WS_CLOSE_ENQUEUE_TIMEOUT_MS: u64 = 1_000;

#[derive(Debug, Clone)]
pub struct EventStreamConfig {
    pub heartbeat_interval: Duration,
    pub client_queue_capacity: usize,
    pub backpressure_drop_threshold: u64,
    /// Test-only seam to make slow-consumer behavior deterministic.
    pub writer_send_delay: Option<Duration>,
}

impl Default for EventStreamConfig {
    fn default() -> Self {
        Self {
            heartbeat_interval: Duration::from_millis(DEFAULT_WS_HEARTBEAT_INTERVAL_MS),
            client_queue_capacity: DEFAULT_WS_CLIENT_QUEUE_CAPACITY,
            backpressure_drop_threshold: DEFAULT_WS_BACKPRESSURE_DROP_THRESHOLD,
            writer_send_delay: None,
        }
    }
}

#[derive(Default)]
struct EventStreamCounters {
    connected: AtomicU64,
    disconnected: AtomicU64,
    dropped: AtomicU64,
    heartbeat: AtomicU64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct EventStreamCounterSnapshot {
    pub connected: u64,
    pub disconnected: u64,
    pub dropped: u64,
    pub heartbeat: u64,
}

#[derive(Clone)]
pub struct HttpServerState {
    snapshot_source: Arc<dyn SnapshotSource>,
    refresh_control: Arc<dyn RefreshControl>,
    escalation_registry: EscalationRegistry,
    event_hub: EventHub,
    event_stream_config: EventStreamConfig,
    event_stream_counters: Arc<EventStreamCounters>,
    next_client_id: Arc<AtomicU64>,
}

impl HttpServerState {
    pub fn new(
        snapshot_source: Arc<dyn SnapshotSource>,
        refresh_control: Arc<dyn RefreshControl>,
        escalation_registry: EscalationRegistry,
    ) -> Self {
        Self::with_event_stream(
            snapshot_source,
            refresh_control,
            escalation_registry,
            EventHub::default_hub(),
            EventStreamConfig::default(),
        )
    }

    pub fn with_event_stream(
        snapshot_source: Arc<dyn SnapshotSource>,
        refresh_control: Arc<dyn RefreshControl>,
        escalation_registry: EscalationRegistry,
        event_hub: EventHub,
        event_stream_config: EventStreamConfig,
    ) -> Self {
        Self {
            snapshot_source,
            refresh_control,
            escalation_registry,
            event_hub,
            event_stream_config,
            event_stream_counters: Arc::new(EventStreamCounters::default()),
            next_client_id: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn snapshot(&self) -> OrchestratorSnapshot {
        self.snapshot_source.snapshot()
    }

    pub fn request_refresh(&self) -> RefreshRequestOutcome {
        self.refresh_control.request_refresh()
    }

    pub fn resolve_escalation(
        &self,
        request_id: &str,
        response: serde_json::Value,
        responder_id: Option<String>,
    ) -> EscalationResolveResult {
        self.escalation_registry.resolve(
            request_id,
            crate::domain::EscalationResponse {
                request_id: request_id.to_string(),
                response,
                responder_id,
                responded_at: Utc::now(),
            },
        )
    }

    pub fn pending_escalations(&self) -> Vec<PendingEscalation> {
        self.escalation_registry.pending_snapshot()
    }

    pub fn event_hub(&self) -> EventHub {
        self.event_hub.clone()
    }

    pub fn event_stream_config(&self) -> EventStreamConfig {
        self.event_stream_config.clone()
    }

    pub fn next_client_id(&self) -> u64 {
        self.next_client_id.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn increment_connected(&self) -> u64 {
        self.event_stream_counters
            .connected
            .fetch_add(1, Ordering::SeqCst)
            + 1
    }

    pub fn increment_disconnected(&self) -> u64 {
        self.event_stream_counters
            .disconnected
            .fetch_add(1, Ordering::SeqCst)
            + 1
    }

    pub fn increment_dropped(&self, delta: u64) -> u64 {
        self.event_stream_counters
            .dropped
            .fetch_add(delta, Ordering::SeqCst)
            + delta
    }

    pub fn increment_heartbeat(&self) -> u64 {
        self.event_stream_counters
            .heartbeat
            .fetch_add(1, Ordering::SeqCst)
            + 1
    }

    pub fn event_stream_counters(&self) -> EventStreamCounterSnapshot {
        EventStreamCounterSnapshot {
            connected: self.event_stream_counters.connected.load(Ordering::SeqCst),
            disconnected: self
                .event_stream_counters
                .disconnected
                .load(Ordering::SeqCst),
            dropped: self.event_stream_counters.dropped.load(Ordering::SeqCst),
            heartbeat: self.event_stream_counters.heartbeat.load(Ordering::SeqCst),
        }
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
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
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
    pending_escalations: Vec<PendingEscalation>,
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

#[derive(Debug, Deserialize)]
struct EscalationRespondRequest {
    response: serde_json::Value,
    #[serde(default)]
    responder_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct EscalationPendingResponse {
    pending: Vec<PendingEscalation>,
}

#[derive(Debug, Serialize)]
struct RefreshResponse {
    queued: bool,
    coalesced: bool,
    pending_requests: u64,
}

#[derive(Debug, Deserialize, Default)]
struct EventFilterQuery {
    issue: Option<String>,
    #[serde(rename = "type")]
    event_type: Option<String>,
    severity: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventFilterError {
    pub field: &'static str,
    pub value: String,
    pub message: String,
}

impl EventFilterError {
    fn to_api_error(&self) -> ApiErrorEnvelope {
        ApiErrorEnvelope {
            error: ApiError {
                code: "invalid_filter",
                message: self.message.clone(),
                status: StatusCode::BAD_REQUEST.as_u16(),
                details: Some(serde_json::json!({
                    "field": self.field,
                    "value": self.value,
                })),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WsCloseReason {
    ClientClosed,
    Backpressure,
    ServerShutdown,
    ProtocolError,
}

impl WsCloseReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::ClientClosed => "client_closed",
            Self::Backpressure => "backpressure",
            Self::ServerShutdown => "server_shutdown",
            Self::ProtocolError => "protocol_error",
        }
    }

    fn close_frame(self) -> CloseFrame {
        match self {
            Self::ClientClosed => CloseFrame {
                code: close_code::NORMAL,
                reason: "client_closed".into(),
            },
            Self::Backpressure => CloseFrame {
                code: close_code::POLICY,
                reason: "backpressure".into(),
            },
            Self::ServerShutdown => CloseFrame {
                code: close_code::RESTART,
                reason: "server_shutdown".into(),
            },
            Self::ProtocolError => CloseFrame {
                code: close_code::PROTOCOL,
                reason: "protocol_error".into(),
            },
        }
    }
}

enum OutboundMessage {
    Envelope(SymphonyEventEnvelope),
    Pong(Vec<u8>),
    Close(WsCloseReason),
}

// ── Router ─────────────────────────────────────────────────────────────

pub fn build_router(state: HttpServerState) -> Router {
    Router::new()
        .route("/", get(get_dashboard))
        .route("/api/v1/state", get(get_state))
        .route("/api/v1/events", get(get_events))
        .route("/api/v1/escalations", get(get_escalations))
        .route(
            "/api/v1/escalations/{request_id}/respond",
            post(post_escalation_respond),
        )
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
    let escalation_count = snapshot.pending_escalations.len();
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
    <section class="card"><div class="label">escalations</div><div class="value" id="escalation-count">{escalation_count}</div></section>
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
    <h2>Pending Escalations</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Issue</th>
            <th>Method</th>
            <th>Question Preview</th>
            <th>Waiting</th>
            <th>Timeout</th>
          </tr>
        </thead>
        <tbody id="escalation-table-body">
          <tr><td class="muted" colspan="5">Loading...</td></tr>
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

    function renderEscalationTable(escalations, running) {{
      const rows = Array.isArray(escalations) ? escalations.slice() : [];
      const runningRows = running && typeof running === 'object' ? Object.values(running) : [];

      rows.sort(function(a, b) {{
        return Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
      }});

      if (rows.length === 0) {{
        return '<tr><td class="muted" colspan="5">No pending escalations.</td></tr>';
      }}

      return rows.map(function(entry) {{
        const createdAt = Date.parse(entry.created_at || '');
        const waitingMs = Number.isFinite(createdAt) ? Math.max(0, Date.now() - createdAt) : null;
        const timeoutMs = Number(entry.timeout_ms ?? 0);
        const remainingMs = timeoutMs > 0 && waitingMs !== null ? Math.max(0, timeoutMs - waitingMs) : null;
        const timeoutLabel = remainingMs === null
          ? 'n/a'
          : (remainingMs === 0 ? 'expired' : ('expires in ' + formatDuration(remainingMs)));

        const label = entry.issue_identifier || entry.issue_id || '-';
        const relatedRun = runningRows.find(function(run) {{
          return run && run.issue_id === entry.issue_id;
        }});
        const issueUrl = relatedRun && typeof relatedRun.issue_url === 'string' ? relatedRun.issue_url : null;
        const issueCell = issueUrl
          ? '⚠️ <a href="' + escapeHtml(issueUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>'
          : '⚠️ ' + escapeHtml(label);

        return '<tr>' +
          '<td class="mono">' + issueCell + '</td>' +
          '<td class="mono">' + escapeHtml(entry.method || '-') + '</td>' +
          '<td>' + escapeHtml(entry.preview || '-') + '</td>' +
          '<td class="mono">' + escapeHtml(waitingMs === null ? 'n/a' : formatTimeAgo(waitingMs)) + '</td>' +
          '<td class="mono">' + escapeHtml(timeoutLabel) + '</td>' +
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
        const pendingEscalations = state.pending_escalations || [];
        const retryQueue = state.retry_queue || [];
        const completed = state.completed || [];

        document.getElementById('running-count').textContent = Object.keys(running).length;
        document.getElementById('escalation-count').textContent = pendingEscalations.length;
        document.getElementById('retry-count').textContent = retryQueue.length;
        document.getElementById('claimed-count').textContent = (state.claimed || []).length;
        document.getElementById('completed-count').textContent = completed.length;
        document.getElementById('linear-project-card').innerHTML =
          renderLinearProjectCard(state.linear_project_url);
        document.getElementById('running-table-body').innerHTML = renderRunningTable(
          running,
          state.running_session_info || {{}}
        );
        document.getElementById('escalation-table-body').innerHTML = renderEscalationTable(pendingEscalations, running);
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
        pending_escalations: snapshot.pending_escalations,
        completed: snapshot.completed,
        codex_totals: snapshot.codex_totals,
        codex_rate_limits: snapshot.codex_rate_limits.map(|r| r.data),
        polling: snapshot.polling,
    })
}

async fn get_escalations(State(state): State<HttpServerState>) -> impl IntoResponse {
    Json(EscalationPendingResponse {
        pending: state.pending_escalations(),
    })
}

async fn post_escalation_respond(
    Path(request_id): Path<String>,
    State(state): State<HttpServerState>,
    Json(body): Json<EscalationRespondRequest>,
) -> impl IntoResponse {
    let result = state.resolve_escalation(&request_id, body.response, body.responder_id);

    match result {
        EscalationResolveResult::Resolved => {
            (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
        }
        EscalationResolveResult::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "escalation_not_found" })),
        )
            .into_response(),
        EscalationResolveResult::AlreadyResolved => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "escalation_already_resolved" })),
        )
            .into_response(),
    }
}

async fn get_events(
    ws: WebSocketUpgrade,
    Query(query): Query<EventFilterQuery>,
    State(state): State<HttpServerState>,
) -> impl IntoResponse {
    let filter = match parse_event_filter(&query) {
        Ok(filter) => filter,
        Err(err) => {
            return (StatusCode::BAD_REQUEST, Json(err.to_api_error())).into_response();
        }
    };

    ws.on_upgrade(move |socket| handle_events_socket(socket, state, filter))
}

async fn handle_events_socket(socket: WebSocket, state: HttpServerState, filter: EventFilter) {
    let client_id = state.next_client_id();
    let connected_count = state.increment_connected();
    tracing::info!(
        event = "ws_client_connected",
        client_id,
        connected = connected_count,
        filter = ?filter,
        "event stream websocket client connected"
    );

    let event_hub = state.event_hub();
    let config = state.event_stream_config();
    let mut broadcast_rx = event_hub.subscribe();

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (outbound_tx, mut outbound_rx) =
        tokio::sync::mpsc::channel::<OutboundMessage>(config.client_queue_capacity.max(1));

    let writer_send_delay = config.writer_send_delay;
    let writer_task = tokio::spawn(async move {
        while let Some(message) = outbound_rx.recv().await {
            match message {
                OutboundMessage::Envelope(envelope) => {
                    if let Some(delay) = writer_send_delay {
                        tokio::time::sleep(delay).await;
                    }
                    let payload = match serde_json::to_string(&envelope) {
                        Ok(payload) => payload,
                        Err(err) => {
                            tracing::warn!(
                                event = "ws_serialize_failed",
                                error = %err,
                                "failed to serialize websocket event envelope"
                            );
                            continue;
                        }
                    };
                    if ws_sender.send(Message::Text(payload.into())).await.is_err() {
                        break;
                    }
                }
                OutboundMessage::Pong(payload) => {
                    if ws_sender.send(Message::Pong(payload.into())).await.is_err() {
                        break;
                    }
                }
                OutboundMessage::Close(reason) => {
                    let _ = ws_sender
                        .send(Message::Close(Some(reason.close_frame())))
                        .await;
                    break;
                }
            }
        }
    });

    let snapshot = state.snapshot();
    let snapshot_payload = serde_json::to_value(snapshot)
        .unwrap_or_else(|_| serde_json::json!({ "error": "snapshot_serialization_failed" }));
    let snapshot_envelope = SymphonyEventEnvelope::new(
        event_hub.next_sequence(),
        Utc::now(),
        EventKind::Snapshot,
        EventSeverity::Info,
        None,
        "snapshot",
        snapshot_payload,
    );

    let mut sent_count: u64 = 0;
    let mut dropped_count: u64 = 0;
    let mut close_reason = WsCloseReason::ClientClosed;

    if enqueue_event(
        &state,
        &outbound_tx,
        client_id,
        snapshot_envelope,
        &mut dropped_count,
        config.backpressure_drop_threshold,
    ) {
        sent_count = sent_count.saturating_add(1);
    } else {
        close_reason = WsCloseReason::Backpressure;
    }

    let mut heartbeat = tokio::time::interval(config.heartbeat_interval);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    while close_reason == WsCloseReason::ClientClosed {
        tokio::select! {
            incoming = ws_receiver.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => {
                        close_reason = WsCloseReason::ClientClosed;
                        break;
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if !enqueue_pong(
                            &state,
                            &outbound_tx,
                            client_id,
                            payload.to_vec(),
                            &mut dropped_count,
                        ) {
                            close_reason = WsCloseReason::Backpressure;
                            break;
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(err)) => {
                        tracing::warn!(
                            event = "ws_client_protocol_error",
                            client_id,
                            error = %err,
                            "websocket receive error"
                        );
                        close_reason = WsCloseReason::ProtocolError;
                        break;
                    }
                }
            }
            broadcast = broadcast_rx.recv() => {
                match broadcast {
                    Ok(envelope) => {
                        if filter.matches(&envelope) {
                            if enqueue_event(
                                &state,
                                &outbound_tx,
                                client_id,
                                envelope,
                                &mut dropped_count,
                                config.backpressure_drop_threshold,
                            ) {
                                sent_count = sent_count.saturating_add(1);
                            } else {
                                close_reason = WsCloseReason::Backpressure;
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        dropped_count = dropped_count.saturating_add(skipped);
                        let total_dropped = state.increment_dropped(skipped);
                        tracing::warn!(
                            event = "ws_event_dropped",
                            client_id,
                            reason = "lagged",
                            dropped = skipped,
                            dropped_total = dropped_count,
                            dropped_global = total_dropped,
                            "client lagged behind websocket event hub"
                        );
                        if dropped_count >= config.backpressure_drop_threshold {
                            close_reason = WsCloseReason::Backpressure;
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        close_reason = WsCloseReason::ServerShutdown;
                        break;
                    }
                }
            }
            _ = heartbeat.tick() => {
                let heartbeat_envelope = SymphonyEventEnvelope::new(
                    event_hub.next_sequence(),
                    Utc::now(),
                    EventKind::Heartbeat,
                    EventSeverity::Debug,
                    None,
                    "heartbeat",
                    serde_json::json!({ "client_id": client_id }),
                );

                if enqueue_event(
                    &state,
                    &outbound_tx,
                    client_id,
                    heartbeat_envelope,
                    &mut dropped_count,
                    config.backpressure_drop_threshold,
                ) {
                    sent_count = sent_count.saturating_add(1);
                    let heartbeat_count = state.increment_heartbeat();
                    tracing::debug!(
                        event = "ws_heartbeat_sent",
                        client_id,
                        heartbeat = heartbeat_count,
                        "websocket heartbeat sent"
                    );
                } else {
                    close_reason = WsCloseReason::Backpressure;
                    break;
                }
            }
        }
    }

    match tokio::time::timeout(
        Duration::from_millis(WS_CLOSE_ENQUEUE_TIMEOUT_MS),
        outbound_tx.send(OutboundMessage::Close(close_reason)),
    )
    .await
    {
        Ok(Ok(())) | Ok(Err(_)) => {}
        Err(_) => {
            tracing::warn!(
                event = "ws_close_enqueue_timeout",
                client_id,
                reason = close_reason.as_str(),
                timeout_ms = WS_CLOSE_ENQUEUE_TIMEOUT_MS,
                "timed out enqueueing websocket close frame; aborting writer task"
            );
            writer_task.abort();
        }
    }
    drop(outbound_tx);
    let _ = writer_task.await;

    let disconnected_count = state.increment_disconnected();
    tracing::info!(
        event = "ws_client_disconnected",
        client_id,
        reason = close_reason.as_str(),
        sent = sent_count,
        dropped = dropped_count,
        disconnected = disconnected_count,
        "event stream websocket client disconnected"
    );
}

fn enqueue_event(
    state: &HttpServerState,
    outbound_tx: &tokio::sync::mpsc::Sender<OutboundMessage>,
    client_id: u64,
    envelope: SymphonyEventEnvelope,
    dropped_count: &mut u64,
    drop_threshold: u64,
) -> bool {
    enqueue_outbound(
        state,
        outbound_tx,
        client_id,
        OutboundMessage::Envelope(envelope),
        dropped_count,
        drop_threshold,
        "queue_full",
    )
}

fn enqueue_pong(
    state: &HttpServerState,
    outbound_tx: &tokio::sync::mpsc::Sender<OutboundMessage>,
    client_id: u64,
    payload: Vec<u8>,
    dropped_count: &mut u64,
) -> bool {
    match outbound_tx.try_send(OutboundMessage::Pong(payload)) {
        Ok(()) => true,
        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
            *dropped_count = dropped_count.saturating_add(1);
            let global_dropped = state.increment_dropped(1);
            tracing::warn!(
                event = "ws_event_dropped",
                client_id,
                reason = "queue_full_pong",
                dropped_total = *dropped_count,
                dropped_global = global_dropped,
                should_close = true,
                "websocket pong frame dropped; closing connection"
            );
            false
        }
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => false,
    }
}

fn enqueue_outbound(
    state: &HttpServerState,
    outbound_tx: &tokio::sync::mpsc::Sender<OutboundMessage>,
    client_id: u64,
    message: OutboundMessage,
    dropped_count: &mut u64,
    drop_threshold: u64,
    drop_reason: &'static str,
) -> bool {
    let effective_drop_threshold = drop_threshold.max(1);

    match outbound_tx.try_send(message) {
        Ok(()) => true,
        Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
            *dropped_count = dropped_count.saturating_add(1);
            let global_dropped = state.increment_dropped(1);
            let should_close = *dropped_count >= effective_drop_threshold;
            tracing::warn!(
                event = "ws_event_dropped",
                client_id,
                reason = drop_reason,
                dropped_total = *dropped_count,
                dropped_global = global_dropped,
                drop_threshold = effective_drop_threshold,
                should_close,
                "websocket client outbound queue reached capacity"
            );
            !should_close
        }
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => false,
    }
}

pub fn parse_event_filter_contract(
    issue: Option<&str>,
    event_type: Option<&str>,
    severity: Option<&str>,
) -> Result<EventFilter, EventFilterError> {
    parse_event_filter(&EventFilterQuery {
        issue: issue.map(str::to_string),
        event_type: event_type.map(str::to_string),
        severity: severity.map(str::to_string),
    })
}

fn parse_event_filter(query: &EventFilterQuery) -> Result<EventFilter, EventFilterError> {
    let issues = parse_issue_filter(query.issue.as_deref())?;
    let kinds = parse_kind_filter(query.event_type.as_deref())?;
    let severities = parse_severity_filter(query.severity.as_deref())?;

    Ok(EventFilter {
        issues,
        kinds,
        severities,
    })
}

fn parse_issue_filter(raw: Option<&str>) -> Result<BTreeSet<String>, EventFilterError> {
    let Some(raw) = raw else {
        return Ok(BTreeSet::new());
    };

    let mut issues = BTreeSet::new();
    for token in raw.split(',') {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(EventFilterError {
                field: "issue",
                value: token.to_string(),
                message: "invalid issue filter: empty issue value".to_string(),
            });
        }

        let normalized = trimmed.to_ascii_uppercase();
        if !looks_like_issue_identifier(&normalized) {
            return Err(EventFilterError {
                field: "issue",
                value: token.to_string(),
                message: format!(
                    "invalid issue filter value '{trimmed}': expected TEAM-123 style identifier"
                ),
            });
        }
        issues.insert(normalized);
    }

    Ok(issues)
}

fn parse_kind_filter(raw: Option<&str>) -> Result<BTreeSet<EventKind>, EventFilterError> {
    let Some(raw) = raw else {
        return Ok(BTreeSet::new());
    };

    let mut kinds = BTreeSet::new();
    for token in raw.split(',') {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(EventFilterError {
                field: "type",
                value: token.to_string(),
                message: "invalid type filter: empty event kind".to_string(),
            });
        }

        let Some(kind) = EventKind::parse(trimmed) else {
            return Err(EventFilterError {
                field: "type",
                value: trimmed.to_string(),
                message: format!(
                    "invalid type filter value '{trimmed}'. Allowed values: {}",
                    EventKind::variants().join(",")
                ),
            });
        };
        kinds.insert(kind);
    }

    Ok(kinds)
}

fn parse_severity_filter(raw: Option<&str>) -> Result<BTreeSet<EventSeverity>, EventFilterError> {
    let Some(raw) = raw else {
        return Ok(BTreeSet::new());
    };

    let mut severities = BTreeSet::new();
    for token in raw.split(',') {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(EventFilterError {
                field: "severity",
                value: token.to_string(),
                message: "invalid severity filter: empty severity".to_string(),
            });
        }

        let Some(severity) = EventSeverity::parse(trimmed) else {
            return Err(EventFilterError {
                field: "severity",
                value: trimmed.to_string(),
                message: format!(
                    "invalid severity filter value '{trimmed}'. Allowed values: {}",
                    EventSeverity::variants().join(",")
                ),
            });
        };
        severities.insert(severity);
    }

    Ok(severities)
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
                details: None,
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
                details: None,
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
                details: None,
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

    #[test]
    fn event_filter_parsing_accepts_or_within_fields_and_and_across_fields() {
        let query = EventFilterQuery {
            issue: Some("KAT-1,kAt-2".to_string()),
            event_type: Some("worker,tool".to_string()),
            severity: Some("info,error".to_string()),
        };

        let filter = parse_event_filter(&query).expect("filter parsing should succeed");
        assert_eq!(
            filter.issues,
            BTreeSet::from(["KAT-1".to_string(), "KAT-2".to_string()])
        );
        assert_eq!(
            filter.kinds,
            BTreeSet::from([EventKind::Worker, EventKind::Tool])
        );
        assert_eq!(
            filter.severities,
            BTreeSet::from([EventSeverity::Info, EventSeverity::Error])
        );

        let matching = SymphonyEventEnvelope::new(
            1,
            Utc::now(),
            EventKind::Tool,
            EventSeverity::Info,
            Some("KAT-2".to_string()),
            "tool_call_completed",
            serde_json::json!({}),
        );
        assert!(filter.matches(&matching));

        let wrong_issue = SymphonyEventEnvelope::new(
            2,
            Utc::now(),
            EventKind::Tool,
            EventSeverity::Info,
            Some("KAT-9".to_string()),
            "tool_call_completed",
            serde_json::json!({}),
        );
        assert!(!filter.matches(&wrong_issue));

        let wrong_type = SymphonyEventEnvelope::new(
            3,
            Utc::now(),
            EventKind::Runtime,
            EventSeverity::Info,
            Some("KAT-2".to_string()),
            "dispatch",
            serde_json::json!({}),
        );
        assert!(!filter.matches(&wrong_type));

        let wrong_severity = SymphonyEventEnvelope::new(
            4,
            Utc::now(),
            EventKind::Worker,
            EventSeverity::Warn,
            Some("KAT-2".to_string()),
            "worker_stalled",
            serde_json::json!({}),
        );
        assert!(!filter.matches(&wrong_severity));
    }

    #[test]
    fn event_filter_parsing_rejects_unknown_type_with_deterministic_error() {
        let query = EventFilterQuery {
            issue: None,
            event_type: Some("worker,wat".to_string()),
            severity: None,
        };

        let err = parse_event_filter(&query).expect_err("unknown event type should fail");
        assert_eq!(err.field, "type");
        assert_eq!(err.value, "wat");
        assert!(
            err.message
                .contains("Allowed values: snapshot,runtime,worker,tool,heartbeat"),
            "error should list deterministic allowed values"
        );
    }
}
