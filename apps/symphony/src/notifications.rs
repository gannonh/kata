use anyhow::{anyhow, Result};
use serde::Serialize;

use crate::domain::SlackConfig;

#[derive(Debug, Serialize)]
struct SlackWebhookPayload {
    text: String,
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
        .any(|event| event == normalized)
}

pub fn format_slack_message(
    event_type: &str,
    issue_identifier: &str,
    issue_title: &str,
    message: &str,
    dashboard_url: Option<&str>,
) -> String {
    let normalized_event = normalize_event_type(event_type);
    let icon = event_icon(&normalized_event);

    let mut lines = vec![
        format!("{icon} {issue_identifier} — {issue_title}"),
        format!("Event: {normalized_event}"),
        message.trim().to_string(),
    ];

    if let Some(url) = dashboard_url.map(str::trim).filter(|url| !url.is_empty()) {
        lines.push(format!("Dashboard: {url}"));
    }

    lines.join("\n")
}

pub async fn send_slack_notification(
    config: &SlackConfig,
    event_type: &str,
    issue_identifier: &str,
    issue_title: &str,
    message: &str,
    dashboard_url: Option<&str>,
) -> Result<()> {
    if !should_notify(config, event_type) {
        return Ok(());
    }

    let normalized_event = normalize_event_type(event_type);
    let payload = SlackWebhookPayload {
        text: format_slack_message(
            &normalized_event,
            issue_identifier,
            issue_title,
            message,
            dashboard_url,
        ),
    };

    let response = reqwest::Client::new()
        .post(&config.webhook_url)
        .json(&payload)
        .send()
        .await
        .map_err(|err| anyhow!("Slack notification request failed: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let truncated_body: String = body.chars().take(240).collect();
        return Err(anyhow!(
            "Slack notification HTTP {}: {}",
            status.as_u16(),
            truncated_body
        ));
    }

    tracing::info!(
        event = "notification_sent",
        issue_id = %issue_identifier,
        event_type = %normalized_event,
        webhook_status = status.as_u16(),
        webhook_url = "[REDACTED]",
        "Slack notification sent"
    );

    Ok(())
}

fn normalize_event_type(event_type: &str) -> String {
    event_type.trim().to_ascii_lowercase()
}

fn event_icon(event_type: &str) -> &'static str {
    match event_type {
        "human_review" => "🔔",
        "stalled" => "⚠️",
        "failed" => "🚨",
        "rework" => "🔁",
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

    #[tokio::test]
    async fn test_notification_dispatch_formats_slack_message() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/webhook")
            .match_header("content-type", "application/json")
            .match_body(mockito::Matcher::Regex("KAT-928".to_string()))
            .match_body(mockito::Matcher::Regex("Event: human_review".to_string()))
            .match_body(mockito::Matcher::Regex(
                "Dashboard: http://127.0.0.1:8080".to_string(),
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
            Some("http://127.0.0.1:8080"),
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
}
