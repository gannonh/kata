use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt;
use std::ops::Deref;

// ── Issue (spec §4.1.1) ────────────────────────────────────────────────

/// Normalized issue record from the tracker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: Option<i32>,
    pub state: String,
    #[serde(default)]
    pub branch_name: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub assignee_id: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub blocked_by: Vec<BlockerRef>,
    /// Whether this issue is routable to this worker (assignee filter).
    #[serde(default = "default_true")]
    pub assigned_to_worker: bool,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
}

fn default_true() -> bool {
    true
}

/// A blocker reference from an inverse relation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockerRef {
    pub id: Option<String>,
    pub identifier: Option<String>,
    pub state: Option<String>,
}

// ── ApiKey ─────────────────────────────────────────────────────────────

/// A redacted API-key value.
///
/// `Debug` always prints `[REDACTED]` so the raw key can never leak into
/// tracing/log output, even via `{:?}` on a type that transitively contains
/// this field.  Use [`as_str`](ApiKey::as_str) or the `Deref<Target = str>`
/// impl to access the underlying value.
#[derive(Clone)]
pub struct ApiKey(String);

impl ApiKey {
    pub fn new(s: impl Into<String>) -> Self {
        ApiKey(s.into())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn into_string(self) -> String {
        self.0
    }
}

impl fmt::Debug for ApiKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}

impl PartialEq for ApiKey {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Deref for ApiKey {
    type Target = str;
    fn deref(&self) -> &str {
        &self.0
    }
}

impl From<String> for ApiKey {
    fn from(s: String) -> Self {
        ApiKey(s)
    }
}

impl From<&str> for ApiKey {
    fn from(s: &str) -> Self {
        ApiKey(s.to_string())
    }
}

// ── Workflow Definition (spec §4.1.2) ──────────────────────────────────

/// Parsed WORKFLOW.md payload.
#[derive(Debug, Clone)]
pub struct WorkflowDefinition {
    /// YAML front matter as a raw map.
    pub config: serde_yaml::Value,
    /// Markdown body after front matter, trimmed.
    pub prompt_template: String,
}

// ── Service Config (spec §4.1.3 + §5.3) ───────────────────────────────

/// Top-level typed runtime config derived from WorkflowDefinition.config.
#[derive(Debug, Clone, Default)]
pub struct ServiceConfig {
    pub tracker: TrackerConfig,
    pub polling: PollingConfig,
    pub workspace: WorkspaceConfig,
    pub worker: WorkerConfig,
    pub agent: AgentConfig,
    pub codex: CodexConfig,
    pub pi_agent: PiAgentConfig,
    pub agent_backend: AgentBackend,
    pub hooks: HooksConfig,
    pub server: ServerConfig,
}

/// Tracker configuration (spec §5.3.1).
#[derive(Debug, Clone)]
pub struct TrackerConfig {
    pub kind: Option<String>,
    pub endpoint: String,
    /// The Linear API key.  Stored as [`ApiKey`] so it cannot accidentally
    /// appear in debug/tracing output — `{:?}` on this struct prints `[REDACTED]`.
    pub api_key: Option<ApiKey>,
    pub project_slug: Option<String>,
    pub workspace_slug: Option<String>,
    pub assignee: Option<String>,
    pub active_states: Vec<String>,
    pub terminal_states: Vec<String>,
}

const DEFAULT_LINEAR_WORKSPACE_SLUG: &str = "kata-sh";

impl Default for TrackerConfig {
    fn default() -> Self {
        Self {
            kind: None,
            endpoint: "https://api.linear.app/graphql".to_string(),
            api_key: None,
            project_slug: None,
            workspace_slug: None,
            assignee: None,
            active_states: vec!["Todo".to_string(), "In Progress".to_string()],
            terminal_states: vec![
                "Closed".to_string(),
                "Cancelled".to_string(),
                "Canceled".to_string(),
                "Duplicate".to_string(),
                "Done".to_string(),
            ],
        }
    }
}

impl TrackerConfig {
    /// Build a browser URL for the configured Linear project.
    ///
    /// The project slug comes from workflow config (`tracker.project_slug`).
    /// Workspace slug can come from `tracker.workspace_slug`, with a fallback
    /// to Kata's default workspace for backward compatibility.
    pub fn linear_project_url(&self) -> Option<String> {
        let project_slug = self.project_slug.as_deref()?.trim();
        if project_slug.is_empty() {
            return None;
        }
        let workspace_slug = self
            .workspace_slug
            .as_deref()
            .unwrap_or(DEFAULT_LINEAR_WORKSPACE_SLUG)
            .trim();
        if workspace_slug.is_empty() {
            return None;
        }

        Some(format!(
            "https://linear.app/{workspace_slug}/project/{project_slug}"
        ))
    }
}

/// Polling configuration (spec §5.3.2).
#[derive(Debug, Clone)]
pub struct PollingConfig {
    pub interval_ms: u64,
}

impl Default for PollingConfig {
    fn default() -> Self {
        Self {
            interval_ms: 30_000,
        }
    }
}

/// Workspace configuration (spec §5.3.3).
#[derive(Debug, Clone)]
pub struct WorkspaceConfig {
    pub root: String,
    pub repo: Option<String>,
    pub strategy: WorkspaceRepoStrategy,
    pub isolation: WorkspaceIsolation,
    pub docker: Option<DockerConfig>,
    pub branch_prefix: String,
    pub clone_branch: Option<String>,
    pub base_branch: Option<String>,
    pub cleanup_on_done: bool,
}

/// Workspace repository bootstrap strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceRepoStrategy {
    CloneLocal,
    CloneRemote,
    Worktree,
    Auto,
}

/// Workspace runtime isolation strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceIsolation {
    Local,
    Docker,
}

/// Codex authentication mode for Docker containers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockerCodexAuth {
    /// OPENAI_API_KEY env var if set, else mount auth.json, else error.
    Auto,
    /// Force bind-mount of ~/.codex/auth.json (local only).
    Mount,
    /// Force OPENAI_API_KEY env var only (cloud deployments).
    Env,
}

/// Docker-specific workspace configuration.
#[derive(Debug, Clone)]
pub struct DockerConfig {
    /// Docker image name (e.g. "symphony-worker:latest").
    pub image: String,
    /// Optional setup script path, cached as derived image layer.
    pub setup: Option<String>,
    /// How to authenticate Codex inside the container.
    pub codex_auth: DockerCodexAuth,
    /// Additional environment variables passed to the container.
    pub env: Vec<String>,
    /// Additional volume mounts (e.g. "~/.ssh:/home/node/.ssh:ro").
    pub volumes: Vec<String>,
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            image: "symphony-worker:latest".to_string(),
            setup: None,
            codex_auth: DockerCodexAuth::Auto,
            env: vec![],
            volumes: vec![],
        }
    }
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            root: default_workspace_root(),
            repo: None,
            strategy: WorkspaceRepoStrategy::Auto,
            isolation: WorkspaceIsolation::Local,
            docker: None,
            branch_prefix: "symphony".to_string(),
            clone_branch: None,
            base_branch: Some("main".to_string()),
            cleanup_on_done: false,
        }
    }
}

fn default_workspace_root() -> String {
    let tmp = std::env::temp_dir();
    tmp.join("symphony_workspaces")
        .to_string_lossy()
        .to_string()
}

/// Worker configuration (SSH extension, spec §5.3 + Appendix A).
#[derive(Debug, Clone, Default)]
pub struct WorkerConfig {
    pub ssh_hosts: Vec<String>,
    pub max_concurrent_agents_per_host: Option<u32>,
}

/// Agent configuration (spec §5.3.5).
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub max_concurrent_agents: u32,
    pub max_turns: u32,
    pub max_retry_backoff_ms: u64,
    pub max_concurrent_agents_by_state: HashMap<String, u32>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_concurrent_agents: 10,
            max_turns: 20,
            max_retry_backoff_ms: 300_000,
            max_concurrent_agents_by_state: HashMap::new(),
        }
    }
}

/// Codex app-server configuration (spec §5.3.6).
#[derive(Debug, Clone)]
pub struct CodexConfig {
    /// Command and arguments used to launch the Codex app-server process.
    /// Stored as a list to enable exec-without-shell semantics (spec §5.3.6).
    /// The YAML field accepts either a string (`"codex app-server"`, split on
    /// whitespace) or an explicit list (`["codex", "app-server"]`).
    pub command: Vec<String>,
    pub approval_policy: serde_json::Value,
    pub thread_sandbox: String,
    pub turn_sandbox_policy: Option<serde_json::Value>,
    pub turn_timeout_ms: u64,
    pub read_timeout_ms: u64,
    pub stall_timeout_ms: u64,
}

impl Default for CodexConfig {
    fn default() -> Self {
        Self {
            command: vec!["codex".to_string(), "app-server".to_string()],
            approval_policy: serde_json::json!({
                "reject": {
                    "sandbox_approval": true,
                    "rules": true,
                    "mcp_elicitations": true
                }
            }),
            thread_sandbox: "workspace-write".to_string(),
            turn_sandbox_policy: None,
            turn_timeout_ms: 3_600_000,
            read_timeout_ms: 5_000,
            stall_timeout_ms: 300_000,
        }
    }
}

/// Which runtime backend to use for agent sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AgentBackend {
    KataCli,
    #[default]
    Codex,
}

/// Pi-agent (Kata RPC) runtime configuration.
#[derive(Debug, Clone)]
pub struct PiAgentConfig {
    /// Command and arguments to launch pi-agent.
    pub command: Vec<String>,
    /// Optional default model identifier passed via `--model`.
    pub model: Option<String>,
    /// Optional per-Linear-state model overrides (lowercased state names).
    pub model_by_state: HashMap<String, String>,
    /// Whether to pass `--no-session`.
    pub no_session: bool,
    /// Optional file path passed via `--append-system-prompt`.
    pub append_system_prompt: Option<String>,
    /// Timeout for stdout reads.
    pub read_timeout_ms: u64,
    /// Timeout for stalled sessions (no activity).
    pub stall_timeout_ms: u64,
}

impl Default for PiAgentConfig {
    fn default() -> Self {
        Self {
            command: vec!["kata".to_string()],
            model: None,
            model_by_state: HashMap::new(),
            no_session: true,
            append_system_prompt: None,
            read_timeout_ms: 5_000,
            stall_timeout_ms: 300_000,
        }
    }
}

/// Hooks configuration (spec §5.3.4).
#[derive(Debug, Clone)]
pub struct HooksConfig {
    pub after_create: Option<String>,
    pub before_run: Option<String>,
    pub after_run: Option<String>,
    pub before_remove: Option<String>,
    pub timeout_ms: u64,
}

impl Default for HooksConfig {
    fn default() -> Self {
        Self {
            after_create: None,
            before_run: None,
            after_run: None,
            before_remove: None,
            timeout_ms: 60_000,
        }
    }
}

/// Server configuration (extension, spec §13.7).
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: Option<u16>,
    pub host: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: None,
            host: "127.0.0.1".to_string(),
        }
    }
}

// ── Workspace (spec §4.1.4) ───────────────────────────────────────────

/// A prepared workspace directory for an issue run.
#[derive(Debug, Clone)]
pub struct Workspace {
    pub path: String,
    pub workspace_key: String,
    pub created_now: bool,
}

// ── RunAttempt (spec §4.1.5) ──────────────────────────────────────────

/// A single execution attempt for an issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunAttempt {
    pub issue_id: String,
    pub issue_identifier: String,
    #[serde(default)]
    pub issue_title: Option<String>,
    /// `None` for first attempt, `Some(n)` for retries.
    #[serde(default)]
    pub attempt: Option<u32>,
    pub workspace_path: String,
    pub started_at: DateTime<Utc>,
    pub status: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub worker_host: Option<String>,
    /// Effective model selected for this run attempt (backend-dependent).
    #[serde(default)]
    pub model: Option<String>,
    /// Linear issue state at dispatch time (e.g. "In Progress", "Agent Review").
    #[serde(default)]
    pub linear_state: Option<String>,
}

/// Per-session token usage scoped to a single running worker session.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct SessionTokenUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub total_tokens: u64,
}

/// Live worker-session diagnostics for dashboard rendering.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct WorkerSessionInfo {
    #[serde(default)]
    pub turn_count: u32,
    #[serde(default)]
    pub max_turns: u32,
    #[serde(skip)]
    pub stall_timeout_ms: i64,
    #[serde(default)]
    pub last_activity_ms: Option<i64>,
    #[serde(default)]
    pub session_tokens: SessionTokenUsage,
}

// ── LiveSession (spec §4.1.6) ─────────────────────────────────────────

/// Tracks the active Codex session for a running issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveSession {
    pub session_id: String,
    pub thread_id: String,
    pub turn_id: String,
    #[serde(default)]
    pub codex_app_server_pid: Option<String>,
    #[serde(default)]
    pub last_codex_event: Option<String>,
    #[serde(default)]
    pub last_codex_timestamp: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_codex_message: Option<String>,
    #[serde(default)]
    pub codex_input_tokens: u64,
    #[serde(default)]
    pub codex_output_tokens: u64,
    #[serde(default)]
    pub codex_total_tokens: u64,
    #[serde(default)]
    pub last_reported_input_tokens: u64,
    #[serde(default)]
    pub last_reported_output_tokens: u64,
    #[serde(default)]
    pub last_reported_total_tokens: u64,
    #[serde(default)]
    pub turn_count: u32,
    pub started_at: DateTime<Utc>,
    #[serde(default)]
    pub worker_host: Option<String>,
}

// ── RetryEntry (spec §4.1.7) ──────────────────────────────────────────

/// An issue queued for retry after a failed attempt.
#[derive(Debug, Clone)]
pub struct RetryEntry {
    pub issue_id: String,
    pub identifier: String,
    pub attempt: u32,
    /// Monotonic millisecond timestamp when retry is due.
    pub due_at_ms: i64,
    /// Opaque handle — concrete type wired in S06.
    pub timer_handle: Option<String>,
    pub error: Option<String>,
    pub worker_host: Option<String>,
    pub workspace_path: Option<String>,
}

// ── CodexTotals ───────────────────────────────────────────────────────

/// Aggregate token and time accounting across all agent sessions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodexTotals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub seconds_running: f64,
}

// ── RateLimitInfo ─────────────────────────────────────────────────────

/// Opaque rate-limit snapshot captured from agent events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitInfo {
    pub data: serde_json::Value,
}

// ── OrchestratorState (spec §4.1.8) ───────────────────────────────────

/// Mutable runtime state of the orchestrator loop.
#[derive(Debug, Clone)]
pub struct OrchestratorState {
    pub poll_interval_ms: u64,
    pub max_concurrent_agents: u32,
    pub running: HashMap<String, RunAttempt>,
    pub claimed: HashSet<String>,
    pub retry_attempts: HashMap<String, RetryEntry>,
    pub completed: HashMap<String, CompletedEntry>,
    pub codex_totals: CodexTotals,
    pub codex_rate_limits: Option<RateLimitInfo>,
}

// ── OrchestratorSnapshot (S06→S07 boundary) ───────────────────────────

/// A single retry entry in the snapshot (sorted, serializable).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrySnapshotEntry {
    pub issue_id: String,
    pub identifier: String,
    pub attempt: u32,
    pub due_in_ms: i64,
    pub error: Option<String>,
    pub worker_host: Option<String>,
    pub workspace_path: Option<String>,
}

/// A completed issue entry with human-readable metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedEntry {
    pub issue_id: String,
    pub identifier: String,
    pub title: String,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Session-level metrics for a currently running issue.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RunningSessionSnapshot {
    #[serde(default)]
    pub turn_count: u32,
    #[serde(default)]
    pub last_activity_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub total_tokens: u64,
    #[serde(default)]
    pub last_event: Option<String>,
    #[serde(default)]
    pub last_event_message: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
}

/// Polling state for the snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollingSnapshot {
    pub checking: bool,
    pub next_poll_in_ms: i64,
    pub poll_interval_ms: u64,
    #[serde(default)]
    pub last_poll_at: Option<String>,
    #[serde(default)]
    pub poll_count: u64,
}

/// Read-only serializable view of orchestrator state for the HTTP API.
/// Uses `BTreeMap` for deterministic JSON key ordering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorSnapshot {
    pub poll_interval_ms: u64,
    pub max_concurrent_agents: u32,
    #[serde(default)]
    pub linear_project_url: Option<String>,
    pub running: BTreeMap<String, RunAttempt>,
    #[serde(default)]
    pub running_sessions: BTreeMap<String, RunningSessionSnapshot>,
    #[serde(default)]
    pub running_session_info: BTreeMap<String, WorkerSessionInfo>,
    pub claimed: BTreeSet<String>,
    pub retry_queue: Vec<RetrySnapshotEntry>,
    pub completed: Vec<CompletedEntry>,
    pub codex_totals: CodexTotals,
    pub codex_rate_limits: Option<RateLimitInfo>,
    pub polling: PollingSnapshot,
}

// ── RefreshRequestOutcome (S07 HTTP control seam) ─────────────────────

/// Outcome of a refresh request from the HTTP control surface.
/// Used by both the orchestrator's refresh channel and the HTTP API response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RefreshRequestOutcome {
    /// Whether this request was queued for processing (first request).
    pub queued: bool,
    /// Whether this request was coalesced with an already-pending request.
    pub coalesced: bool,
    /// Number of pending refresh requests (always 0 or 1 due to coalescing).
    pub pending_requests: u64,
}

// ── AgentEvent (spec §10.4) ───────────────────────────────────────────

/// Events emitted by a Codex agent session, parsed from the event stream.
#[derive(Debug, Clone)]
pub enum AgentEvent {
    SessionStarted {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        session_id: String,
    },
    StartupFailed {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        error: String,
    },
    TurnCompleted {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        turn_id: String,
        message: Option<String>,
        input_tokens: u64,
        output_tokens: u64,
        total_tokens: u64,
        rate_limits: Option<serde_json::Value>,
    },
    TurnFailed {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        turn_id: String,
        error: String,
    },
    TurnCancelled {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        turn_id: String,
    },
    TurnEndedWithError {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        turn_id: String,
        error: String,
    },
    TurnInputRequired {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        turn_id: String,
        prompt: Option<String>,
    },
    ApprovalAutoApproved {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        tool_call: String,
    },
    ApprovalRequired {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        method: String,
        payload: serde_json::Value,
    },
    ToolCallCompleted {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        tool_name: String,
    },
    ToolCallFailed {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        tool_name: Option<String>,
    },
    ToolInputAutoAnswered {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
    },
    UnsupportedToolCall {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        tool_name: String,
    },
    Notification {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        message: String,
    },
    OtherMessage {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        raw: serde_json::Value,
    },
    Malformed {
        timestamp: DateTime<Utc>,
        codex_app_server_pid: Option<String>,
        raw_text: String,
        parse_error: String,
    },
}
