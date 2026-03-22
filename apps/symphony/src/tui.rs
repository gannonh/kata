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
use ratatui::style::{Modifier, Style};
use ratatui::text::Line;
use ratatui::widgets::{Block, Borders, Cell, List, ListItem, Paragraph, Row, Table, Wrap};
use ratatui::{Frame, Terminal};
use tokio::sync::watch;
use tokio::time::MissedTickBehavior;

use crate::domain::OrchestratorSnapshot;
use crate::orchestrator::SnapshotHandle;

const REFRESH_INTERVAL_MS: u64 = 500;
const CURRENT_TPS_WINDOW_MS: i64 = 5_000;
const SPARKLINE_WINDOW_MS: i64 = 10 * 60 * 1_000;
const SPARKLINE_BUCKETS: usize = 24;
const SPARKLINE_BUCKET_MS: i64 = SPARKLINE_WINDOW_MS / SPARKLINE_BUCKETS as i64;
const SPARKLINE_BLOCKS: [char; 8] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

#[derive(Debug, Default)]
struct ThroughputTracker {
    token_samples: Vec<(i64, u64)>,
}

impl ThroughputTracker {
    fn record_sample(&mut self, timestamp_ms: i64, total_tokens: u64) {
        match self.token_samples.last_mut() {
            Some((last_ts, _last_total)) if timestamp_ms < *last_ts => {
                return;
            }
            Some((last_ts, last_total)) if timestamp_ms == *last_ts => {
                *last_total = (*last_total).max(total_tokens);
                return;
            }
            Some((_, last_total)) if total_tokens < *last_total => {
                self.token_samples.clear();
            }
            _ => {}
        }

        self.token_samples.push((timestamp_ms, total_tokens));
        self.trim_old_samples(timestamp_ms);
    }

    fn throughput_line(&self, now_ms: i64) -> String {
        let current_tps = self.current_tps(now_ms);
        let sparkline = self.sparkline(now_ms);
        format!("Throughput: {current_tps:.1} tps {sparkline}")
    }

    fn current_tps(&self, now_ms: i64) -> f64 {
        if self.token_samples.len() < 2 {
            return 0.0;
        }
        let window_start = now_ms.saturating_sub(CURRENT_TPS_WINDOW_MS);
        let delta = self.window_token_delta(window_start, now_ms);
        let window_seconds = (CURRENT_TPS_WINDOW_MS as f64) / 1_000.0;
        if window_seconds > 0.0 {
            delta / window_seconds
        } else {
            0.0
        }
    }

    fn sparkline(&self, now_ms: i64) -> String {
        let bucket_tps = self.bucket_tps(now_ms);
        let max_tps = bucket_tps
            .iter()
            .copied()
            .fold(0.0_f64, |acc, value| acc.max(value));

        if max_tps <= f64::EPSILON {
            return std::iter::repeat(SPARKLINE_BLOCKS[0])
                .take(SPARKLINE_BUCKETS)
                .collect();
        }

        bucket_tps
            .into_iter()
            .map(|value| {
                let ratio = (value / max_tps).clamp(0.0, 1.0);
                let idx = (ratio * (SPARKLINE_BLOCKS.len() as f64 - 1.0)).round() as usize;
                SPARKLINE_BLOCKS[idx]
            })
            .collect()
    }

    fn bucket_tps(&self, now_ms: i64) -> Vec<f64> {
        let window_start = now_ms.saturating_sub(SPARKLINE_WINDOW_MS);
        let mut bucket_tokens = vec![0.0; SPARKLINE_BUCKETS];

        for sample_pair in self.token_samples.windows(2) {
            let (start_ms, start_total) = sample_pair[0];
            let (end_ms, end_total) = sample_pair[1];

            if end_ms <= start_ms {
                continue;
            }
            if end_ms <= window_start || start_ms >= now_ms {
                continue;
            }

            let interval_tokens = end_total.saturating_sub(start_total) as f64;
            if interval_tokens <= 0.0 {
                continue;
            }

            let interval_start = start_ms.max(window_start);
            let interval_end = end_ms.min(now_ms);
            if interval_end <= interval_start {
                continue;
            }

            let tokens_per_ms = interval_tokens / (end_ms - start_ms) as f64;
            let mut cursor = interval_start;
            while cursor < interval_end {
                let bucket_index = (((cursor - window_start) / SPARKLINE_BUCKET_MS) as usize)
                    .min(SPARKLINE_BUCKETS.saturating_sub(1));
                let bucket_end =
                    (window_start + ((bucket_index + 1) as i64 * SPARKLINE_BUCKET_MS)).min(now_ms);
                let segment_end = bucket_end.min(interval_end);
                if segment_end <= cursor {
                    break;
                }
                let overlap_ms = (segment_end - cursor) as f64;
                bucket_tokens[bucket_index] += tokens_per_ms * overlap_ms;
                cursor = segment_end;
            }
        }

        let bucket_seconds = (SPARKLINE_BUCKET_MS as f64) / 1_000.0;
        if bucket_seconds <= 0.0 {
            return vec![0.0; SPARKLINE_BUCKETS];
        }

        bucket_tokens
            .into_iter()
            .map(|tokens| tokens / bucket_seconds)
            .collect()
    }

    fn trim_old_samples(&mut self, now_ms: i64) {
        if self.token_samples.len() < 2 {
            return;
        }

        let cutoff = now_ms.saturating_sub(SPARKLINE_WINDOW_MS);
        let first_in_window = self
            .token_samples
            .iter()
            .position(|(ts, _)| *ts >= cutoff)
            .unwrap_or_else(|| self.token_samples.len().saturating_sub(1));
        let keep_from = first_in_window.saturating_sub(1);
        if keep_from > 0 {
            self.token_samples.drain(0..keep_from);
        }
    }

    fn window_token_delta(&self, window_start_ms: i64, window_end_ms: i64) -> f64 {
        if window_end_ms <= window_start_ms {
            return 0.0;
        }

        let mut total = 0.0;
        for sample_pair in self.token_samples.windows(2) {
            let (start_ms, start_total) = sample_pair[0];
            let (end_ms, end_total) = sample_pair[1];

            if end_ms <= start_ms {
                continue;
            }
            if end_ms <= window_start_ms || start_ms >= window_end_ms {
                continue;
            }

            let overlap_start = start_ms.max(window_start_ms);
            let overlap_end = end_ms.min(window_end_ms);
            if overlap_end <= overlap_start {
                continue;
            }

            let interval_tokens = end_total.saturating_sub(start_total) as f64;
            let overlap_ms = (overlap_end - overlap_start) as f64;
            let interval_ms = (end_ms - start_ms) as f64;
            total += interval_tokens * (overlap_ms / interval_ms);
        }

        total
    }
}

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
    let mut throughput_tracker = ThroughputTracker::default();
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
        let now_ms = now.timestamp_millis();
        throughput_tracker.record_sample(now_ms, snapshot.codex_totals.total_tokens);
        let throughput_line = throughput_tracker.throughput_line(now_ms);
        if let Err(err) =
            terminal.draw(|frame| draw_dashboard(frame, &snapshot, now, &throughput_line))
        {
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

fn draw_dashboard(
    frame: &mut Frame,
    snapshot: &OrchestratorSnapshot,
    now: DateTime<Utc>,
    throughput_line: &str,
) {
    let root = Block::default()
        .title("Symphony Dashboard")
        .borders(Borders::ALL);
    frame.render_widget(root, frame.area());
    let inner = Block::default().borders(Borders::ALL).inner(frame.area());

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2),
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
    let summary_lines = vec![Line::from(summary), Line::from(throughput_line.to_string())];
    frame.render_widget(Paragraph::new(summary_lines), sections[0]);

    let running_header = Row::new(vec![
        Cell::from("ID"),
        Cell::from("State"),
        Cell::from("Turn"),
        Cell::from("Last Activity"),
        Cell::from("Tokens"),
        Cell::from("Host"),
    ])
    .style(Style::default().add_modifier(Modifier::BOLD));
    let running_rows = running_rows(snapshot, now);
    let running_table = Table::new(
        running_rows,
        [
            Constraint::Length(12),
            Constraint::Length(14),
            Constraint::Length(8),
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
        let state = run
            .linear_state
            .as_deref()
            .unwrap_or(run.status.as_str())
            .to_string();
        rows.push(Row::new(vec![
            Cell::from(run.issue_identifier.clone()),
            Cell::from(state),
            Cell::from(turn_count.to_string()),
            Cell::from(format_age(last_activity, now)),
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
            Cell::from("(none)"),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
            Cell::from(""),
        ]));
    }

    rows
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
    use ratatui::backend::TestBackend;
    use serde_json::json;
    use std::collections::{BTreeMap, BTreeSet};

    fn snapshot_fixture(total_tokens: u64) -> OrchestratorSnapshot {
        OrchestratorSnapshot {
            poll_interval_ms: REFRESH_INTERVAL_MS,
            max_concurrent_agents: 1,
            running: BTreeMap::new(),
            running_sessions: BTreeMap::new(),
            running_session_info: BTreeMap::new(),
            claimed: BTreeSet::new(),
            retry_queue: Vec::new(),
            completed: Vec::new(),
            codex_totals: crate::domain::CodexTotals {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens,
                seconds_running: 0.0,
            },
            codex_rate_limits: None,
            polling: crate::domain::PollingSnapshot {
                checking: false,
                next_poll_in_ms: 0,
                poll_interval_ms: REFRESH_INTERVAL_MS,
                last_poll_at: None,
                poll_count: 0,
            },
        }
    }

    fn render_text(backend: &TestBackend) -> String {
        let buffer = backend.buffer();
        let area = buffer.area();
        let mut lines = Vec::with_capacity(area.height as usize);
        for y in 0..area.height {
            let mut line = String::new();
            for x in 0..area.width {
                line.push_str(buffer[(x, y)].symbol());
            }
            lines.push(line);
        }
        lines.join("\n")
    }

    fn assert_approx_eq(actual: f64, expected: f64, tolerance: f64) {
        assert!(
            (actual - expected).abs() <= tolerance,
            "expected {expected}, got {actual} (tolerance {tolerance})"
        );
    }

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
    fn throughput_tracker_reports_current_tps_from_last_five_seconds() {
        let mut tracker = ThroughputTracker::default();
        tracker.record_sample(0, 0);
        tracker.record_sample(2_500, 50);
        tracker.record_sample(5_000, 100);

        assert_approx_eq(tracker.current_tps(5_000), 20.0, 0.001);
    }

    #[test]
    fn throughput_tracker_renders_flat_sparkline_for_zero_throughput() {
        let mut tracker = ThroughputTracker::default();
        tracker.record_sample(0, 42);
        tracker.record_sample(SPARKLINE_WINDOW_MS, 42);

        let sparkline = tracker.sparkline(SPARKLINE_WINDOW_MS);
        assert_eq!(sparkline.chars().count(), SPARKLINE_BUCKETS);
        assert!(sparkline.chars().all(|ch| ch == SPARKLINE_BLOCKS[0]));
    }

    #[test]
    fn throughput_tracker_renders_recent_spike_in_last_bucket() {
        let mut tracker = ThroughputTracker::default();
        let now_ms = SPARKLINE_WINDOW_MS;
        tracker.record_sample(now_ms - SPARKLINE_BUCKET_MS, 0);
        tracker.record_sample(now_ms, 2_500);

        let sparkline = tracker.sparkline(now_ms);
        let chars: Vec<char> = sparkline.chars().collect();
        assert_eq!(chars.len(), SPARKLINE_BUCKETS);
        assert!(
            chars[..SPARKLINE_BUCKETS - 1]
                .iter()
                .all(|ch| *ch == SPARKLINE_BLOCKS[0]),
            "expected all leading buckets to be flat, got {sparkline}"
        );
        assert_eq!(
            chars[SPARKLINE_BUCKETS - 1],
            SPARKLINE_BLOCKS[SPARKLINE_BLOCKS.len() - 1]
        );
    }

    #[test]
    fn throughput_tracker_trims_samples_to_window_with_one_preceding_point() {
        let mut tracker = ThroughputTracker::default();
        tracker.record_sample(0, 0);
        tracker.record_sample(1_000, 1);
        tracker.record_sample(SPARKLINE_WINDOW_MS + 100_000, 2);

        assert_eq!(tracker.token_samples.len(), 2);
        assert_eq!(tracker.token_samples[0].0, 1_000);
    }

    #[test]
    fn draw_dashboard_renders_throughput_row() {
        let now = Utc
            .with_ymd_and_hms(2026, 3, 22, 12, 0, 0)
            .single()
            .expect("valid fixture timestamp");
        let snapshot = snapshot_fixture(1_337);
        let throughput_line = "Throughput: 42.3 tps ▁▂▃▄▅▆▇█";

        let backend = TestBackend::new(120, 30);
        let mut terminal = Terminal::new(backend).expect("test terminal");
        terminal
            .draw(|frame| draw_dashboard(frame, &snapshot, now, throughput_line))
            .expect("dashboard draw should succeed");

        let rendered = render_text(terminal.backend());
        assert!(
            rendered.contains(throughput_line),
            "expected rendered dashboard to contain throughput line, got:\n{rendered}"
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
