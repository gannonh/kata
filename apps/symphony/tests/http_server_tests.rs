use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Method, Request, StatusCode};
use chrono::{TimeZone, Utc};
use serde_json::{json, Value};
use symphony::domain::{
    BlockedIssueEntry, CodexTotals, CompletedEntry, OrchestratorSnapshot, PollingSnapshot,
    RateLimitInfo, RefreshRequestOutcome, RetrySnapshotEntry, RunAttempt, RunningSessionSnapshot,
    SessionTokenUsage, WorkerSessionInfo,
};
use symphony::http_server::{build_router, HttpServerState, RefreshControl, SnapshotSource};
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
        linear_project_url: Some("https://linear.app/kata-sh/project/symphony".to_string()),
        running: {
            let mut running = BTreeMap::new();
            running.insert(
                "issue-123".to_string(),
                RunAttempt {
                    issue_id: "issue-123".to_string(),
                    issue_identifier: "SIM-123".to_string(),
                    issue_title: None,
                    attempt: Some(2),
                    workspace_path: "/tmp/symphony/issue-123".to_string(),
                    started_at,
                    status: "running".to_string(),
                    error: None,
                    worker_host: Some("worker-a".to_string()),
                    model: None,
                    linear_state: None,
                    issue_url: None,
                },
            );
            running
        },
        running_sessions: {
            let mut sessions = BTreeMap::new();
            sessions.insert(
                "issue-123".to_string(),
                RunningSessionSnapshot {
                    turn_count: 2,
                    last_activity_at: Some(started_at),
                    total_tokens: 200,
                    last_event: Some("codex/event/task_started".to_string()),
                    last_event_message: Some("running cargo test".to_string()),
                    session_id: Some("session-12345678".to_string()),
                    current_tool_name: None,
                    current_tool_args_preview: None,
                },
            );
            sessions
        },
        running_session_info: BTreeMap::from([(
            "issue-123".to_string(),
            WorkerSessionInfo {
                turn_count: 3,
                max_turns: 20,
                stall_timeout_ms: 0,
                last_activity_ms: Some(started_at.timestamp_millis() + 70_000),
                session_tokens: SessionTokenUsage {
                    input_tokens: 35,
                    output_tokens: 12,
                    total_tokens: 47,
                },
                current_tool_name: None,
                current_tool_args_preview: None,
            },
        )]),
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
        completed: vec![CompletedEntry {
            issue_id: "issue-001".to_string(),
            identifier: "KAT-001".to_string(),
            title: "Completed issue".to_string(),
            completed_at: Some(chrono::Utc::now()),
        }],
        codex_totals: CodexTotals {
            input_tokens: 120,
            output_tokens: 80,
            total_tokens: 200,
            event_count: 55,
            seconds_running: 42.5,
        },
        blocked: vec![],
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
            last_poll_at: Some("2026-03-21T12:00:00Z".to_string()),
            poll_count: 42,
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
async fn test_get_root_returns_html_dashboard_shell_with_structured_sections() {
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
        body.contains("Running sessions"),
        "dashboard shell should include running sessions table section"
    );
    assert!(
        body.contains("<th>Turn</th>"),
        "running table should include the turn column header"
    );
    assert!(
        body.contains("<th>Last Activity</th>"),
        "running table should include the last activity column header"
    );
    assert!(
        body.contains("<th>Tokens</th>"),
        "running table should include the per-session token column header"
    );
    assert!(
        body.contains("stale-activity"),
        "dashboard script should include stale activity highlighting styles/logic"
    );
    assert!(
        body.contains("lastActivityValue != null ? Number(lastActivityValue) : NaN"),
        "dashboard script should treat null last_activity_ms as missing instead of coercing to 0"
    );
    assert!(
        body.contains("Retry queue"),
        "dashboard shell should include retry queue table section"
    );
    assert!(
        body.contains("Completed issues"),
        "dashboard shell should include completed issue list section"
    );
    assert!(
        body.contains("Token summary"),
        "dashboard shell should include token summary section"
    );
    assert!(
        body.contains(r#"id="linear-project-link""#),
        "dashboard shell should include clickable Linear project link in summary section"
    );
    assert!(
        body.contains("https://linear.app/kata-sh/project/symphony"),
        "dashboard shell should render the configured Linear project URL"
    );
    assert!(
        body.contains("Polling"),
        "dashboard shell should include polling section"
    );
    assert!(
        body.contains("Rate limits"),
        "dashboard shell should include rate-limit diagnostics section"
    );
    assert!(
        body.contains(r#"id="polling-next-poll">n/a"#),
        "dashboard shell should initialize next-poll tile with n/a placeholder"
    );
    assert!(
        body.contains(r#"id="polling-interval">n/a"#),
        "dashboard shell should initialize poll-interval tile with n/a placeholder"
    );
    assert!(
        !body.contains("Live state"),
        "dashboard shell should no longer expose the raw live-state section"
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

    assert_eq!(
        payload["running"]["issue-123"]["issue_identifier"],
        "SIM-123"
    );
    assert_eq!(
        payload["running_session_info"]["issue-123"]["turn_count"],
        3
    );
    assert_eq!(
        payload["running_session_info"]["issue-123"]["session_tokens"]["total_tokens"],
        47
    );
    assert_eq!(
        payload["running_sessions"]["issue-123"]["last_event"],
        "codex/event/task_started"
    );
    assert_eq!(
        payload["running_sessions"]["issue-123"]["last_event_message"],
        "running cargo test"
    );
    assert_eq!(
        payload["running_sessions"]["issue-123"]["session_id"],
        "session-12345678"
    );
    assert_eq!(payload["retry_queue"][0]["identifier"], "SIM-777");
    assert_eq!(payload["codex_totals"]["total_tokens"], 200);
    assert_eq!(payload["codex_rate_limits"]["remaining"], 88);
    assert_eq!(
        payload["linear_project_url"],
        "https://linear.app/kata-sh/project/symphony"
    );
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

#[tokio::test]
async fn test_dashboard_html_includes_blocked_section() {
    let mut snapshot = fixture_snapshot();
    snapshot.blocked = vec![BlockedIssueEntry {
        issue_id: "issue-blocked-1".to_string(),
        identifier: "SIM-100".to_string(),
        title: "Blocked task".to_string(),
        state: "Todo".to_string(),
        blocker_identifiers: vec!["SIM-99".to_string()],
    }];

    let source = StaticSnapshotSource { snapshot };
    let state = HttpServerState::new(Arc::new(source), Arc::new(FakeRefreshControl::default()));
    let app = build_router(state);

    let req = Request::builder().uri("/").body(Body::empty()).unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let html = String::from_utf8_lossy(&body);
    assert!(
        html.contains("Blocked issues"),
        "dashboard HTML should contain blocked issues section"
    );
}

#[tokio::test]
async fn test_state_json_includes_blocked_array() {
    let mut snapshot = fixture_snapshot();
    snapshot.blocked = vec![BlockedIssueEntry {
        issue_id: "issue-blocked-2".to_string(),
        identifier: "SIM-200".to_string(),
        title: "Another blocked".to_string(),
        state: "In Progress".to_string(),
        blocker_identifiers: vec!["SIM-198".to_string(), "SIM-199".to_string()],
    }];

    let source = StaticSnapshotSource { snapshot };
    let state = HttpServerState::new(Arc::new(source), Arc::new(FakeRefreshControl::default()));
    let app = build_router(state);

    let req = Request::builder()
        .uri("/api/v1/state")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    let blocked = payload["blocked"]
        .as_array()
        .expect("blocked should be an array");
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0]["identifier"], "SIM-200");
    assert_eq!(
        blocked[0]["blocker_identifiers"].as_array().unwrap().len(),
        2
    );
}
