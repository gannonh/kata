use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::{Method, StatusCode, Uri};
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use serde_json::json;
use tokio::net::TcpListener;

use crate::domain::{OrchestratorSnapshot, RefreshRequestOutcome};
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

// ── Error Envelope ─────────────────────────────────────────────────────

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

// ── Router ─────────────────────────────────────────────────────────────

pub fn build_router(state: HttpServerState) -> Router {
    Router::new()
        .route("/", get(get_dashboard_stub))
        .route("/api/v1/state", get(get_state_stub))
        .route("/api/v1/{issue_identifier}", get(get_issue_stub))
        .route("/api/v1/refresh", post(post_refresh_stub))
        .fallback(api_not_found_stub)
        .method_not_allowed_fallback(api_method_not_allowed_stub)
        .with_state(state)
}

pub async fn start_http_server(state: HttpServerState, port: u16, host: &str) -> std::io::Result<()> {
    let listener = TcpListener::bind(format!("{host}:{port}")).await?;
    axum::serve(listener, build_router(state)).await
}

// ── Route Handlers (stubs — implemented in T03) ───────────────────────

async fn get_dashboard_stub(State(_state): State<HttpServerState>) -> impl IntoResponse {
    Html("<html><body><h1>TODO: dashboard</h1></body></html>")
}

async fn get_state_stub(State(_state): State<HttpServerState>) -> impl IntoResponse {
    Json(json!({ "status": "todo" }))
}

async fn get_issue_stub(
    State(_state): State<HttpServerState>,
    Path(issue_identifier): Path<String>,
) -> impl IntoResponse {
    Json(json!({
        "status": "todo",
        "issue_identifier": issue_identifier,
    }))
}

async fn post_refresh_stub(State(_state): State<HttpServerState>) -> impl IntoResponse {
    (
        StatusCode::ACCEPTED,
        Json(json!({
            "queued": false,
            "coalesced": false,
            "pending_requests": 0,
        })),
    )
}

async fn api_not_found_stub(uri: Uri) -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(ApiErrorEnvelope {
            error: ApiError {
                code: "todo_not_found",
                message: format!("No route implemented for {}", uri.path()),
                status: StatusCode::NOT_FOUND.as_u16(),
            },
        }),
    )
}

async fn api_method_not_allowed_stub(method: Method, uri: Uri) -> impl IntoResponse {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        Json(ApiErrorEnvelope {
            error: ApiError {
                code: "todo_method_not_allowed",
                message: format!("Method {} not implemented for {}", method, uri.path()),
                status: StatusCode::METHOD_NOT_ALLOWED.as_u16(),
            },
        }),
    )
}
