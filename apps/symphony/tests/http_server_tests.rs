use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::body::{Body, to_bytes};
use axum::http::{Method, Request, StatusCode};
use chrono::{TimeZone, Utc};
use serde_json::{Value, json};
use symphony::domain::{
    CodexTotals, OrchestratorSnapshot, PollingSnapshot, RateLimitInfo, RetrySnapshotEntry,
    RunAttempt,
};
use symphony::http_server::{
    HttpServerState, RefreshControl, RefreshRequestOutcome, SnapshotSource, build_router,
};
use tower::ServiceExt;

#[derive(Clone)]
struct StaticSnapshotSource {
    snapshot: OrchestratorSnapshot,
}

impl SnapshotSource for StaticSnapshotSource {
    fn snapshot(&self) -> OrchestratorSnapshot {
        self.snapshot.clone()
    }
}

#[derive(Default)]
struct FakeRefreshControl {
    requests: AtomicUsize,
}

impl RefreshControl for FakeRefreshControl {
    fn request_refresh(&self) -> RefreshRequestOutcome {
        let request_idx = self.requests.fetch_add(1, Ordering::SeqCst);
        if request_idx == 0 {
            RefreshRequestOutcome {
                queued: true,
                coalesced: false,
                pending_requests: 1,
            }
        } else {
            RefreshRequestOutcome {
                queued: false,
                coalesced: true,
                pending_requests: 1,
            }
        }
    }
}

fn fixture_snapshot() -> OrchestratorSnapshot {
    let started_at = Utc
        .with_ymd_and_hms(2026, 3, 19, 12, 0, 0)
        .single()
        .expect("fixture timestamp should be valid");

    OrchestratorSnapshot {
        poll_interval_ms: 30_000,
        max_concurrent_agents: 4,
        running: {
            let mut running = BTreeMap::new();
            running.insert(
                "issue-123".to_string(),
                RunAttempt {
                    issue_id: "issue-123".to_string(),
                    issue_identifier: "SIM-123".to_string(),
                    attempt: Some(2),
                    workspace_path: "/tmp/symphony/issue-123".to_string(),
                    started_at,
                    status: "running".to_string(),
                    error: None,
                    worker_host: Some("worker-a".to_string()),
                },
            );
            running
        },
        claimed: BTreeSet::from(["issue-123".to_string()]),
        retry_queue: vec![RetrySnapshotEntry {
            issue_id: "issue-777".to_string(),
            identifier: "SIM-777".to_string(),
            attempt: 3,
            due_in_ms: 9_500,
            error: Some("agent exited: :boom".to_string()),
            worker_host: Some("worker-b".to_string()),
            workspace_path: Some("/tmp/symphony/issue-777".to_string()),
        }],
        completed: BTreeSet::from(["issue-001".to_string()]),
        codex_totals: CodexTotals {
            input_tokens: 120,
            output_tokens: 80,
            total_tokens: 200,
            seconds_running: 42.5,
        },
        codex_rate_limits: Some(RateLimitInfo {
            data: json!({
                "remaining": 88,
                "limit": 100,
                "reset_at": "2026-03-19T12:05:00Z"
            }),
        }),
        polling: PollingSnapshot {
            checking: false,
            next_poll_in_ms: 5_000,
            poll_interval_ms: 30_000,
        },
    }
}

fn test_router() -> axum::Router {
    let state = HttpServerState::new(
        Arc::new(StaticSnapshotSource {
            snapshot: fixture_snapshot(),
        }),
        Arc::new(FakeRefreshControl::default()),
    );

    build_router(state)
}

async fn body_text(response: axum::response::Response) -> String {
    let bytes = to_bytes(response.into_body(), 1024 * 1024)
        .await
        .expect("response body should be readable");
    String::from_utf8(bytes.to_vec()).expect("response body should be utf-8")
}

async fn body_json(response: axum::response::Response) -> Value {
    let text = body_text(response).await;
    serde_json::from_str(&text).expect("response body should be valid JSON")
}

#[tokio::test]
async fn test_get_root_returns_html_dashboard_shell_with_state_sections() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();

    assert!(
        content_type.starts_with("text/html"),
        "dashboard endpoint must return HTML content-type"
    );

    let body = body_text(response).await;

    assert!(
        body.contains("Symphony Dashboard"),
        "dashboard shell should include visible product heading"
    );
    assert!(
        body.contains("running"),
        "dashboard shell should include running section"
    );
    assert!(
        body.contains("retry"),
        "dashboard shell should include retry diagnostics section"
    );
}

#[tokio::test]
async fn test_get_api_state_returns_snapshot_projection() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/state")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);

    let payload = body_json(response).await;

    assert_eq!(payload["running"]["issue-123"]["issue_identifier"], "SIM-123");
    assert_eq!(payload["retry_queue"][0]["identifier"], "SIM-777");
    assert_eq!(payload["codex_totals"]["total_tokens"], 200);
    assert_eq!(payload["codex_rate_limits"]["remaining"], 88);
    assert_eq!(payload["polling"]["next_poll_in_ms"], 5_000);
}

#[tokio::test]
async fn test_get_issue_returns_projection_for_known_issue_identifier() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/SIM-123")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);

    let payload = body_json(response).await;

    assert_eq!(payload["issue"]["issue_identifier"], "SIM-123");
    assert_eq!(payload["issue"]["issue_id"], "issue-123");
    assert_eq!(payload["issue"]["status"], "running");
}

#[tokio::test]
async fn test_get_issue_returns_not_found_envelope_for_unknown_identifier() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/SIM-999")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let payload = body_json(response).await;

    assert_eq!(payload["error"]["code"], "issue_not_found");
    assert_eq!(payload["error"]["status"], 404);
    assert!(
        payload["error"]["message"]
            .as_str()
            .unwrap_or_default()
            .contains("SIM-999"),
        "issue-not-found message should include requested identifier"
    );
}

#[tokio::test]
async fn test_post_refresh_reports_queued_then_coalesced_state() {
    let app = test_router();

    let first = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/refresh")
                .body(Body::empty())
                .expect("first request should build"),
        )
        .await
        .expect("router should respond to first refresh");

    assert_eq!(first.status(), StatusCode::ACCEPTED);
    let first_payload = body_json(first).await;
    assert_eq!(first_payload["queued"], true);
    assert_eq!(first_payload["coalesced"], false);
    assert_eq!(first_payload["pending_requests"], 1);

    let second = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/refresh")
                .body(Body::empty())
                .expect("second request should build"),
        )
        .await
        .expect("router should respond to second refresh");

    assert_eq!(second.status(), StatusCode::ACCEPTED);
    let second_payload = body_json(second).await;
    assert_eq!(second_payload["queued"], false);
    assert_eq!(second_payload["coalesced"], true);
    assert_eq!(second_payload["pending_requests"], 1);
}

#[tokio::test]
async fn test_unknown_api_path_returns_json_404_error_envelope() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/does-not-exist")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);

    let payload = body_json(response).await;

    assert_eq!(payload["error"]["code"], "not_found");
    assert_eq!(payload["error"]["status"], 404);
    assert!(
        payload["error"]["message"]
            .as_str()
            .unwrap_or_default()
            .contains("/api/v1/does-not-exist"),
        "404 envelope should include unmatched path"
    );
}

#[tokio::test]
async fn test_wrong_method_on_known_api_route_returns_json_405_error_envelope() {
    let app = test_router();

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::GET)
                .uri("/api/v1/refresh")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);

    let payload = body_json(response).await;

    assert_eq!(payload["error"]["code"], "method_not_allowed");
    assert_eq!(payload["error"]["status"], 405);
    assert!(
        payload["error"]["message"]
            .as_str()
            .unwrap_or_default()
            .contains("GET"),
        "405 envelope should include rejected method"
    );
}
