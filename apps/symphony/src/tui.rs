use std::io;
use std::io::IsTerminal;
use std::time::Duration;

use chrono::{DateTime, Utc};
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Cell, List, ListItem, Paragraph, Row, Table, Wrap};
use ratatui::{Frame, Terminal};
use tokio::sync::watch;
use tokio::time::MissedTickBehavior;

use crate::domain::OrchestratorSnapshot;
use crate::orchestrator::SnapshotHandle;

const REFRESH_INTERVAL_MS: u64 = 500;
const STALE_ACTIVITY_THRESHOLD_MS: i64 = 120_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TuiExitReason {
    ShutdownSignal,
    CtrlC,
    SetupFailed,
    InputError,
    DrawError,
}

pub fn validate_terminal_for_tui() -> Result<(), String> {
    if !io::stdout().is_terminal() {
        return Err("stdout is not a terminal; --tui requires an interactive terminal".to_string());
    }

    enable_raw_mode().map_err(|err| format!("failed to enable raw mode: {err}"))?;
    let mut stdout = io::stdout();
    if let Err(err) = execute!(stdout, EnterAlternateScreen, LeaveAlternateScreen) {
        let _ = disable_raw_mode();
        return Err(format!(
            "failed to enter/leave alternate screen during TUI preflight: {err}"
        ));
    }
    disable_raw_mode().map_err(|err| format!("failed to disable raw mode: {err}"))?;
    Ok(())
}

pub async fn run_tui(
    snapshot_handle: SnapshotHandle,
    mut shutdown: watch::Receiver<bool>,
) -> TuiExitReason {
    let mut terminal = match setup_terminal() {
        Ok(terminal) => terminal,
        Err(err) => {
            tracing::error!(error = %err, "failed to initialize tui terminal");
            return TuiExitReason::SetupFailed;
        }
    };

    let mut ticker = tokio::time::interval(Duration::from_millis(REFRESH_INTERVAL_MS));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ticker.tick().await;
    let exit_reason = loop {
        match ctrl_c_pressed() {
            Ok(true) => break TuiExitReason::CtrlC,
            Ok(false) => {}
            Err(err) => {
                tracing::warn!(error = %err, "failed reading terminal input for ctrl+c");
                break TuiExitReason::InputError;
            }
        }

        let snapshot = snapshot_handle.read();
        let now = Utc::now();
        if let Err(err) = terminal.draw(|frame| draw_dashboard(frame, &snapshot, now)) {
            tracing::error!(error = %err, "failed drawing tui frame");
            break TuiExitReason::DrawError;
        }

        tokio::select! {
            _ = ticker.tick() => {}
            changed = shutdown.changed() => {
                match changed {
                    Ok(()) => {
                        if *shutdown.borrow() {
                            break TuiExitReason::ShutdownSignal;
                        }
                    }
                    Err(_) => break TuiExitReason::ShutdownSignal,
                }
            }
        }
    };

    if let Err(err) = restore_terminal(&mut terminal) {
        tracing::warn!(error = %err, "failed restoring terminal after tui shutdown");
    }

    exit_reason
}

fn ctrl_c_pressed() -> io::Result<bool> {
    while event::poll(Duration::from_millis(0))? {
        if let Event::Key(key_event) = event::read()? {
            let ctrl_c = key_event.modifiers.contains(KeyModifiers::CONTROL)
                && key_event.code == KeyCode::Char('c')
                && matches!(key_event.kind, KeyEventKind::Press | KeyEventKind::Repeat);
            if ctrl_c {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

fn setup_terminal() -> io::Result<Terminal<CrosstermBackend<io::Stdout>>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    if let Err(err) = execute!(stdout, EnterAlternateScreen) {
        let _ = disable_raw_mode();
        return Err(err);
    }
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = match Terminal::new(backend) {
        Ok(terminal) => terminal,
        Err(err) => {
            cleanup_partial_terminal_state();
            return Err(err);
        }
    };
    if let Err(err) = terminal.clear() {
        cleanup_partial_terminal_state();
        return Err(err);
    }
    Ok(terminal)
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
    let raw_result = disable_raw_mode();
    let screen_result = execute!(terminal.backend_mut(), LeaveAlternateScreen);
    let cursor_result = terminal.show_cursor();

    raw_result?;
    screen_result?;
    cursor_result
}

fn cleanup_partial_terminal_state() {
    let _ = disable_raw_mode();
    let mut stdout = io::stdout();
    let _ = execute!(stdout, LeaveAlternateScreen);
}

fn draw_dashboard(frame: &mut Frame, snapshot: &OrchestratorSnapshot, now: DateTime<Utc>) {
    let root = Block::default()
        .title("Symphony Dashboard")
        .borders(Borders::ALL);
    frame.render_widget(root, frame.area());
    let inner = Block::default().borders(Borders::ALL).inner(frame.area());

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(8),
            Constraint::Length(7),
            Constraint::Length(7),
            Constraint::Length(2),
        ])
        .split(inner);

    let summary = format!(
        "Running: {}  Retry: {}  Completed: {}  Tokens: {}",
        snapshot.running.len(),
        snapshot.retry_queue.len(),
        snapshot.completed.len(),
        format_tokens(snapshot.codex_totals.total_tokens)
    );
    frame.render_widget(Paragraph::new(summary), sections[0]);

    let running_header = Row::new(vec![
        Cell::from(""),
        Cell::from("ID"),
        Cell::from("Session"),
        Cell::from("State"),
        Cell::from("Turn"),
        Cell::from("Last Event"),
        Cell::from("Message"),
        Cell::from("Last Activity"),
        Cell::from("Tokens"),
        Cell::from("Host"),
    ])
    .style(Style::default().add_modifier(Modifier::BOLD));
    let running_rows = running_rows(snapshot, now);
    let running_table = Table::new(
        running_rows,
        [
            Constraint::Length(2),
            Constraint::Length(10),
            Constraint::Length(12),
            Constraint::Length(14),
            Constraint::Length(8),
            Constraint::Length(24),
            Constraint::Min(16),
            Constraint::Length(14),
            Constraint::Length(12),
            Constraint::Length(10),
        ],
    )
    .header(running_header)
    .block(
        Block::default()
            .title("Running Sessions")
            .borders(Borders::ALL),
    );
    frame.render_widget(running_table, sections[1]);

    let retry_header = Row::new(vec![
        Cell::from("ID"),
        Cell::from("Attempt"),
        Cell::from("Retry In"),
        Cell::from("Host"),
        Cell::from("Error"),
    ])
    .style(Style::default().add_modifier(Modifier::BOLD));
    let retry_rows = retry_rows(snapshot);
    let retry_table = Table::new(
        retry_rows,
        [
            Constraint::Length(12),
            Constraint::Length(8),
            Constraint::Length(10),
            Constraint::Length(10),
            Constraint::Min(16),
        ],
    )
    .header(retry_header)
    .block(Block::default().title("Retry Queue").borders(Borders::ALL));
    frame.render_widget(retry_table, sections[2]);

    let completed_items = completed_items(snapshot);
    let completed_list =
        List::new(completed_items).block(Block::default().title("Completed").borders(Borders::ALL));
    frame.render_widget(completed_list, sections[3]);

    let polling_last = snapshot
        .polling
        .last_poll_at
        .as_deref()
        .and_then(parse_rfc3339)
        .map(|ts| format_age(Some(ts), now))
        .unwrap_or_else(|| "never".to_string());
    let polling_line = format!(
        "Polling: last {}  count: {}  interval: {}",
        polling_last,
        snapshot.polling.poll_count,
        format_duration(snapshot.polling.poll_interval_ms as i64),
    );
    let rate_summary = rate_summary(snapshot, now);
    let footer = Paragraph::new(vec![Line::from(polling_line), Line::from(rate_summary)])
        .wrap(Wrap { trim: true });
    frame.render_widget(footer, sections[4]);
}

fn running_rows(snapshot: &OrchestratorSnapshot, now: DateTime<Utc>) -> Vec<Row<'static>> {
    let mut rows = Vec::new();
    for (issue_id, run) in &snapshot.running {
        let metrics = snapshot.running_sessions.get(issue_id);
        let turn_count = metrics.map(|m| m.turn_count).unwrap_or(0);
        let last_activity = metrics
            .and_then(|m| m.last_activity_at.as_ref().cloned())
            .or(Some(run.started_at));
        let total_tokens = metrics.map(|m| m.total_tokens).unwrap_or(0);
        let last_event = metrics.and_then(|m| m.last_event.as_deref());
        let last_event_message = metrics.and_then(|m| m.last_event_message.as_deref());
        let session_id = metrics.and_then(|m| m.session_id.as_deref());
        let stale = is_stale_session(last_activity, now);
        let state = run
            .linear_state
            .as_deref()
            .unwrap_or(run.status.as_str())
            .to_string();
        let last_activity_text = format_age(last_activity, now);
        let last_activity_cell = if stale {
            Cell::from(Span::styled(
                last_activity_text,
                Style::default().fg(Color::Red),
            ))
        } else {
            Cell::from(last_activity_text)
        };

        rows.push(Row::new(vec![
            Cell::from(status_dot(last_event, last_activity, now)),
            Cell::from(run.issue_identifier.clone()),
            Cell::from(compact_session_id(session_id)),
            Cell::from(state),
            Cell::from(turn_count.to_string()),
            Cell::from(truncate_for_cell(last_event.unwrap_or("-"), 32)),
            Cell::from(truncate_for_cell(last_event_message.unwrap_or("-"), 60)),
            last_activity_cell,
            Cell::from(format_tokens(total_tokens)),
            Cell::from(
                run.worker_host
                    .as_deref()
                    .map(str::to_string)
                    .unwrap_or_else(|| "local".to_string()),
            ),
        ]));
    }

    if rows.is_empty() {
        rows.push(Row::new(vec![
            Cell::from(""),
            Cell::from("(none)"),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
        ]));
    }

    rows
}

fn compact_session_id(session_id: Option<&str>) -> String {
    session_id
        .map(|value| value.chars().take(8).collect::<String>())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "-".to_string())
}

fn status_dot(
    last_event: Option<&str>,
    last_activity: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Span<'static> {
    Span::styled(
        "●",
        Style::default().fg(status_color(last_event, last_activity, now)),
    )
}

fn status_color(
    last_event: Option<&str>,
    last_activity: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Color {
    if last_event.is_none() || is_stale_session(last_activity, now) {
        return Color::Red;
    }

    let normalized = last_event
        .map(|event| event.trim().to_ascii_lowercase())
        .unwrap_or_default();

    if normalized.contains("turn_completed") || normalized == "turn/completed" {
        Color::Magenta
    } else if normalized.contains("token_count") {
        Color::Yellow
    } else if normalized.contains("task_started")
        || normalized.contains("tool_call")
        || normalized.contains("item/tool/call")
    {
        Color::Green
    } else {
        Color::Blue
    }
}

fn is_stale_session(last_activity: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    let Some(last_activity) = last_activity else {
        return true;
    };

    (now - last_activity).num_milliseconds() > STALE_ACTIVITY_THRESHOLD_MS
}

fn truncate_for_cell(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }

    let mut out = String::new();
    for ch in normalized.chars().take(max_chars.saturating_sub(1)) {
        out.push(ch);
    }
    out.push('…');
    out
}

fn retry_rows(snapshot: &OrchestratorSnapshot) -> Vec<Row<'static>> {
    let mut rows = Vec::new();
    for retry in &snapshot.retry_queue {
        rows.push(Row::new(vec![
            Cell::from(retry.identifier.clone()),
            Cell::from(retry.attempt.to_string()),
            Cell::from(format_retry_delay(retry.due_in_ms)),
            Cell::from(
                retry
                    .worker_host
                    .as_deref()
                    .map(str::to_string)
                    .unwrap_or_else(|| "local".to_string()),
            ),
            Cell::from(retry.error.clone().unwrap_or_else(|| "-".to_string())),
        ]));
    }

    if rows.is_empty() {
        rows.push(Row::new(vec![
            Cell::from("(empty)"),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
        ]));
    }

    rows
}

fn completed_items(snapshot: &OrchestratorSnapshot) -> Vec<ListItem<'static>> {
    if snapshot.completed.is_empty() {
        return vec![ListItem::new("(empty)")];
    }

    snapshot
        .completed
        .iter()
        .map(|entry| {
            let timestamp = entry
                .completed_at
                .as_ref()
                .map(|dt| dt.format("%-I:%M %p").to_string())
                .unwrap_or_else(|| "-".to_string());
            ListItem::new(format!(
                "{} - {} ({})",
                entry.identifier, entry.title, timestamp
            ))
        })
        .collect()
}

fn rate_summary(snapshot: &OrchestratorSnapshot, now: DateTime<Utc>) -> String {
    let Some(rate_limits) = snapshot.codex_rate_limits.as_ref() else {
        return "Rate: n/a".to_string();
    };

    let parts = summarize_rate_limits(&rate_limits.data, now);
    if parts.is_empty() {
        "Rate: n/a".to_string()
    } else {
        format!("Rate: {}", parts.join("  "))
    }
}

fn summarize_rate_limits(data: &serde_json::Value, now: DateTime<Utc>) -> Vec<String> {
    let mut parts = Vec::new();

    let Some(obj) = data.as_object() else {
        return parts;
    };

    for (name, value) in obj {
        if matches!(name.as_str(), "limit_id" | "limit_name") {
            continue;
        }
        let Some(bucket) = value.as_object() else {
            continue;
        };
        if let Some(text) = bucket_usage_text(name, bucket, now) {
            parts.push(text);
        }
    }

    if parts.is_empty() {
        if let Some(text) = obj
            .get("limit_name")
            .and_then(|v| v.as_str())
            .and_then(|label| bucket_usage_text(label, obj, now))
        {
            parts.push(text);
        } else if let Some(text) = bucket_usage_text("limit", obj, now) {
            parts.push(text);
        }
    }

    parts.sort();
    parts
}

fn bucket_usage_text(
    label: &str,
    bucket: &serde_json::Map<String, serde_json::Value>,
    now: DateTime<Utc>,
) -> Option<String> {
    let remaining = bucket.get("remaining").and_then(as_f64)?;
    let limit = bucket.get("limit").and_then(as_f64)?;
    if limit <= 0.0 {
        return None;
    }

    let used_pct = ((1.0 - (remaining / limit)) * 100.0)
        .clamp(0.0, 100.0)
        .round() as i64;
    let window = bucket_window(bucket, now).unwrap_or_else(|| "-".to_string());
    Some(format!("{label}: {used_pct}% used ({window})"))
}

fn bucket_window(
    bucket: &serde_json::Map<String, serde_json::Value>,
    now: DateTime<Utc>,
) -> Option<String> {
    let reset_at = bucket
        .get("resets_at")
        .and_then(|v| v.as_str())
        .and_then(parse_rfc3339)
        .or_else(|| {
            bucket
                .get("reset_at")
                .and_then(|v| v.as_str())
                .and_then(parse_rfc3339)
        });

    if let Some(reset_at) = reset_at {
        return Some(format_duration((reset_at - now).num_milliseconds()));
    }

    if let Some(reset_seconds) = bucket.get("reset_seconds").and_then(as_f64) {
        return Some(format_duration((reset_seconds * 1000.0) as i64));
    }

    None
}

fn parse_rfc3339(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn format_age(timestamp: Option<DateTime<Utc>>, now: DateTime<Utc>) -> String {
    let Some(timestamp) = timestamp else {
        return "-".to_string();
    };

    let delta_ms = (now - timestamp).num_milliseconds().max(0);
    if delta_ms < 1_000 {
        "just now".to_string()
    } else {
        format!("{} ago", format_duration(delta_ms))
    }
}

fn format_retry_delay(due_in_ms: i64) -> String {
    if due_in_ms <= 0 {
        "ready".to_string()
    } else {
        format_duration(due_in_ms)
    }
}

fn format_duration(ms: i64) -> String {
    let ms = ms.max(0);
    if ms < 1_000 {
        return format!("{ms}ms");
    }

    let seconds = ms / 1_000;
    if seconds < 60 {
        return format!("{seconds}s");
    }

    let minutes = seconds / 60;
    if minutes < 60 {
        return format!("{minutes}m");
    }

    let hours = minutes / 60;
    if hours < 24 {
        return format!("{hours}h");
    }

    let days = hours / 24;
    format!("{days}d")
}

fn format_tokens(value: u64) -> String {
    let digits = value.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (idx, ch) in digits.chars().rev().enumerate() {
        if idx > 0 && idx % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    out.chars().rev().collect()
}

fn as_f64(value: &serde_json::Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_u64().map(|v| v as f64))
        .or_else(|| value.as_i64().map(|v| v as f64))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    #[test]
    fn format_age_returns_seconds_ago() {
        let now = Utc
            .with_ymd_and_hms(2026, 3, 22, 15, 0, 10)
            .single()
            .expect("valid fixture timestamp");
        let then = Utc
            .with_ymd_and_hms(2026, 3, 22, 15, 0, 8)
            .single()
            .expect("valid fixture timestamp");
        assert_eq!(format_age(Some(then), now), "2s ago");
    }

    #[test]
    fn format_retry_delay_handles_ready_and_future() {
        assert_eq!(format_retry_delay(-100), "ready");
        assert_eq!(format_retry_delay(5_000), "5s");
    }

    #[test]
    fn summarize_rate_limits_extracts_usage() {
        let now = Utc
            .with_ymd_and_hms(2026, 3, 22, 10, 0, 0)
            .single()
            .expect("valid fixture timestamp");
        let data = json!({
            "limit_id": "req",
            "primary": {
                "remaining": 82,
                "limit": 100,
                "reset_seconds": 18_000
            },
            "secondary": {
                "remaining": 33,
                "limit": 50,
                "reset_seconds": 604_800
            }
        });

        let summary = summarize_rate_limits(&data, now);
        assert!(
            summary
                .iter()
                .any(|line| line.contains("primary: 18% used")),
            "expected primary usage summary, got: {summary:?}"
        );
        assert!(
            summary
                .iter()
                .any(|line| line.contains("secondary: 34% used")),
            "expected secondary usage summary, got: {summary:?}"
        );
    }

    #[test]
    fn compact_session_id_truncates_to_first_eight_chars() {
        assert_eq!(
            compact_session_id(Some("1234567890abcdef")),
            "12345678".to_string()
        );
        assert_eq!(compact_session_id(None), "-".to_string());
    }

    #[test]
    fn status_color_respects_event_mapping_and_staleness() {
        let now = Utc
            .with_ymd_and_hms(2026, 3, 22, 15, 0, 0)
            .single()
            .expect("valid fixture timestamp");
        let fresh = Utc
            .with_ymd_and_hms(2026, 3, 22, 14, 59, 30)
            .single()
            .expect("valid fixture timestamp");
        let stale = Utc
            .with_ymd_and_hms(2026, 3, 22, 14, 55, 0)
            .single()
            .expect("valid fixture timestamp");

        assert_eq!(
            status_color(Some("codex/event/task_started"), Some(fresh), now),
            Color::Green
        );
        assert_eq!(
            status_color(Some("codex/event/token_count"), Some(fresh), now),
            Color::Yellow
        );
        assert_eq!(
            status_color(Some("turn_completed"), Some(fresh), now),
            Color::Magenta
        );
        assert_eq!(
            status_color(Some("notification"), Some(fresh), now),
            Color::Blue
        );
        assert_eq!(status_color(None, Some(fresh), now), Color::Red);
        assert_eq!(
            status_color(Some("turn_completed"), Some(stale), now),
            Color::Red
        );
    }

    #[test]
    fn validate_terminal_requires_tty_stdout() {
        if io::stdout().is_terminal() {
            return;
        }
        assert!(
            validate_terminal_for_tui().is_err(),
            "non-interactive stdout should fail tui preflight"
        );
    }
}
