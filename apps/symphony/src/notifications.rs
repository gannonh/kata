use anyhow::{anyhow, Result};
use serde::Serialize;
use std::time::Duration;

use crate::domain::SlackConfig;

pub const SUPPORTED_SLACK_EVENTS: &[&str] = &[
    // State transitions
    "todo",
    "in_progress",
    "agent_review",
    "human_review",
    "merging",
    "rework",
    "done",
    "closed",
    "cancelled",
    "canceled",
    // Runtime events
    "stalled",
    "failed",
    // Wildcard
    "all",
];

const SLACK_CONNECT_TIMEOUT_SECS: u64 = 5;
const SLACK_REQUEST_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Serialize)]
struct SlackBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: SlackBlockText,
}

#[derive(Debug, Serialize)]
struct SlackBlockText {
    #[serde(rename = "type")]
    text_type: String,
    text: String,
}

#[derive(Debug, Serialize)]
struct SlackWebhookPayload {
    /// Fallback text for notifications/accessibility
    text: String,
    /// Block Kit blocks with mrkdwn support for rich formatting
    blocks: Vec<SlackBlock>,
}

pub fn should_notify(config: &SlackConfig, event_type: &str) -> bool {
    let normalized = normalize_event_type(event_type);
    if normalized.is_empty() {
        return false;
    }

    config
        .events
        .iter()
        .map(|event| normalize_event_type(event))
        .any(|event| event == "all" || event == normalized)
}

pub fn format_slack_message(
    event_type: &str,
    issue_identifier: &str,
    issue_title: &str,
    message: &str,
    issue_url: Option<&str>,
) -> String {
    let normalized_event = normalize_event_type(event_type);
    let icon = event_icon(&normalized_event);

    // Use Slack mrkdwn link for the issue identifier when URL is available
    let issue_ref = match issue_url.map(str::trim).filter(|u| !u.is_empty()) {
        Some(url) => format!("<{url}|{issue_identifier}>"),
        None => issue_identifier.to_string(),
    };

    let line1 = format!("{icon} {issue_ref} — {issue_title}");
    let line2 = message.trim();
    format!("{line1}\n{line2}")
}

pub async fn send_slack_notification(
    config: &SlackConfig,
    event_type: &str,
    issue_identifier: &str,
    issue_title: &str,
    message: &str,
    issue_url: Option<&str>,
) -> Result<()> {
    if !should_notify(config, event_type) {
        return Ok(());
    }

    let normalized_event = normalize_event_type(event_type);
    let mrkdwn_text = format_slack_message(
        event_type,
        issue_identifier,
        issue_title,
        message,
        issue_url,
    );
    // Fallback text without mrkdwn for notifications/accessibility
    let fallback = format!(
        "{} {} — {} — {}",
        event_icon(&normalized_event),
        issue_identifier,
        issue_title,
        message.trim(),
    );
    let payload = SlackWebhookPayload {
        text: fallback,
        blocks: vec![SlackBlock {
            block_type: "section".to_string(),
            text: SlackBlockText {
                text_type: "mrkdwn".to_string(),
                text: mrkdwn_text,
            },
        }],
    };

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(SLACK_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(SLACK_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|err| anyhow!("failed to build Slack notification HTTP client: {err}"))?;

    let response = client
        .post(&config.webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| anyhow!(sanitize_request_error(&err)))?;

    let status = response.status();
    if !status.is_success() {
        let body = match response.text().await {
            Ok(text) => text,
            Err(err) => format!("[response body unreadable: {err}]"),
        };
        let truncated_body: String = body.chars().take(240).collect();
        return Err(anyhow!(
            "Slack notification HTTP {}: {}",
            status.as_u16(),
            truncated_body
        ));
    }

    tracing::info!(
        event = "notification_sent",
        issue_identifier = %issue_identifier,
        event_type = %normalized_event,
        webhook_status = status.as_u16(),
        webhook_url = "[REDACTED]",
        "Slack notification sent"
    );

    Ok(())
}

pub fn is_supported_slack_event(event_type: &str) -> bool {
    let normalized = normalize_event_type(event_type);
    SUPPORTED_SLACK_EVENTS
        .iter()
        .any(|supported| *supported == normalized)
}

fn sanitize_request_error(err: &reqwest::Error) -> String {
    let category = if err.is_timeout() {
        "timeout"
    } else if err.is_connect() {
        "connect"
    } else if err.is_request() {
        "request"
    } else if err.is_status() {
        "status"
    } else {
        "transport"
    };

    format!("Slack notification request failed ({category} error)")
}

fn normalize_event_type(event_type: &str) -> String {
    event_type.trim().to_ascii_lowercase()
}

fn event_icon(event_type: &str) -> &'static str {
    match event_type {
        "todo" => "📋",
        "in_progress" => "🔧",
        "agent_review" => "🤖",
        "human_review" => "👀",
        "merging" => "🔀",
        "rework" => "🔁",
        "done" => "✅",
        "closed" => "🔒",
        "cancelled" | "canceled" => "❌",
        "stalled" => "⚠️",
        "failed" => "🚨",
        _ => "🔔",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[test]
    fn test_should_notify_filters_by_event_list() {
        let config = SlackConfig {
            webhook_url: "https://hooks.slack.test/mock".to_string(),
            events: vec!["stalled".to_string(), "human_review".to_string()],
        };

        assert!(should_notify(&config, "stalled"));
        assert!(should_notify(&config, "HUMAN_REVIEW"));
        assert!(!should_notify(&config, "failed"));
    }

    #[test]
    fn test_should_notify_wildcard_all() {
        let config = SlackConfig {
            webhook_url: "https://hooks.slack.test/mock".to_string(),
            events: vec!["all".to_string()],
        };
        assert!(should_notify(&config, "stalled"));
        assert!(should_notify(&config, "in_progress"));
        assert!(should_notify(&config, "done"));

        // Capitalised "All" in config should also work
        let config_upper = SlackConfig {
            webhook_url: "https://hooks.slack.test/mock".to_string(),
            events: vec!["All".to_string()],
        };
        assert!(should_notify(&config_upper, "failed"));
    }

    #[test]
    fn test_should_notify_canceled_alias() {
        let config = SlackConfig {
            webhook_url: "https://hooks.slack.test/mock".to_string(),
            events: vec!["canceled".to_string()],
        };
        assert!(should_notify(&config, "canceled"));
        assert!(should_notify(&config, "Canceled"));
    }

    #[test]
    fn test_is_supported_slack_event() {
        assert!(is_supported_slack_event("failed"));
        assert!(is_supported_slack_event("Human_Review"));
        assert!(!is_supported_slack_event("staleled"));
    }

    #[test]
    fn test_slack_message_formats_github_url() {
        let message = format_slack_message(
            "in_progress",
            "#42",
            "Fix login bug",
            "Moved to In Progress",
            Some("https://github.com/owner/repo/issues/42"),
        );

        assert!(
            message.contains("<https://github.com/owner/repo/issues/42|#42>"),
            "expected github issue to be rendered as Slack mrkdwn link"
        );
    }

    #[tokio::test]
    async fn test_notification_dispatch_formats_slack_message() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/webhook")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::Regex("KAT-928".to_string()))
            .match_body(mockito::Matcher::Regex(
                "linear.app/kata-sh/issue/kat-928".to_string(),
            ))
            .with_status(200)
            .create_async()
            .await;

        let config = SlackConfig {
            webhook_url: format!("{}/webhook", server.url()),
            events: vec!["human_review".to_string()],
        };

        send_slack_notification(
            &config,
            "human_review",
            "KAT-928",
            "Fix sparkline",
            "PR ready for review.",
            Some("https://linear.app/kata-sh/issue/kat-928"),
        )
        .await
        .expect("notification should be delivered");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_notification_dispatch_filters_events() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/webhook")
            .with_status(200)
            .expect(0)
            .create_async()
            .await;

        let config = SlackConfig {
            webhook_url: format!("{}/webhook", server.url()),
            events: vec!["stalled".to_string()],
        };

        send_slack_notification(
            &config,
            "failed",
            "KAT-920",
            "Worker stall",
            "Agent failed after max retries",
            None,
        )
        .await
        .expect("filtered events should short-circuit as success");

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_notification_failure_is_non_fatal() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/webhook")
            .with_status(500)
            .with_body("boom")
            .create_async()
            .await;

        let config = SlackConfig {
            webhook_url: format!("{}/webhook", server.url()),
            events: vec!["failed".to_string()],
        };

        let result = send_slack_notification(
            &config,
            "failed",
            "KAT-920",
            "Worker crashed",
            "Agent failed after max retries",
            None,
        )
        .await;

        assert!(result.is_err(), "HTTP errors should return Err");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_notification_request_error_message_does_not_include_webhook_url() {
        let webhook_url = "http://127.0.0.1:1/webhook";
        let config = SlackConfig {
            webhook_url: webhook_url.to_string(),
            events: vec!["failed".to_string()],
        };

        let err = send_slack_notification(
            &config,
            "failed",
            "KAT-920",
            "Worker crashed",
            "Agent failed after max retries",
            None,
        )
        .await
        .expect_err("unreachable endpoint should return an error");

        let err_text = err.to_string();
        assert!(!err_text.contains(webhook_url));
        assert!(err_text.contains("Slack notification request failed"));
    }
}
