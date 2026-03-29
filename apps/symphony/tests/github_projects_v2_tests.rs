use mockito::{Matcher, Server, ServerGuard};
use serde_json::json;
use symphony::error::SymphonyError;
use symphony::github::client::GithubClient;
use symphony::github::projects_v2::{ProjectsV2Client, QUERY_PROJECT_FIELDS, QUERY_PROJECT_ITEMS};

fn test_client(server: &ServerGuard) -> ProjectsV2Client {
    let github_client = GithubClient::with_base_url(
        "test-token",
        "kata-sh",
        "kata-mono",
        "symphony",
        server.url(),
    );
    ProjectsV2Client::new(github_client)
}

#[tokio::test]
async fn test_resolve_status_field_parses_options() {
    let mut server = Server::new_async().await;
    let client = test_client(&server);

    let mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("projectV2\\(number".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "user": null,
                    "organization": {
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
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let info = client
        .resolve_status_field("kata-sh", 42)
        .await
        .expect("status field should parse");

    mock.assert_async().await;
    assert_eq!(info.project_id, "project_42");
    assert_eq!(info.field_id, "status_field");
    assert_eq!(info.options.len(), 3);
    assert_eq!(info.options[0].id, "opt_todo");
    assert_eq!(info.options[1].name, "In Progress");
}

#[tokio::test]
async fn test_resolve_status_field_missing_status_errors() {
    let mut server = Server::new_async().await;
    let client = test_client(&server);

    let mock = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "user": {
                        "projectV2": {
                            "id": "project_42",
                            "field": null
                        }
                    },
                    "organization": null
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let err = client
        .resolve_status_field("kata-sh", 42)
        .await
        .expect_err("missing status field should error");

    mock.assert_async().await;
    match err {
        SymphonyError::GithubProjectsV2Error(message) => {
            assert!(message.contains("Status field not found on project #42"));
        }
        other => panic!("expected GithubProjectsV2Error, got {other:?}"),
    }
}

#[tokio::test]
async fn test_query_items_by_status_returns_matching_items() {
    let mut server = Server::new_async().await;
    let client = test_client(&server);

    let mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("fieldValueByName".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "data": {
                    "node": {
                        "items": {
                            "nodes": [
                                {
                                    "id": "item_1",
                                    "content": { "number": 101 },
                                    "fieldValueByName": {
                                        "name": "Todo",
                                        "optionId": "opt_todo"
                                    }
                                },
                                {
                                    "id": "item_2",
                                    "content": { "number": 102 },
                                    "fieldValueByName": {
                                        "name": "Done",
                                        "optionId": "opt_done"
                                    }
                                },
                                {
                                    "id": "item_3",
                                    "content": { "number": 103 },
                                    "fieldValueByName": null
                                }
                            ],
                            "pageInfo": {
                                "hasNextPage": false,
                                "endCursor": null
                            }
                        }
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    let items = client
        .query_items_by_status("project_42", &["opt_todo".to_string()])
        .await
        .expect("item query should succeed");

    mock.assert_async().await;
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].item_id, "item_1");
    assert_eq!(items[0].issue_number, 101);
    assert_eq!(items[0].status.as_deref(), Some("Todo"));
}

#[tokio::test]
async fn test_update_item_status_sends_mutation() {
    let mut server = Server::new_async().await;
    let client = test_client(&server);

    let mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::AllOf(vec![
            Matcher::Regex("updateProjectV2ItemFieldValue".to_string()),
            Matcher::PartialJson(json!({
                "variables": {
                    "projectId": "project_42",
                    "itemId": "item_123",
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
                        "projectV2Item": {
                            "id": "item_123"
                        }
                    }
                }
            })
            .to_string(),
        )
        .create_async()
        .await;

    client
        .update_item_status("project_42", "item_123", "status_field", "opt_done")
        .await
        .expect("status mutation should succeed");

    mock.assert_async().await;
}

#[test]
fn test_projects_v2_queries_use_plain_status_literal() {
    assert!(
        QUERY_PROJECT_FIELDS.contains("field(name: \"Status\")"),
        "QUERY_PROJECT_FIELDS should use a plain GraphQL string literal"
    );
    assert!(
        QUERY_PROJECT_ITEMS.contains("fieldValueByName(name: \"Status\")"),
        "QUERY_PROJECT_ITEMS should use a plain GraphQL string literal"
    );
    assert!(
        !QUERY_PROJECT_FIELDS.contains("\\\"Status\\\""),
        "QUERY_PROJECT_FIELDS should not contain escaped quotes inside a raw string"
    );
    assert!(
        !QUERY_PROJECT_ITEMS.contains("\\\"Status\\\""),
        "QUERY_PROJECT_ITEMS should not contain escaped quotes inside a raw string"
    );
}

#[tokio::test]
async fn test_graphql_error_produces_structured_error() {
    let mut server = Server::new_async().await;
    let client = test_client(&server);

    let mock = server
        .mock("POST", "/graphql")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            json!({
                "errors": [
                    { "message": "GraphQL exploded" }
                ],
                "data": null
            })
            .to_string(),
        )
        .create_async()
        .await;

    let err = client
        .resolve_status_field("kata-sh", 42)
        .await
        .expect_err("graphql errors should be surfaced");

    mock.assert_async().await;
    match err {
        SymphonyError::GithubProjectsV2Error(message) => {
            assert!(message.contains("GraphQL exploded"));
        }
        other => panic!("expected GithubProjectsV2Error, got {other:?}"),
    }
}
