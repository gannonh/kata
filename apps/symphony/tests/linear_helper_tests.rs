use mockito::{Matcher, Server};
use serde_json::json;
use symphony::domain::{ApiKey, TrackerConfig};
use symphony::helper::run_operation;

fn linear_config(endpoint: String) -> TrackerConfig {
    TrackerConfig {
        kind: Some("linear".to_string()),
        endpoint,
        api_key: Some(ApiKey::new("linear-token")),
        project_slug: Some("kata-project".to_string()),
        workspace_slug: Some("kata-sh".to_string()),
        active_states: vec!["Todo".to_string(), "In Progress".to_string()],
        terminal_states: vec!["Done".to_string()],
        exclude_labels: vec![],
        ..TrackerConfig::default()
    }
}

fn issue_node(id: &str, identifier: &str, parent_identifier: Option<&str>) -> serde_json::Value {
    json!({
        "id": id,
        "identifier": identifier,
        "title": format!("Issue {identifier}"),
        "description": format!("Description for {identifier}"),
        "priority": 2,
        "state": { "name": "Todo" },
        "branchName": null,
        "url": format!("https://linear.app/kata-sh/issue/{identifier}"),
        "assignee": null,
        "labels": { "nodes": [] },
        "inverseRelations": { "nodes": [] },
        "children": { "nodes": [] },
        "parent": parent_identifier.map(|identifier| json!({ "identifier": identifier })),
        "createdAt": "2026-05-07T10:00:00Z",
        "updatedAt": "2026-05-07T10:10:00Z"
    })
}

#[tokio::test]
async fn linear_issue_list_children_returns_normalized_children() {
    let mut server = Server::new_async().await;
    let config = linear_config(server.url() + "/graphql");

    let mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearHelperIssue".to_string()),
            Matcher::Regex("\"issueId\":\"issue-parent\"".to_string()),
            Matcher::Regex("\"commentFirst\":0".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "id": "issue-parent",
                        "identifier": "KAT-1",
                        "title": "Parent",
                        "description": "Parent body",
                        "priority": 1,
                        "state": { "name": "Todo" },
                        "branchName": "gannon/kat-1",
                        "url": "https://linear.app/kata-sh/issue/KAT-1",
                        "assignee": null,
                        "labels": { "nodes": [] },
                        "inverseRelations": { "nodes": [] },
                        "children": {
                            "nodes": [issue_node("issue-child", "KAT-2", Some("KAT-1"))]
                        },
                        "parent": null,
                        "comments": { "nodes": [] },
                        "createdAt": "2026-05-07T09:00:00Z",
                        "updatedAt": "2026-05-07T09:30:00Z"
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let result = run_operation(
        &config,
        "issue.list-children",
        json!({ "issueId": "issue-parent" }),
    )
    .await
    .expect("children should load");

    mock.assert_async().await;
    assert_eq!(result["children"][0]["identifier"], "KAT-2");
    assert_eq!(result["children"][0]["parent_identifier"], "KAT-1");
}

#[tokio::test]
async fn linear_pr_helpers_return_github_only_error() {
    let config = linear_config("http://127.0.0.1:1/graphql".to_string());

    let err = run_operation(&config, "pr.land-status", json!({}))
        .await
        .expect_err("Linear tracker should reject GitHub PR helper");

    assert!(err.contains("only available when tracker.kind is github"));
}

#[tokio::test]
async fn linear_comment_upsert_returns_updated_marker_comment() {
    let mut server = Server::new_async().await;
    let config = linear_config(server.url() + "/graphql");

    let list_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearHelperIssueComments".to_string()),
            Matcher::Regex("\"issueId\":\"issue-parent\"".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "comments": {
                            "nodes": [{
                                "id": "comment-workpad",
                                "body": "## Agent Workpad\n\nOld",
                                "url": "https://linear.app/kata-sh/comment/comment-workpad",
                                "createdAt": "2026-05-07T10:00:00Z",
                                "updatedAt": "2026-05-07T10:00:00Z"
                            }]
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let update_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearUpdateComment".to_string()),
            Matcher::Regex("\"commentId\":\"comment-workpad\"".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "commentUpdate": {
                        "success": true,
                        "comment": {
                            "id": "comment-workpad",
                            "body": "## Agent Workpad\n\nNew",
                            "url": "https://linear.app/kata-sh/comment/comment-workpad",
                            "createdAt": "2026-05-07T10:00:00Z",
                            "updatedAt": "2026-05-07T10:10:00Z"
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let result = run_operation(
        &config,
        "comment.upsert",
        json!({
            "issueId": "issue-parent",
            "marker": "## Agent Workpad",
            "body": "## Agent Workpad\n\nNew"
        }),
    )
    .await
    .expect("comment should upsert");

    list_mock.assert_async().await;
    update_mock.assert_async().await;
    assert_eq!(result["comment"]["id"], "comment-workpad");
    assert_eq!(result["comment"]["body"], "## Agent Workpad\n\nNew");
}

#[tokio::test]
async fn linear_document_write_and_read_use_marker_comments() {
    let mut server = Server::new_async().await;
    let config = linear_config(server.url() + "/graphql");
    let marker = "<!-- symphony:document:Plan -->";
    let content = "# Plan\n\nShip the helper.";
    let body = format!("{marker}\n\n{content}");

    let write_list_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex(
            "SymphonyLinearHelperIssueComments".to_string(),
        ))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "comments": {
                            "nodes": [{
                                "id": "comment-plan",
                                "body": "<!-- symphony:document:Plan -->\n\nOld plan",
                                "url": "https://linear.app/kata-sh/comment/comment-plan",
                                "createdAt": "2026-05-07T10:00:00Z",
                                "updatedAt": "2026-05-07T10:00:00Z"
                            }]
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let update_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearUpdateComment".to_string()),
            Matcher::Regex("\"commentId\":\"comment-plan\"".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "commentUpdate": {
                        "success": true,
                        "comment": {
                            "id": "comment-plan",
                            "body": body,
                            "url": "https://linear.app/kata-sh/comment/comment-plan",
                            "createdAt": "2026-05-07T10:00:00Z",
                            "updatedAt": "2026-05-07T10:10:00Z"
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let write_result = run_operation(
        &config,
        "document.write",
        json!({
            "issueId": "issue-parent",
            "title": "Plan",
            "content": content
        }),
    )
    .await
    .expect("document should write");

    write_list_mock.assert_async().await;
    update_mock.assert_async().await;
    assert_eq!(write_result["title"], "Plan");
    assert_eq!(write_result["comment"]["body"], body);

    let read_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex(
            "SymphonyLinearHelperIssueComments".to_string(),
        ))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "comments": {
                            "nodes": [{
                                "id": "comment-plan",
                                "body": body,
                                "url": "https://linear.app/kata-sh/comment/comment-plan",
                                "createdAt": "2026-05-07T10:00:00Z",
                                "updatedAt": "2026-05-07T10:10:00Z"
                            }]
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let read_result = run_operation(
        &config,
        "document.read",
        json!({ "issueId": "issue-parent", "title": "Plan" }),
    )
    .await
    .expect("document should read");

    read_mock.assert_async().await;
    assert_eq!(read_result["title"], "Plan");
    assert_eq!(read_result["content"], content);

    let list_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex(
            "SymphonyLinearHelperIssueComments".to_string(),
        ))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "comments": {
                            "nodes": [{
                                "id": "comment-plan",
                                "body": body,
                                "url": "https://linear.app/kata-sh/comment/comment-plan",
                                "createdAt": "2026-05-07T10:00:00Z",
                                "updatedAt": "2026-05-07T10:10:00Z"
                            }]
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let list_result = run_operation(
        &config,
        "document.read",
        json!({ "issueId": "issue-parent" }),
    )
    .await
    .expect("documents should list");

    list_mock.assert_async().await;
    assert_eq!(list_result["documents"][0]["title"], "Plan");
    assert_eq!(list_result["documents"][0]["content"], content);
    assert_eq!(list_result["documents"][0]["comment"]["id"], "comment-plan");
    assert_eq!(
        list_result["documents"][0]["comment"]["url"],
        "https://linear.app/kata-sh/comment/comment-plan"
    );
}

#[tokio::test]
async fn linear_issue_create_followup_returns_created_issue() {
    let mut server = Server::new_async().await;
    let config = linear_config(server.url() + "/graphql");

    let context_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearFollowupContext".to_string()),
            Matcher::Regex("\"issueId\":\"issue-parent\"".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issue": {
                        "id": "issue-parent",
                        "team": { "id": "team-1" },
                        "project": { "id": "project-1" }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let create_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("SymphonyLinearCreateFollowup".to_string()),
            Matcher::Regex("\"teamId\":\"team-1\"".to_string()),
            Matcher::Regex("\"projectId\":\"project-1\"".to_string()),
            Matcher::Regex("\"parentId\":\"issue-parent\"".to_string()),
            Matcher::Regex("\"title\":\"Follow-up\"".to_string()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "issueCreate": {
                        "success": true,
                        "issue": {
                            "id": "issue-followup",
                            "identifier": "KAT-3",
                            "title": "Follow-up",
                            "url": "https://linear.app/kata-sh/issue/KAT-3"
                        }
                    }
                }
            })
            .to_string(),
        )
        .expect(1)
        .create_async()
        .await;

    let result = run_operation(
        &config,
        "issue.create-followup",
        json!({
            "parentIssueId": "issue-parent",
            "title": "Follow-up",
            "description": "Follow-up body"
        }),
    )
    .await
    .expect("follow-up should create");

    context_mock.assert_async().await;
    create_mock.assert_async().await;
    assert_eq!(result["issue"]["id"], "issue-followup");
    assert_eq!(result["issue"]["identifier"], "KAT-3");
}
