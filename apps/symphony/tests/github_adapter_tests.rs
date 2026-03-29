use mockito::{Matcher, Server, ServerGuard};
use serde_json::json;
use symphony::domain::{ApiKey, TrackerConfig};
use symphony::error::SymphonyError;
use symphony::github::adapter::{GithubAdapter, StateMode};
use symphony::github::client::GithubClient;
use symphony::linear::adapter::TrackerAdapter;

fn test_config(assignee: Option<&str>) -> TrackerConfig {
    TrackerConfig {
        kind: Some("github".to_string()),
        endpoint: "https://api.github.com".to_string(),
        api_key: Some(ApiKey::new("test-token")),
        project_slug: None,
        workspace_slug: None,
        repo_owner: Some("kata-sh".to_string()),
        repo_name: Some("kata-mono".to_string()),
        github_project_number: None,
        label_prefix: Some("symphony".to_string()),
        assignee: assignee.map(|value| value.to_string()),
        active_states: vec!["Todo".to_string(), "In Progress".to_string()],
        terminal_states: vec!["Done".to_string(), "Cancelled".to_string()],
        exclude_labels: vec![],
    }
}

fn test_adapter(server: &ServerGuard, assignee: Option<&str>) -> GithubAdapter {
    let client = GithubClient::with_base_url(
        "test-token",
        "kata-sh",
        "kata-mono",
        "symphony",
        server.url(),
    );
    GithubAdapter::new(client, test_config(assignee))
}

fn test_projects_adapter(
    server: &ServerGuard,
    assignee: Option<&str>,
    project_number: u64,
) -> GithubAdapter {
    let mut config = test_config(assignee);
    config.github_project_number = Some(project_number);

    let client = GithubClient::with_base_url(
        "test-token",
        "kata-sh",
        "kata-mono",
        "symphony",
        server.url(),
    );

    GithubAdapter::new(client, config)
}

fn projects_v2_status_field_payload() -> serde_json::Value {
    json!({
        "data": {
            "user": {
                "projectV2": {
                    "id": "project_42",
                    "field": {
                        "id": "status_field",
                        "options": [
                            { "id": "opt_todo", "name": "Todo" },
                            { "id": "opt_in_progress", "name": "In Progress" },
                            { "id": "opt_done", "name": "Done" }
                        ]
                    }
                }
            },
            "organization": null
        }
    })
}

fn projects_v2_items_payload(items: &[serde_json::Value]) -> serde_json::Value {
    json!({
        "data": {
            "node": {
                "items": {
                    "nodes": items,
                    "pageInfo": {
                        "hasNextPage": false,
                        "endCursor": null
                    }
                }
            }
        }
    })
}

fn project_item_node(
    item_id: &str,
    issue_number: u64,
    option_id: &str,
    status_name: &str,
) -> serde_json::Value {
    json!({
        "id": item_id,
        "content": { "number": issue_number },
        "fieldValueByName": {
            "name": status_name,
            "optionId": option_id
        }
    })
}

async fn run_tracker_contract(
    adapter: &GithubAdapter,
    expected_state: &str,
    transition_state: &str,
) {
    let candidates = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");
    assert!(!candidates.is_empty(), "contract expects candidate issues");

    let by_state = adapter
        .fetch_issues_by_states(&[expected_state.to_string()])
        .await
        .expect("fetch_issues_by_states should succeed");
    assert!(!by_state.is_empty(), "contract expects issues_by_states");

    let issue_id = candidates[0].id.clone();
    let issue_states = adapter
        .fetch_issue_states_by_ids(std::slice::from_ref(&issue_id))
        .await
        .expect("fetch_issue_states_by_ids should succeed");
    assert!(!issue_states.is_empty(), "contract expects issue_states");

    adapter
        .create_comment(&issue_id, "contract comment")
        .await
        .expect("create_comment should succeed");

    adapter
        .update_issue_state(&issue_id, transition_state)
        .await
        .expect("update_issue_state should succeed");
}

fn issue_json(
    number: u64,
    labels: &[&str],
    user_login: &str,
    assignees: &[&str],
    html_url: Option<&str>,
) -> serde_json::Value {
    let first_assignee = assignees.first().copied().unwrap_or(user_login);

    json!({
        "number": number,
        "title": format!("Issue {number}"),
        "body": format!("Body {number}"),
        "state": "open",
        "user": { "login": user_login },
        "assignee": { "login": first_assignee },
        "assignees": assignees.iter().map(|login| json!({ "login": login })).collect::<Vec<_>>(),
        "labels": labels.iter().map(|name| json!({ "name": name, "color": "ffffff", "description": null })).collect::<Vec<_>>(),
        "created_at": "2026-03-29T10:00:00Z",
        "updated_at": "2026-03-29T10:30:00Z",
        "html_url": html_url
    })
}

fn pull_request_json(mut issue: serde_json::Value) -> serde_json::Value {
    issue["pull_request"] = json!({
        "url": "https://api.github.com/repos/kata-sh/kata-mono/pulls/123"
    });
    issue
}

#[tokio::test]
async fn test_fetch_candidate_issues_returns_matching_issues() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([
                issue_json(1, &["symphony:todo"], "alice", &["alice"], None),
                issue_json(2, &["symphony:in-progress"], "bob", &["bob"], None),
                issue_json(3, &["bug"], "carol", &["carol"], None)
            ])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].identifier, "#1");
    assert_eq!(issues[0].state, "Todo");
    assert_eq!(issues[1].identifier, "#2");
    assert_eq!(issues[1].state, "In Progress");
}

#[tokio::test]
async fn test_fetch_candidate_issues_skips_pull_requests() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let pull_request =
        pull_request_json(issue_json(4, &["symphony:todo"], "alice", &["alice"], None));

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(json!([pull_request]).to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert!(issues.is_empty(), "pull requests must be ignored");
}

#[tokio::test]
async fn test_fetch_candidate_issues_applies_assignee_filter() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, Some("alice"));

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([
                issue_json(1, &["symphony:todo"], "alice", &["alice"], None),
                issue_json(2, &["symphony:todo"], "bob", &["bob"], None),
                issue_json(3, &["symphony:in-progress"], "eve", &["alice"], None)
            ])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert_eq!(
        issues.len(),
        2,
        "only issues assigned to alice should remain"
    );
    assert_eq!(issues[0].identifier, "#1");
    assert_eq!(issues[1].identifier, "#3");
}

#[tokio::test]
async fn test_fetch_issues_by_states_filters_by_state_labels() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([
                issue_json(1, &["symphony:todo"], "alice", &["alice"], None),
                issue_json(2, &["symphony:done"], "bob", &["bob"], None),
                issue_json(3, &["symphony:in-progress"], "carol", &["carol"], None)
            ])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_issues_by_states(&["Done".to_string()])
        .await
        .expect("fetch_issues_by_states should succeed");

    mock.assert_async().await;
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].identifier, "#2");
    assert_eq!(issues[0].state, "Done");
}

#[tokio::test]
async fn test_fetch_issues_by_states_marks_assignment_with_assignee_filter() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, Some("alice"));

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([
                issue_json(8, &["symphony:todo"], "alice", &["alice"], None),
                issue_json(9, &["symphony:todo"], "bob", &["bob"], None)
            ])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_issues_by_states(&["Todo".to_string()])
        .await
        .expect("fetch_issues_by_states should succeed");

    mock.assert_async().await;
    assert_eq!(issues.len(), 2);
    assert!(issues[0].assigned_to_worker);
    assert!(!issues[1].assigned_to_worker);
}

#[tokio::test]
async fn test_fetch_issue_states_by_ids_returns_individual_issues() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let m1 = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/10")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(10, &["symphony:todo"], "alice", &["alice"], None).to_string())
        .create_async()
        .await;

    let m2 = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/11")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(11, &["symphony:done"], "bob", &["bob"], None).to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_issue_states_by_ids(&["10".to_string(), "11".to_string()])
        .await
        .expect("fetch_issue_states_by_ids should succeed");

    m1.assert_async().await;
    m2.assert_async().await;
    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].identifier, "#10");
    assert_eq!(issues[1].identifier, "#11");
}

#[tokio::test]
async fn test_fetch_issue_states_by_ids_marks_assignment_with_assignee_filter() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, Some("alice"));

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/12")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(12, &["symphony:todo"], "bob", &["bob"], None).to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_issue_states_by_ids(&["12".to_string()])
        .await
        .expect("fetch_issue_states_by_ids should succeed");

    mock.assert_async().await;
    assert_eq!(issues.len(), 1);
    assert!(!issues[0].assigned_to_worker);
}

#[tokio::test]
async fn test_fetch_issue_states_by_ids_skips_pull_requests() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let pull_request = pull_request_json(issue_json(
        13,
        &["symphony:todo"],
        "alice",
        &["alice"],
        None,
    ));

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/13")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(pull_request.to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_issue_states_by_ids(&["13".to_string()])
        .await
        .expect("fetch_issue_states_by_ids should succeed");

    mock.assert_async().await;
    assert!(issues.is_empty(), "pull requests must be ignored");
}

#[tokio::test]
async fn test_create_comment_delegates_to_client() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/7/comments")
        .match_body(Matcher::PartialJson(json!({ "body": "hello" })))
        .with_status(201)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .create_async()
        .await;

    adapter
        .create_comment("7", "hello")
        .await
        .expect("create_comment should succeed");

    mock.assert_async().await;
}

#[tokio::test]
async fn test_update_issue_state_swaps_labels() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let get_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/7")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(7, &["symphony:todo", "bug"], "alice", &["alice"], None).to_string())
        .create_async()
        .await;

    let remove_mock = server
        .mock(
            "DELETE",
            "/repos/kata-sh/kata-mono/issues/7/labels/symphony:todo",
        )
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .create_async()
        .await;

    let add_mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/7/labels")
        .match_body(Matcher::PartialJson(
            json!({ "labels": ["symphony:in-progress"] }),
        ))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("[]")
        .create_async()
        .await;

    adapter
        .update_issue_state("7", "In Progress")
        .await
        .expect("update_issue_state should succeed");

    get_mock.assert_async().await;
    remove_mock.assert_async().await;
    add_mock.assert_async().await;
}

#[tokio::test]
async fn test_update_issue_state_removes_all_existing_state_labels() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let get_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/17")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            issue_json(
                17,
                &["symphony:todo", "symphony:in-progress", "bug"],
                "alice",
                &["alice"],
                None,
            )
            .to_string(),
        )
        .create_async()
        .await;

    let remove_todo = server
        .mock(
            "DELETE",
            "/repos/kata-sh/kata-mono/issues/17/labels/symphony:todo",
        )
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .create_async()
        .await;

    let remove_in_progress = server
        .mock(
            "DELETE",
            "/repos/kata-sh/kata-mono/issues/17/labels/symphony:in-progress",
        )
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .create_async()
        .await;

    let add_done = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/17/labels")
        .match_body(Matcher::PartialJson(json!({ "labels": ["symphony:done"] })))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("[]")
        .create_async()
        .await;

    adapter
        .update_issue_state("17", "Done")
        .await
        .expect("update_issue_state should succeed");

    get_mock.assert_async().await;
    remove_todo.assert_async().await;
    remove_in_progress.assert_async().await;
    add_done.assert_async().await;
}

#[tokio::test]
async fn test_update_issue_state_handles_missing_old_label() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let get_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/8")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(8, &["bug"], "alice", &["alice"], None).to_string())
        .create_async()
        .await;

    let add_mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/8/labels")
        .match_body(Matcher::PartialJson(json!({ "labels": ["symphony:done"] })))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("[]")
        .create_async()
        .await;

    adapter
        .update_issue_state("8", "Done")
        .await
        .expect("update_issue_state should succeed");

    get_mock.assert_async().await;
    add_mock.assert_async().await;
}

#[tokio::test]
async fn test_issue_to_domain_maps_identifier_format() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([issue_json(
                123,
                &["symphony:todo"],
                "alice",
                &["alice"],
                None
            )])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert_eq!(issues[0].id, "123");
    assert_eq!(issues[0].identifier, "#123");
}

#[tokio::test]
async fn test_issue_to_domain_maps_github_url() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([issue_json(
                124,
                &["symphony:todo"],
                "alice",
                &["alice"],
                Some("https://github.com/kata-sh/kata-mono/issues/124")
            )])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert_eq!(
        issues[0].url.as_deref(),
        Some("https://github.com/kata-sh/kata-mono/issues/124")
    );
}

#[tokio::test]
async fn test_issue_to_domain_extracts_state_from_label() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([issue_json(
                200,
                &["symphony:in-progress"],
                "alice",
                &["alice"],
                None
            )])
            .to_string(),
        )
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("fetch_candidate_issues should succeed");

    mock.assert_async().await;
    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].state, "In Progress");
}

#[tokio::test]
async fn test_mode_detection_selects_projects_v2_when_project_number_set() {
    let server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    assert!(matches!(
        adapter.state_mode(),
        StateMode::ProjectsV2 { project_number, .. } if *project_number == 42
    ));
}

#[tokio::test]
async fn test_mode_detection_selects_labels_when_project_number_absent() {
    let server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    assert!(matches!(adapter.state_mode(), StateMode::Labels));
}

#[tokio::test]
async fn test_projects_v2_fetch_candidate_issues_queries_by_status() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[
                project_item_node("item_101", 101, "opt_todo", "Todo"),
                project_item_node("item_102", 102, "opt_in_progress", "In Progress"),
                project_item_node("item_103", 103, "opt_done", "Done"),
            ])
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let issue_101 = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/101")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(101, &["symphony:done"], "alice", &["alice"], None).to_string())
        .create_async()
        .await;

    let issue_102 = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/102")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(102, &["symphony:todo"], "bob", &["bob"], None).to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_candidate_issues()
        .await
        .expect("projects v2 fetch_candidate_issues should succeed");

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    issue_101.assert_async().await;
    issue_102.assert_async().await;

    assert_eq!(issues.len(), 2);
    assert_eq!(issues[0].identifier, "#101");
    assert_eq!(issues[0].state, "Todo");
    assert_eq!(issues[1].identifier, "#102");
    assert_eq!(issues[1].state, "In Progress");
}

#[tokio::test]
async fn test_projects_v2_fetch_issues_by_states() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[
                project_item_node("item_201", 201, "opt_todo", "Todo"),
                project_item_node("item_202", 202, "opt_done", "Done"),
            ])
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let issue_202 = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/202")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(202, &["symphony:todo"], "alice", &["alice"], None).to_string())
        .create_async()
        .await;

    let issues = adapter
        .fetch_issues_by_states(&["Done".to_string()])
        .await
        .expect("projects v2 fetch_issues_by_states should succeed");

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    issue_202.assert_async().await;

    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].identifier, "#202");
    assert_eq!(issues[0].state, "Done");
}

#[tokio::test]
async fn test_projects_v2_update_issue_state_mutates_status_field() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[project_item_node("item_7", 7, "opt_todo", "Todo")])
                .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let mutation_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("updateProjectV2ItemFieldValue".to_string()),
            Matcher::PartialJson(json!({
                "variables": {
                    "projectId": "project_42",
                    "itemId": "item_7",
                    "fieldId": "status_field",
                    "singleSelectOptionId": "opt_done"
                }
            })),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "updateProjectV2ItemFieldValue": {
                        "projectV2Item": { "id": "item_7" }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    adapter
        .update_issue_state("7", "Done")
        .await
        .expect("projects v2 update_issue_state should succeed");

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    mutation_mock.assert_async().await;
}

#[tokio::test]
async fn test_projects_v2_update_issue_state_unknown_status_errors() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let err = adapter
        .update_issue_state("7", "Blocked")
        .await
        .expect_err("unknown status should fail");

    fields_mock.assert_async().await;
    match err {
        SymphonyError::GithubProjectsV2Error(message) => {
            assert!(message.contains("status option 'Blocked' not found"));
            assert!(message.contains("Todo"));
            assert!(message.contains("In Progress"));
            assert!(message.contains("Done"));
        }
        other => panic!("expected GithubProjectsV2Error, got {other:?}"),
    }
}

#[tokio::test]
async fn test_projects_v2_update_issue_state_issue_not_on_board_errors() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[project_item_node("item_99", 99, "opt_todo", "Todo")])
                .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let err = adapter
        .update_issue_state("7", "Done")
        .await
        .expect_err("missing project item should fail");

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    match err {
        SymphonyError::GithubProjectsV2Error(message) => {
            assert!(message.contains("issue #7 is not on project board #42"));
        }
        other => panic!("expected GithubProjectsV2Error, got {other:?}"),
    }
}

#[tokio::test]
async fn test_projects_v2_fetch_issue_states_by_ids_reads_board_status() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[project_item_node(
                "item_55",
                55,
                "opt_in_progress",
                "In Progress",
            )])
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let issue_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/55")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(55, &["symphony:todo"], "alice", &["alice"], None).to_string())
        .expect(1)
        .create_async()
        .await;

    let issues = adapter
        .fetch_issue_states_by_ids(&["55".to_string()])
        .await
        .expect("projects v2 fetch_issue_states_by_ids should succeed");

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    issue_mock.assert_async().await;

    assert_eq!(issues.len(), 1);
    assert_eq!(issues[0].identifier, "#55");
    assert_eq!(issues[0].state, "In Progress");
}

#[tokio::test]
async fn test_contract_matrix_label_mode_all_methods() {
    let mut server = Server::new_async().await;
    let adapter = test_adapter(&server, None);

    let issues_list_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("state".into(), "open".into()),
            Matcher::UrlEncoded("per_page".into(), "100".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([issue_json(7, &["symphony:todo"], "alice", &["alice"], None)]).to_string(),
        )
        .expect(2)
        .create_async()
        .await;

    let issue_by_id_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/7")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!([issue_json(7, &["symphony:todo"], "alice", &["alice"], None)])[0].to_string(),
        )
        .expect(2)
        .create_async()
        .await;

    let comment_mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/7/comments")
        .match_body(Matcher::PartialJson(json!({ "body": "contract comment" })))
        .with_status(201)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .expect(1)
        .create_async()
        .await;

    let remove_mock = server
        .mock(
            "DELETE",
            "/repos/kata-sh/kata-mono/issues/7/labels/symphony:todo",
        )
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .expect(1)
        .create_async()
        .await;

    let add_mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/7/labels")
        .match_body(Matcher::PartialJson(
            json!({ "labels": ["symphony:in-progress"] }),
        ))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("[]")
        .expect(1)
        .create_async()
        .await;

    run_tracker_contract(&adapter, "Todo", "In Progress").await;

    issues_list_mock.assert_async().await;
    issue_by_id_mock.assert_async().await;
    comment_mock.assert_async().await;
    remove_mock.assert_async().await;
    add_mock.assert_async().await;
}

#[tokio::test]
async fn test_contract_matrix_projects_v2_mode_all_methods() {
    let mut server = Server::new_async().await;
    let adapter = test_projects_adapter(&server, None, 42);

    let fields_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(projects_v2_status_field_payload().to_string())
        .expect(1)
        .create_async()
        .await;

    let items_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            projects_v2_items_payload(&[project_item_node("item_7", 7, "opt_todo", "Todo")])
                .to_string(),
        )
        .expect(4)
        .create_async()
        .await;

    let issue_mock = server
        .mock("GET", "/repos/kata-sh/kata-mono/issues/7")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(issue_json(7, &["symphony:done"], "alice", &["alice"], None).to_string())
        .expect(3)
        .create_async()
        .await;

    let comment_mock = server
        .mock("POST", "/repos/kata-sh/kata-mono/issues/7/comments")
        .match_body(Matcher::PartialJson(json!({ "body": "contract comment" })))
        .with_status(201)
        .with_header("content-type", "application/json")
        .with_body("{}")
        .expect(1)
        .create_async()
        .await;

    let mutation_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("updateProjectV2ItemFieldValue".to_string()),
            Matcher::PartialJson(json!({
                "variables": {
                    "projectId": "project_42",
                    "itemId": "item_7",
                    "fieldId": "status_field",
                    "singleSelectOptionId": "opt_done"
                }
            })),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "updateProjectV2ItemFieldValue": {
                        "projectV2Item": { "id": "item_7" }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    run_tracker_contract(&adapter, "Todo", "Done").await;

    fields_mock.assert_async().await;
    items_mock.assert_async().await;
    issue_mock.assert_async().await;
    comment_mock.assert_async().await;
    mutation_mock.assert_async().await;
}
