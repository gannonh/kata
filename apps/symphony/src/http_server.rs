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
    completed: std::collections::BTreeSet<String>,
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
    let total_tokens = snapshot.codex_totals.total_tokens;

    let rate_limit_block = snapshot
        .codex_rate_limits
        .as_ref()
        .map(|rate_limits| {
            serde_json::to_string_pretty(&rate_limits.data).unwrap_or_else(|_| "{}".to_string())
        })
        .unwrap_or_else(|| "{}".to_string());

    let html = format!(
        r#"<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Symphony Dashboard</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #10131a; color: #f1f5f9; margin: 0; padding: 24px; }}
    h1 {{ margin-top: 0; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 16px; }}
    .card {{ background: #1c2430; border: 1px solid #314154; border-radius: 10px; padding: 12px; }}
    .label {{ color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }}
    .value {{ font-size: 24px; font-weight: 700; margin-top: 4px; }}
    pre {{ white-space: pre-wrap; word-break: break-word; background: #0b1119; border: 1px solid #27354a; border-radius: 8px; padding: 10px; }}
  </style>
</head>
<body>
  <h1>Symphony Dashboard</h1>
  <div class=\"grid\">
    <section class=\"card\"><div class=\"label\">running</div><div class=\"value\" id=\"running-count\">{running_count}</div></section>
    <section class=\"card\"><div class=\"label\">retry</div><div class=\"value\" id=\"retry-count\">{retry_count}</div></section>
    <section class=\"card\"><div class=\"label\">claimed</div><div class=\"value\" id=\"claimed-count\">{claimed_count}</div></section>
    <section class=\"card\"><div class=\"label\">completed</div><div class=\"value\" id=\"completed-count\">{completed_count}</div></section>
    <section class=\"card\"><div class=\"label\">token_total</div><div class=\"value\" id=\"token-total\">{total_tokens}</div></section>
  </div>

  <section class=\"card\">
    <h2>Rate limits</h2>
    <pre id=\"rate-limits\">{rate_limit_block}</pre>
  </section>

  <section class=\"card\" style=\"margin-top: 12px;\">
    <h2>Live state</h2>
    <pre id=\"state-json\"></pre>
  </section>

  <script>
    async function refreshState() {{
      try {{
        const response = await fetch('/api/v1/state');
        if (!response.ok) throw new Error('state fetch failed: ' + response.status);
        const state = await response.json();
        document.getElementById('state-json').textContent = JSON.stringify(state, null, 2);
        document.getElementById('running-count').textContent = Object.keys(state.running || {{}}).length;
        document.getElementById('retry-count').textContent = (state.retry_queue || []).length;
        document.getElementById('claimed-count').textContent = (state.claimed || []).length;
        document.getElementById('completed-count').textContent = (state.completed || []).length;
        document.getElementById('token-total').textContent = state.codex_totals?.total_tokens ?? 0;
        document.getElementById('rate-limits').textContent = JSON.stringify(state.codex_rate_limits || {{}}, null, 2);
      }} catch (error) {{
        document.getElementById('state-json').textContent = String(error);
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
