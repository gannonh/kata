//! Comprehensive test suite for LinearClient, LinearAdapter, and normalization.
//!
//! Uses `mockito` to mock the Linear GraphQL endpoint — no live API calls.
//! Tests cover all verification items from S03-PLAN.md.

use mockito::{Mock, Server, ServerGuard};
use serde_json::{json, Value};
use symphony::domain::{ApiKey, TrackerConfig};
use symphony::error::SymphonyError;
use symphony::linear::adapter::{LinearAdapter, TrackerAdapter};
use symphony::linear::client::LinearClient;

// ═══════════════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════════════

/// Build a TrackerConfig pointing at the mock server.
fn test_config(server: &ServerGuard, assignee: Option<&str>) -> TrackerConfig {
    TrackerConfig {
        kind: Some("linear".to_string()),
        endpoint: server.url() + "/graphql",
        api_key: Some(ApiKey::new("test-api-key")),
        project_slug: Some("test-proj".to_string()),
        assignee: assignee.map(String::from),
        active_states: vec!["Todo".to_string(), "In Progress".to_string()],
        terminal_states: vec!["Done".to_string(), "Cancelled".to_string()],
    }
}

/// Build a LinearClient from a test config.
fn test_client(server: &ServerGuard, assignee: Option<&str>) -> LinearClient {
    LinearClient::new(test_config(server, assignee))
}

/// Build a LinearAdapter from a test config.
fn test_adapter(server: &ServerGuard, assignee: Option<&str>) -> LinearAdapter {
    LinearAdapter::new(test_client(server, assignee))
}

/// Build a mock issue JSON node with all fields populated.
fn full_issue_json(id: &str, identifier: &str) -> Value {
    json!({
        "id": id,
        "identifier": identifier,
        "title": format!("Issue {}", identifier),
        "description": format!("Description for {}", identifier),
        "priority": 2,
        "state": { "name": "In Progress" },
        "branchName": format!("feat/{}", id),
        "url": format!("https://linear.app/proj/issue/{}", identifier),
        "assignee": { "id": "user-abc" },
        "labels": {
            "nodes": [
                { "name": "Bug" },
                { "name": "URGENT" }
            ]
        },
        "inverseRelations": {
            "nodes": [
                {
                    "type": "blocks",
                    "issue": {
                        "id": "blocker-1",
                        "identifier": "PROJ-99",
                        "state": { "name": "Todo" }
                    }
                },
                {
                    "type": "relates_to",
                    "issue": {
                        "id": "related-1",
                        "identifier": "PROJ-50",
                        "state": { "name": "Done" }
                    }
                }
            ]
        },
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-16T14:00:00.000Z"
    })
}

/// Wrap issue nodes in a standard paginated GraphQL response.
fn paginated_response(nodes: Vec<Value>, has_next_page: bool, end_cursor: Option<&str>) -> Value {
    json!({
        "data": {
            "issues": {
                "nodes": nodes,
                "pageInfo": {
                    "hasNextPage": has_next_page,
                    "endCursor": end_cursor
                }
            }
        }
    })
}

/// Wrap issue nodes in a non-paginated GraphQL response (for ID-based fetch).
fn id_response(nodes: Vec<Value>) -> Value {
    json!({
        "data": {
            "issues": {
                "nodes": nodes
            }
        }
    })
}

/// Viewer query response.
fn viewer_response(viewer_id: &str) -> Value {
    json!({
        "data": {
            "viewer": {
                "id": viewer_id
            }
        }
    })
}

/// Create a mock for any POST to /graphql returning the given body.
async fn mock_graphql(server: &mut ServerGuard, response_body: &Value) -> Mock {
    server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(serde_json::to_string(response_body).unwrap())
        .create_async()
        .await
}

// ═══════════════════════════════════════════════════════════════════════
// Normalization tests
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_normalization_full_field_extraction() {
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1");
    let issue = normalize_issue(&raw, None).expect("should normalize");

    assert_eq!(issue.id, "id-1");
    assert_eq!(issue.identifier, "PROJ-1");
    assert_eq!(issue.title, "Issue PROJ-1");
    assert_eq!(issue.description.as_deref(), Some("Description for PROJ-1"));
    assert_eq!(issue.priority, Some(2));
    assert_eq!(issue.state, "In Progress");
    assert_eq!(issue.branch_name.as_deref(), Some("feat/id-1"));
    assert_eq!(
        issue.url.as_deref(),
        Some("https://linear.app/proj/issue/PROJ-1")
    );
    assert_eq!(issue.assignee_id.as_deref(), Some("user-abc"));
    assert!(issue.created_at.is_some());
    assert!(issue.updated_at.is_some());
}

#[tokio::test]
async fn test_normalization_labels_lowercase() {
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1");
    let issue = normalize_issue(&raw, None).unwrap();

    // "Bug" → "bug", "URGENT" → "urgent"
    assert_eq!(issue.labels, vec!["bug", "urgent"]);
}

#[tokio::test]
async fn test_normalization_blockers_filtered_by_type() {
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1");
    let issue = normalize_issue(&raw, None).unwrap();

    // Only "blocks" type relations should be included, not "relates_to"
    assert_eq!(issue.blocked_by.len(), 1);
    assert_eq!(issue.blocked_by[0].id.as_deref(), Some("blocker-1"));
    assert_eq!(issue.blocked_by[0].identifier.as_deref(), Some("PROJ-99"));
    assert_eq!(issue.blocked_by[0].state.as_deref(), Some("Todo"));
}

#[tokio::test]
async fn test_normalization_blocker_type_case_insensitive() {
    use symphony::linear::client::normalize_issue;

    let raw = json!({
        "id": "id-1",
        "identifier": "X-1",
        "title": "T",
        "state": { "name": "Todo" },
        "labels": { "nodes": [] },
        "inverseRelations": {
            "nodes": [
                {
                    "type": " Blocks ",
                    "issue": {
                        "id": "b-1",
                        "identifier": "X-99",
                        "state": { "name": "Open" }
                    }
                }
            ]
        }
    });

    let issue = normalize_issue(&raw, None).unwrap();
    assert_eq!(
        issue.blocked_by.len(),
        1,
        "should match ' Blocks ' (trimmed, case-insensitive)"
    );
}

#[tokio::test]
async fn test_normalization_priority_coercion() {
    use symphony::linear::client::normalize_issue;

    // Integer priority
    let raw_int = json!({
        "id": "id-1", "identifier": "X-1", "title": "T",
        "state": { "name": "Todo" }, "priority": 3,
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    assert_eq!(normalize_issue(&raw_int, None).unwrap().priority, Some(3));

    // String priority → None
    let raw_str = json!({
        "id": "id-2", "identifier": "X-2", "title": "T",
        "state": { "name": "Todo" }, "priority": "high",
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    assert_eq!(normalize_issue(&raw_str, None).unwrap().priority, None);

    // Null priority → None
    let raw_null = json!({
        "id": "id-3", "identifier": "X-3", "title": "T",
        "state": { "name": "Todo" }, "priority": null,
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    assert_eq!(normalize_issue(&raw_null, None).unwrap().priority, None);
}

#[tokio::test]
async fn test_normalization_datetime_parsing() {
    use symphony::linear::client::normalize_issue;

    // Valid datetimes
    let raw = json!({
        "id": "id-1", "identifier": "X-1", "title": "T",
        "state": { "name": "Todo" },
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-16T14:00:00.000Z",
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    let issue = normalize_issue(&raw, None).unwrap();
    assert!(issue.created_at.is_some());
    assert!(issue.updated_at.is_some());

    // Invalid datetime → None
    let raw_bad = json!({
        "id": "id-2", "identifier": "X-2", "title": "T",
        "state": { "name": "Todo" },
        "createdAt": "not-a-date",
        "updatedAt": null,
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    let issue_bad = normalize_issue(&raw_bad, None).unwrap();
    assert!(issue_bad.created_at.is_none());
    assert!(issue_bad.updated_at.is_none());
}

#[tokio::test]
async fn test_normalization_branch_name_mapping() {
    use symphony::linear::client::normalize_issue;

    // branchName present
    let raw = json!({
        "id": "id-1", "identifier": "X-1", "title": "T",
        "state": { "name": "Todo" }, "branchName": "feat/my-branch",
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    assert_eq!(
        normalize_issue(&raw, None).unwrap().branch_name.as_deref(),
        Some("feat/my-branch")
    );

    // branchName absent
    let raw_no_branch = json!({
        "id": "id-2", "identifier": "X-2", "title": "T",
        "state": { "name": "Todo" },
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });
    assert!(normalize_issue(&raw_no_branch, None)
        .unwrap()
        .branch_name
        .is_none());
}

#[tokio::test]
async fn test_normalization_non_object_returns_none() {
    use symphony::linear::client::normalize_issue;

    assert!(normalize_issue(&json!("string"), None).is_none());
    assert!(normalize_issue(&json!(42), None).is_none());
    assert!(normalize_issue(&json!(null), None).is_none());
    assert!(normalize_issue(&json!([1, 2, 3]), None).is_none());
}

// ═══════════════════════════════════════════════════════════════════════
// Assignee routing tests
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_assignee_no_filter_all_true() {
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1");
    // No assignee filter → all issues get assigned_to_worker: true
    let issue = normalize_issue(&raw, None).unwrap();
    assert!(issue.assigned_to_worker);
}

#[tokio::test]
async fn test_assignee_filter_match() {
    use std::collections::HashSet;
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1"); // assignee.id = "user-abc"

    // Filter for user-abc → match → true
    let filter = symphony::linear::client::AssigneeFilter {
        match_values: HashSet::from(["user-abc".to_string()]),
    };
    let issue = normalize_issue(&raw, Some(&filter)).unwrap();
    assert!(issue.assigned_to_worker);
}

#[tokio::test]
async fn test_assignee_filter_mismatch() {
    use std::collections::HashSet;
    use symphony::linear::client::normalize_issue;

    let raw = full_issue_json("id-1", "PROJ-1"); // assignee.id = "user-abc"

    // Filter for user-xyz → mismatch → false
    let filter = symphony::linear::client::AssigneeFilter {
        match_values: HashSet::from(["user-xyz".to_string()]),
    };
    let issue = normalize_issue(&raw, Some(&filter)).unwrap();
    assert!(!issue.assigned_to_worker);
}

#[tokio::test]
async fn test_assignee_filter_no_assignee_on_issue() {
    use std::collections::HashSet;
    use symphony::linear::client::normalize_issue;

    // Issue with null assignee
    let raw = json!({
        "id": "id-1", "identifier": "X-1", "title": "T",
        "state": { "name": "Todo" },
        "assignee": null,
        "labels": { "nodes": [] }, "inverseRelations": { "nodes": [] }
    });

    let filter = symphony::linear::client::AssigneeFilter {
        match_values: HashSet::from(["user-abc".to_string()]),
    };
    let issue = normalize_issue(&raw, Some(&filter)).unwrap();
    assert!(
        !issue.assigned_to_worker,
        "null assignee with filter should be false"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// fetch_candidates — pagination
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_candidates_multi_page_preserves_order() {
    let mut server = Server::new_async().await;

    // Page 1: issues A, B (hasNextPage=true, cursor="cursor1")
    let page1 = paginated_response(
        vec![
            full_issue_json("id-a", "PROJ-A"),
            full_issue_json("id-b", "PROJ-B"),
        ],
        true,
        Some("cursor1"),
    );
    // Page 2: issues C, D (hasNextPage=false)
    let page2 = paginated_response(
        vec![
            full_issue_json("id-c", "PROJ-C"),
            full_issue_json("id-d", "PROJ-D"),
        ],
        false,
        None,
    );

    // mockito serves mocks in FIFO order for same path
    let m1 = mock_graphql(&mut server, &page1).await;
    let m2 = mock_graphql(&mut server, &page2).await;

    let client = test_client(&server, None);
    let issues = client.fetch_candidates().await.unwrap();

    m1.assert_async().await;
    m2.assert_async().await;

    assert_eq!(issues.len(), 4);
    assert_eq!(issues[0].identifier, "PROJ-A");
    assert_eq!(issues[1].identifier, "PROJ-B");
    assert_eq!(issues[2].identifier, "PROJ-C");
    assert_eq!(issues[3].identifier, "PROJ-D");
}

#[tokio::test]
async fn test_fetch_candidates_single_page() {
    let mut server = Server::new_async().await;

    let response = paginated_response(vec![full_issue_json("id-1", "PROJ-1")], false, None);
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    let issues = client.fetch_candidates().await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].id, "id-1");
}

// ═══════════════════════════════════════════════════════════════════════
// fetch_issue_states_by_ids — batching + order preservation
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_by_ids_preserves_order() {
    let mut server = Server::new_async().await;

    // Return issues in reverse order — the client should reorder to match input
    let response = id_response(vec![
        full_issue_json("id-c", "PROJ-C"),
        full_issue_json("id-a", "PROJ-A"),
        full_issue_json("id-b", "PROJ-B"),
    ]);
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    let ids: Vec<String> = vec!["id-a".into(), "id-b".into(), "id-c".into()];
    let issues = client.fetch_issue_states_by_ids(&ids).await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 3);
    assert_eq!(issues[0].id, "id-a");
    assert_eq!(issues[1].id, "id-b");
    assert_eq!(issues[2].id, "id-c");
}

#[tokio::test]
async fn test_fetch_by_ids_batched_beyond_50() {
    let mut server = Server::new_async().await;

    // Generate 60 IDs (should result in 2 batches: 50 + 10)
    let ids: Vec<String> = (1..=60).map(|i| format!("id-{:03}", i)).collect();

    // Batch 1: 50 issues
    let batch1_nodes: Vec<Value> = (1..=50)
        .map(|i| {
            json!({
                "id": format!("id-{:03}", i),
                "identifier": format!("PROJ-{:03}", i),
                "title": format!("Issue {}", i),
                "state": { "name": "Todo" },
                "labels": { "nodes": [] },
                "inverseRelations": { "nodes": [] }
            })
        })
        .collect();
    let resp1 = id_response(batch1_nodes);

    // Batch 2: 10 issues
    let batch2_nodes: Vec<Value> = (51..=60)
        .map(|i| {
            json!({
                "id": format!("id-{:03}", i),
                "identifier": format!("PROJ-{:03}", i),
                "title": format!("Issue {}", i),
                "state": { "name": "Todo" },
                "labels": { "nodes": [] },
                "inverseRelations": { "nodes": [] }
            })
        })
        .collect();
    let resp2 = id_response(batch2_nodes);

    let m1 = mock_graphql(&mut server, &resp1).await;
    let m2 = mock_graphql(&mut server, &resp2).await;

    let client = test_client(&server, None);
    let issues = client.fetch_issue_states_by_ids(&ids).await.unwrap();

    m1.assert_async().await;
    m2.assert_async().await;

    assert_eq!(issues.len(), 60);
    // Verify order preserved
    assert_eq!(issues[0].id, "id-001");
    assert_eq!(issues[49].id, "id-050");
    assert_eq!(issues[59].id, "id-060");
}

// ═══════════════════════════════════════════════════════════════════════
// Empty-input short circuits
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_issues_by_states_empty_input() {
    let server = Server::new_async().await;

    // No mock needed — should short-circuit without API call
    let client = test_client(&server, None);
    let result = client.fetch_issues_by_states(&[]).await.unwrap();
    assert!(result.is_empty());
}

#[tokio::test]
async fn test_fetch_issue_states_by_ids_empty_input() {
    let server = Server::new_async().await;

    let client = test_client(&server, None);
    let result = client.fetch_issue_states_by_ids(&[]).await.unwrap();
    assert!(result.is_empty());
}

// ═══════════════════════════════════════════════════════════════════════
// fetch_issues_by_states does NOT apply assignee filter
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_issues_by_states_no_assignee_filter() {
    let mut server = Server::new_async().await;

    // Issue is assigned to user-other, but fetch_issues_by_states should NOT filter
    let issue = json!({
        "id": "id-1", "identifier": "PROJ-1", "title": "T",
        "state": { "name": "Done" },
        "assignee": { "id": "user-other" },
        "labels": { "nodes": [] },
        "inverseRelations": { "nodes": [] }
    });
    let response = paginated_response(vec![issue], false, None);
    let m = mock_graphql(&mut server, &response).await;

    // Assignee is set to a specific user, but fetch_issues_by_states ignores it
    let client = test_client(&server, Some("user-abc"));
    let states = vec!["Done".to_string()];
    let issues = client.fetch_issues_by_states(&states).await.unwrap();

    m.assert_async().await;

    // The issue should be returned with assigned_to_worker: true
    // because fetch_issues_by_states passes no assignee filter
    assert_eq!(issues.len(), 1);
    assert!(
        issues[0].assigned_to_worker,
        "fetch_issues_by_states must NOT apply assignee filter"
    );
}

// ═══════════════════════════════════════════════════════════════════════
// State name deduplication
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_issues_by_states_deduplicates() {
    let mut server = Server::new_async().await;

    let response = paginated_response(vec![full_issue_json("id-1", "PROJ-1")], false, None);
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    // Pass duplicate state names
    let states = vec![
        "Done".to_string(),
        "Done".to_string(),
        "Cancelled".to_string(),
    ];
    let issues = client.fetch_issues_by_states(&states).await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
}

// ═══════════════════════════════════════════════════════════════════════
// ID deduplication
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_issue_states_by_ids_deduplicates() {
    let mut server = Server::new_async().await;

    let response = id_response(vec![full_issue_json("id-1", "PROJ-1")]);
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    // Pass duplicate IDs
    let ids = vec!["id-1".to_string(), "id-1".to_string()];
    let issues = client.fetch_issue_states_by_ids(&ids).await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
}

// ═══════════════════════════════════════════════════════════════════════
// Error mapping tests
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_error_non_200_status() {
    let mut server = Server::new_async().await;

    let m = server
        .mock("POST", "/graphql")
        .with_status(500)
        .with_body("Internal Server Error")
        .create_async()
        .await;

    let client = test_client(&server, None);
    let err = client.fetch_candidates().await.unwrap_err();

    m.assert_async().await;
    match err {
        SymphonyError::LinearApiStatus(status) => assert_eq!(status, 500),
        other => panic!("expected LinearApiStatus, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_error_graphql_errors() {
    let mut server = Server::new_async().await;

    let response = json!({
        "errors": [
            { "message": "Authentication failed" }
        ]
    });
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    let err = client.fetch_candidates().await.unwrap_err();

    m.assert_async().await;
    match err {
        SymphonyError::LinearGraphqlErrors(msg) => {
            assert!(msg.contains("Authentication failed"));
        }
        other => panic!("expected LinearGraphqlErrors, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_error_unknown_payload() {
    let mut server = Server::new_async().await;

    // Response with neither data.issues nor errors
    let response = json!({ "data": { "something_else": true } });
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    let err = client.fetch_candidates().await.unwrap_err();

    m.assert_async().await;
    match err {
        SymphonyError::LinearUnknownPayload => {}
        other => panic!("expected LinearUnknownPayload, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_error_missing_end_cursor() {
    let mut server = Server::new_async().await;

    // hasNextPage=true but no endCursor → LinearMissingEndCursor
    let response = paginated_response(
        vec![full_issue_json("id-1", "PROJ-1")],
        true,
        None, // missing cursor!
    );
    let m = mock_graphql(&mut server, &response).await;

    let client = test_client(&server, None);
    let err = client.fetch_candidates().await.unwrap_err();

    m.assert_async().await;
    match err {
        SymphonyError::LinearMissingEndCursor => {}
        other => panic!("expected LinearMissingEndCursor, got: {:?}", other),
    }
}

#[tokio::test]
async fn test_error_transport_error() {
    // Point to a server that's not running (using a URL that will fail)
    let config = TrackerConfig {
        kind: Some("linear".to_string()),
        endpoint: "http://192.0.2.1:1/graphql".to_string(), // TEST-NET-1 (RFC 5737) — guaranteed unreachable
        api_key: Some(ApiKey::new("test-key")),
        project_slug: Some("test-proj".to_string()),
        assignee: None,
        active_states: vec!["Todo".to_string()],
        terminal_states: vec![],
    };

    let client = LinearClient::new(config);
    let err = client.fetch_candidates().await.unwrap_err();

    match err {
        SymphonyError::LinearApiRequest(msg) => {
            assert!(!msg.is_empty(), "should have error message");
        }
        other => panic!("expected LinearApiRequest, got: {:?}", other),
    }
}

// ═══════════════════════════════════════════════════════════════════════
// TrackerAdapter trait via LinearAdapter
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_adapter_fetch_candidates() {
    let mut server = Server::new_async().await;

    let response = paginated_response(vec![full_issue_json("id-1", "PROJ-1")], false, None);
    let m = mock_graphql(&mut server, &response).await;

    let adapter = test_adapter(&server, None);
    let issues = adapter.fetch_candidate_issues().await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].id, "id-1");
}

#[tokio::test]
async fn test_adapter_fetch_by_states() {
    let mut server = Server::new_async().await;

    let response = paginated_response(vec![full_issue_json("id-1", "PROJ-1")], false, None);
    let m = mock_graphql(&mut server, &response).await;

    let adapter = test_adapter(&server, None);
    let states = vec!["Done".to_string()];
    let issues = adapter.fetch_issues_by_states(&states).await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
}

#[tokio::test]
async fn test_adapter_fetch_by_ids() {
    let mut server = Server::new_async().await;

    let response = id_response(vec![full_issue_json("id-1", "PROJ-1")]);
    let m = mock_graphql(&mut server, &response).await;

    let adapter = test_adapter(&server, None);
    let ids = vec!["id-1".to_string()];
    let issues = adapter.fetch_issue_states_by_ids(&ids).await.unwrap();

    m.assert_async().await;
    assert_eq!(issues.len(), 1);
}

#[tokio::test]
async fn test_resolve_state_id_returns_matching_state() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/graphql")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "team": {
                            "states": {
                                "nodes": [{"id": "state-in-progress-123"}]
                            }
                        }
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let client = test_client(&server, None);
    let result = client.resolve_state_id("issue-1", "In Progress").await;
    assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    assert_eq!(result.unwrap(), "state-in-progress-123");
    mock.assert_async().await;
}

#[tokio::test]
async fn test_resolve_state_id_returns_error_when_not_found() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/graphql")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "team": {
                            "states": {
                                "nodes": []
                            }
                        }
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let client = test_client(&server, None);
    let result = client.resolve_state_id("issue-1", "Nonexistent").await;
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(err.contains("not found"), "expected 'not found' in: {err}");
    mock.assert_async().await;
}

#[tokio::test]
async fn test_update_issue_state_resolves_and_updates() {
    let mut server = Server::new_async().await;

    // First call: resolve state ID
    let state_mock = server
        .mock("POST", "/graphql")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "team": {
                            "states": {
                                "nodes": [{"id": "state-done-456"}]
                            }
                        }
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    // Second call: update issue state
    let update_mock = server
        .mock("POST", "/graphql")
        .with_body(
            json!({
                "data": {
                    "issueUpdate": {
                        "success": true
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let client = test_client(&server, None);
    let result = client.update_issue_state("issue-1", "Done").await;
    assert!(result.is_ok());
    state_mock.assert_async().await;
    update_mock.assert_async().await;
}

#[tokio::test]
async fn test_create_comment_success() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/graphql")
        .with_body(
            json!({
                "data": {
                    "commentCreate": {
                        "success": true
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let client = test_client(&server, None);
    let result = client.create_comment("issue-1", "Hello from Symphony").await;
    assert!(result.is_ok());
    mock.assert_async().await;
}

// ═══════════════════════════════════════════════════════════════════════
// Assignee "me" resolution via viewer query
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_fetch_candidates_with_me_assignee() {
    let mut server = Server::new_async().await;

    // First request: viewer query to resolve "me"
    let viewer_resp = viewer_response("user-abc");
    let m_viewer = mock_graphql(&mut server, &viewer_resp).await;

    // Second request: candidates fetch
    let candidates_resp = paginated_response(
        vec![
            full_issue_json("id-1", "PROJ-1"), // assignee.id = user-abc → match
        ],
        false,
        None,
    );
    let m_candidates = mock_graphql(&mut server, &candidates_resp).await;

    let client = test_client(&server, Some("me"));
    let issues = client.fetch_candidates().await.unwrap();

    m_viewer.assert_async().await;
    m_candidates.assert_async().await;

    assert_eq!(issues.len(), 1);
    assert!(issues[0].assigned_to_worker);
}

#[tokio::test]
async fn test_fetch_candidates_with_me_filters_out_unassigned() {
    let mut server = Server::new_async().await;

    let viewer_resp = viewer_response("user-abc");
    let m_viewer = mock_graphql(&mut server, &viewer_resp).await;

    // Issue assigned to someone else
    let issue = json!({
        "id": "id-1", "identifier": "PROJ-1", "title": "T",
        "state": { "name": "Todo" },
        "assignee": { "id": "user-xyz" },
        "labels": { "nodes": [] },
        "inverseRelations": { "nodes": [] }
    });
    let candidates_resp = paginated_response(vec![issue], false, None);
    let m_candidates = mock_graphql(&mut server, &candidates_resp).await;

    let client = test_client(&server, Some("me"));
    let issues = client.fetch_candidates().await.unwrap();

    m_viewer.assert_async().await;
    m_candidates.assert_async().await;

    // Issue returned but with assigned_to_worker: false
    assert_eq!(issues.len(), 1);
    assert!(!issues[0].assigned_to_worker);
}
