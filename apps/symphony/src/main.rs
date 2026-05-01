use std::ffi::OsString;
use std::path::{Path, PathBuf};

use clap::{Parser, Subcommand};
use symphony::domain::ServiceConfig;

#[cfg(not(test))]
use symphony::doctor;
#[cfg(not(test))]
use symphony::orchestrator::OrchestratorPort;
#[cfg(not(test))]
use symphony::workflow_store::WorkflowStore;
#[cfg(not(test))]
use symphony::{config, error};

#[cfg(not(test))]
use std::future::{pending, Future};
#[cfg(not(test))]
use std::io::Write;
#[cfg(not(test))]
use std::process::Command;
#[cfg(not(test))]
use std::sync::{Arc, Mutex, Once};
#[cfg(not(test))]
use std::time::Duration;
#[cfg(not(test))]
use symphony::domain::{Issue, TrackerConfig};
#[cfg(not(test))]
use symphony::github::adapter::GithubAdapter;
#[cfg(not(test))]
use symphony::github::auth::{
    github_token_missing_message, github_token_source_name, resolve_github_token,
};
#[cfg(not(test))]
use symphony::github::client::{GithubClient, GithubIssueComment};
#[cfg(not(test))]
use symphony::http_server::{
    bind_http_listener_with_fallback, start_http_server, HttpServerState, HTTP_PORT_RETRY_LIMIT,
};
#[cfg(not(test))]
use symphony::linear::adapter::{LinearAdapter, TrackerAdapter};
#[cfg(not(test))]
use symphony::linear::client::LinearClient;
#[cfg(not(test))]
use symphony::logging;
#[cfg(not(test))]
use symphony::orchestrator::Orchestrator;
#[cfg(not(test))]
use symphony::tui;
#[cfg(not(test))]
use tokio::net::TcpListener;
#[cfg(not(test))]
use tracing_appender::non_blocking::WorkerGuard;
#[cfg(not(test))]
use tracing_subscriber::EnvFilter;

#[derive(Debug, Clone, Subcommand, PartialEq, Eq)]
pub enum CliCommand {
    /// Run preflight diagnostics without starting the orchestrator
    Doctor {
        /// Path to WORKFLOW.md
        #[arg(default_value = "WORKFLOW.md")]
        workflow_path: String,
    },
    /// Run a backend-neutral Symphony helper operation for worker sessions
    Helper {
        /// Helper operation, such as issue.get or issue.update-state
        operation: String,
        /// Path to WORKFLOW.md
        #[arg(long, default_value = "WORKFLOW.md")]
        workflow: String,
        /// JSON input file for the helper operation
        #[arg(long)]
        input: Option<String>,
    },
}

#[derive(Parser, Debug, Clone)]
#[command(
    name = "symphony",
    about = "Symphony orchestrator — polls Linear, dispatches Codex agent sessions"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<CliCommand>,

    /// Path to WORKFLOW.md
    #[arg(default_value = "WORKFLOW.md")]
    pub workflow_path: String,

    /// HTTP server port (overrides WORKFLOW.md server.port; defaults to 8080 if neither is set)
    #[arg(long)]
    pub port: Option<u16>,

    /// Log file root directory
    #[arg(long)]
    pub logs_root: Option<String>,

    /// Legacy compatibility flag. TUI is now enabled by default.
    #[arg(long, hide = true)]
    pub tui: bool,

    /// Disable the live terminal dashboard (Ratatui)
    #[arg(long)]
    pub no_tui: bool,
}

const SYMPHONY_LOG_ENV: &str = "SYMPHONY_LOG";
const LEGACY_RUST_LOG_ENV: &str = "RUST_LOG";
const SYMPHONY_LOG_ROOT_ENV: &str = "SYMPHONY_LOG_ROOT";

pub(crate) fn apply_env_defaults(cli: &mut Cli) {
    if cli.logs_root.is_none() {
        if let Ok(logs_root) = std::env::var(SYMPHONY_LOG_ROOT_ENV) {
            let logs_root = logs_root.trim();
            if !logs_root.is_empty() {
                cli.logs_root = Some(logs_root.to_string());
            }
        }
    }
}

pub(crate) fn resolve_log_filter_directive() -> String {
    env_var_non_empty(SYMPHONY_LOG_ENV)
        .or_else(|| env_var_non_empty(LEGACY_RUST_LOG_ENV))
        .unwrap_or_else(|| "info".to_string())
}

fn env_var_non_empty(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

pub trait BootstrapDeps {
    fn workflow_exists(&mut self, workflow_path: &Path) -> bool;
    fn startup_validate(&mut self, workflow_path: &Path) -> Result<(), String>;
    fn start_orchestrator(&mut self, workflow_path: &Path, cli: &Cli) -> Result<(), String>;
}

#[cfg(not(test))]
struct StartupContext {
    workflow_path: PathBuf,
    workflow_store: WorkflowStore,
    effective_config: ServiceConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HttpBinding {
    pub(crate) host: String,
    pub(crate) port: u16,
}

#[cfg(not(test))]
struct PreparedHttpServer {
    host: String,
    configured_port: u16,
    bound_port: u16,
    banner_binding: HttpBinding,
    listener: TcpListener,
}

#[cfg(not(test))]
struct LinearOrchestratorPort {
    workflow_store: Arc<WorkflowStore>,
}

#[cfg(not(test))]
impl LinearOrchestratorPort {
    fn new(workflow_store: Arc<WorkflowStore>) -> Self {
        Self { workflow_store }
    }

    fn block_on<T>(&self, future: impl Future<Output = error::Result<T>>) -> error::Result<T> {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
    }

    fn tracker_adapter(&self) -> LinearAdapter {
        let (_, effective_config) = self.workflow_store.effective_config();
        LinearAdapter::new(LinearClient::new(effective_config.tracker))
    }
}

#[cfg(not(test))]
impl OrchestratorPort for LinearOrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> error::Result<Vec<Issue>> {
        let adapter = self.tracker_adapter();
        self.block_on(adapter.fetch_issues_by_states(terminal_states))
    }

    fn reconcile_running_issues(
        &mut self,
        running_issue_ids: &[String],
    ) -> error::Result<Vec<Issue>> {
        if running_issue_ids.is_empty() {
            return Ok(vec![]);
        }

        let adapter = self.tracker_adapter();
        self.block_on(adapter.fetch_issue_states_by_ids(running_issue_ids))
    }

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> error::Result<()> {
        config::validate(config).map(|_| ())
    }

    fn fetch_candidate_issues(&mut self) -> error::Result<Vec<Issue>> {
        let adapter = self.tracker_adapter();
        self.block_on(adapter.fetch_candidate_issues())
    }

    fn refresh_issue(&mut self, issue_id: &str) -> error::Result<Option<Issue>> {
        let adapter = self.tracker_adapter();
        let issue_ids = vec![issue_id.to_string()];
        let issues = self.block_on(adapter.fetch_issue_states_by_ids(&issue_ids))?;
        Ok(issues.into_iter().next())
    }

    fn create_issue_comment(&mut self, issue_id: &str, body: &str) -> error::Result<()> {
        let adapter = self.tracker_adapter();
        self.block_on(adapter.create_comment(issue_id, body))
    }

    fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> error::Result<()> {
        let adapter = self.tracker_adapter();
        self.block_on(adapter.update_issue_state(issue_id, state_name))
    }
}

#[cfg(not(test))]
struct GithubAdapterInputs {
    token: String,
    repo_owner: String,
    repo_name: String,
    label_prefix: String,
    endpoint: String,
}

#[cfg(not(test))]
fn github_adapter_inputs(
    tracker: &symphony::domain::TrackerConfig,
) -> error::Result<GithubAdapterInputs> {
    let resolved = resolve_github_token(tracker).ok_or_else(|| {
        error::SymphonyError::InvalidWorkflowConfig(github_token_missing_message().to_string())
    })?;
    let token_source = resolved.source;
    let token = resolved.token;

    let repo_owner = tracker
        .repo_owner
        .clone()
        .map(|owner| owner.trim().to_string())
        .filter(|owner| !owner.is_empty())
        .ok_or_else(|| {
            error::SymphonyError::InvalidWorkflowConfig(
                "tracker.repo_owner is required when tracker.kind is github".to_string(),
            )
        })?;

    let repo_name = tracker
        .repo_name
        .clone()
        .map(|repo| repo.trim().to_string())
        .filter(|repo| !repo.is_empty())
        .ok_or_else(|| {
            error::SymphonyError::InvalidWorkflowConfig(
                "tracker.repo_name is required when tracker.kind is github".to_string(),
            )
        })?;

    let label_prefix = tracker
        .label_prefix
        .clone()
        .map(|prefix| prefix.trim().to_string())
        .filter(|prefix| !prefix.is_empty())
        .unwrap_or_else(|| "symphony".to_string());

    let endpoint = tracker.endpoint.trim();
    let endpoint = if endpoint.is_empty() {
        "https://api.github.com".to_string()
    } else {
        endpoint.to_string()
    };

    tracing::debug!(
        token_source = github_token_source_name(token_source),
        "resolved GitHub tracker token source"
    );

    Ok(GithubAdapterInputs {
        token,
        repo_owner,
        repo_name,
        label_prefix,
        endpoint,
    })
}

#[cfg(not(test))]
struct GithubOrchestratorPort {
    workflow_store: Arc<WorkflowStore>,
    cached_adapter: Option<GithubAdapter>,
    adapter_cache_key: Option<String>,
}

#[cfg(not(test))]
impl GithubOrchestratorPort {
    fn new(workflow_store: Arc<WorkflowStore>) -> Self {
        Self {
            workflow_store,
            cached_adapter: None,
            adapter_cache_key: None,
        }
    }

    fn block_on<T>(future: impl Future<Output = error::Result<T>>) -> error::Result<T> {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
    }

    fn build_adapter_cache_key(
        tracker: &symphony::domain::TrackerConfig,
        token: &str,
        repo_owner: &str,
        repo_name: &str,
        label_prefix: &str,
        endpoint: &str,
    ) -> String {
        format!(
            "{token}\u{1e}{repo_owner}\u{1e}{repo_name}\u{1e}{label_prefix}\u{1e}{endpoint}\u{1e}{project_number}\u{1e}{assignee}\u{1e}{active_states}\u{1e}{terminal_states}\u{1e}{exclude_labels}",
            project_number = tracker
                .github_project_number
                .map(|value| value.to_string())
                .unwrap_or_default(),
            assignee = tracker.assignee.as_deref().unwrap_or_default(),
            active_states = tracker.active_states.join("\u{1f}"),
            terminal_states = tracker.terminal_states.join("\u{1f}"),
            exclude_labels = tracker.exclude_labels.join("\u{1f}"),
        )
    }

    fn tracker_adapter(&mut self) -> error::Result<&GithubAdapter> {
        let (_, effective_config) = self.workflow_store.effective_config();
        let tracker = effective_config.tracker;

        let inputs = github_adapter_inputs(&tracker)?;

        let cache_key = Self::build_adapter_cache_key(
            &tracker,
            &inputs.token,
            &inputs.repo_owner,
            &inputs.repo_name,
            &inputs.label_prefix,
            inputs.endpoint.as_str(),
        );

        let should_refresh = self.adapter_cache_key.as_deref() != Some(cache_key.as_str());
        if should_refresh {
            let client = GithubClient::with_base_url(
                inputs.token,
                inputs.repo_owner,
                inputs.repo_name,
                inputs.label_prefix,
                inputs.endpoint.as_str(),
            );
            self.cached_adapter = Some(GithubAdapter::new(client, tracker));
            self.adapter_cache_key = Some(cache_key);
        }

        self.cached_adapter.as_ref().ok_or_else(|| {
            error::SymphonyError::InvalidWorkflowConfig(
                "failed to initialize github tracker adapter".to_string(),
            )
        })
    }
}

#[cfg(not(test))]
impl OrchestratorPort for GithubOrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> error::Result<Vec<Issue>> {
        let adapter = self.tracker_adapter()?;
        Self::block_on(adapter.fetch_issues_by_states(terminal_states))
    }

    fn reconcile_running_issues(
        &mut self,
        running_issue_ids: &[String],
    ) -> error::Result<Vec<Issue>> {
        if running_issue_ids.is_empty() {
            return Ok(vec![]);
        }

        let adapter = self.tracker_adapter()?;
        Self::block_on(adapter.fetch_issue_states_by_ids(running_issue_ids))
    }

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> error::Result<()> {
        config::validate(config).map(|_| ())
    }

    fn fetch_candidate_issues(&mut self) -> error::Result<Vec<Issue>> {
        let adapter = self.tracker_adapter()?;
        Self::block_on(adapter.fetch_candidate_issues())
    }

    fn refresh_issue(&mut self, issue_id: &str) -> error::Result<Option<Issue>> {
        let adapter = self.tracker_adapter()?;
        let issue_ids = vec![issue_id.to_string()];
        let issues = Self::block_on(adapter.fetch_issue_states_by_ids(&issue_ids))?;
        Ok(issues.into_iter().next())
    }

    fn create_issue_comment(&mut self, issue_id: &str, body: &str) -> error::Result<()> {
        let adapter = self.tracker_adapter()?;
        Self::block_on(adapter.create_comment(issue_id, body))
    }

    fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> error::Result<()> {
        let adapter = self.tracker_adapter()?;
        Self::block_on(adapter.update_issue_state(issue_id, state_name))
    }
}

#[cfg(not(test))]
#[derive(Default)]
pub struct RuntimeBootstrapDeps {
    startup_context: Option<StartupContext>,
}

#[cfg(not(test))]
impl RuntimeBootstrapDeps {
    fn load_startup_context(workflow_path: &Path) -> Result<StartupContext, String> {
        let workflow_store = WorkflowStore::new(workflow_path)
            .map_err(|err| format!("failed to load workflow store: {err}"))?;

        let (_, effective_config) = workflow_store.effective_config();

        Ok(StartupContext {
            workflow_path: workflow_path.to_path_buf(),
            workflow_store,
            effective_config,
        })
    }

    fn take_or_load_validated_context(
        &mut self,
        workflow_path: &Path,
    ) -> Result<StartupContext, String> {
        if let Some(context) = self.startup_context.take() {
            if context.workflow_path == workflow_path {
                return Ok(context);
            }
        }

        let context = Self::load_startup_context(workflow_path)?;
        config::validate(&context.effective_config)
            .map_err(|err| format!("invalid startup config: {err}"))?;
        Ok(context)
    }
}

#[cfg(not(test))]
impl BootstrapDeps for RuntimeBootstrapDeps {
    fn workflow_exists(&mut self, workflow_path: &Path) -> bool {
        workflow_path.is_file()
    }

    fn startup_validate(&mut self, workflow_path: &Path) -> Result<(), String> {
        tracing::info!(
            phase = "startup",
            stage = "validate",
            workflow_path = %workflow_path.display(),
            "validating startup workflow and config"
        );

        let context = Self::load_startup_context(workflow_path)?;
        config::validate(&context.effective_config)
            .map_err(|err| format!("invalid startup config: {err}"))?;

        self.startup_context = Some(context);

        tracing::info!(
            phase = "startup",
            stage = "validate",
            workflow_path = %workflow_path.display(),
            "startup workflow and config validation succeeded"
        );

        Ok(())
    }

    fn start_orchestrator(&mut self, workflow_path: &Path, cli: &Cli) -> Result<(), String> {
        let context = self.take_or_load_validated_context(workflow_path)?;
        let prepared_http_server =
            prepare_http_server_binding(effective_http_binding(&context.effective_config, cli))?;
        if cli.tui {
            tui::validate_terminal_for_tui()
                .map_err(|err| format!("tui preflight failed: {err}"))?;
        }
        if !cli.tui {
            print_startup_banner(
                cli,
                &context.effective_config,
                prepared_http_server
                    .as_ref()
                    .map(|server| &server.banner_binding),
            );
        }

        let tracker_kind = context
            .effective_config
            .tracker
            .kind
            .clone()
            .unwrap_or_else(|| "linear".to_string());

        let workflow_store = Arc::new(context.workflow_store);
        let mut tracker_port: Box<dyn OrchestratorPort> = if tracker_kind == "github" {
            Box::new(GithubOrchestratorPort::new(Arc::clone(&workflow_store)))
        } else {
            Box::new(LinearOrchestratorPort::new(Arc::clone(&workflow_store)))
        };

        tracing::info!(tracker_kind = %tracker_kind, "orchestrator port selected");

        let server_port_override = prepared_http_server
            .as_ref()
            .map(|server| server.bound_port)
            .or(cli.port);
        let mut orchestrator = Orchestrator::new_with_workflow_store_and_port_override(
            Arc::clone(&workflow_store),
            server_port_override,
        );

        let snapshot_handle = orchestrator.create_snapshot_handle();
        let tui_snapshot_handle = snapshot_handle.clone();
        let refresh_sender = orchestrator.create_refresh_channel();
        let event_hub = orchestrator.create_event_hub();
        let tui_event_hub = event_hub.clone();
        let steer_sender = orchestrator.create_steer_sender();
        let http_state = HttpServerState::with_event_stream(
            Arc::new(snapshot_handle),
            Arc::new(refresh_sender),
            orchestrator.escalation_registry(),
            event_hub,
            symphony::http_server::EventStreamConfig::default(),
        )
        .with_shared_context_store(orchestrator.shared_context_store())
        .with_steer_sender(steer_sender);

        let mut tui_shutdown = None;
        let mut tui_exit = None;
        let mut tui_task = None;
        if cli.tui {
            let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
            let (exit_tx, exit_rx) = tokio::sync::watch::channel(None::<tui::TuiExitReason>);
            tui_shutdown = Some(shutdown_tx);
            tui_exit = Some(exit_rx);
            tui_task = Some(tokio::spawn(async move {
                let reason = tui::run_tui(tui_snapshot_handle, tui_event_hub, shutdown_rx).await;
                let _ = exit_tx.send(Some(reason));
            }));
        }

        tracing::info!(
            phase = "startup",
            stage = "runtime_init",
            workflow_path = %workflow_path.display(),
            http_enabled = prepared_http_server.is_some(),
            http_host = prepared_http_server.as_ref().map(|server| server.host.as_str()).unwrap_or("n/a"),
            http_port = prepared_http_server.as_ref().map(|server| server.bound_port),
            logs_root_configured = cli.logs_root.is_some(),
            tui_enabled = cli.tui,

            "constructed orchestrator runtime"
        );

        if let Some(server) = &prepared_http_server {
            tracing::info!(
                event = "http_server_enabled",
                host = %server.host,
                configured_port = server.configured_port,
                port = server.bound_port,
                "HTTP server binding enabled at startup"
            );
        } else {
            tracing::info!(
                event = "http_server_disabled",
                reason = "no_port_configured",
                "HTTP server disabled; running orchestrator-only mode"
            );
        }

        let runtime_result = run_runtime_until_shutdown(
            &mut orchestrator,
            &mut *tracker_port,
            workflow_path,
            prepared_http_server,
            http_state,
            tui_exit,
        );

        if let Some(shutdown_tx) = tui_shutdown {
            let _ = shutdown_tx.send(true);
        }

        if let Some(task) = tui_task {
            let handle = tokio::runtime::Handle::try_current()
                .map_err(|err| format!("missing tokio runtime for tui shutdown: {err}"))?;
            tokio::task::block_in_place(|| {
                handle.block_on(async {
                    match tokio::time::timeout(Duration::from_secs(2), task).await {
                        Ok(Ok(())) => {}
                        Ok(Err(err)) => {
                            tracing::warn!(error = %err, "tui task ended with join error");
                        }
                        Err(_) => {
                            tracing::warn!("timed out waiting for tui task shutdown");
                        }
                    }
                });
            });
        }

        runtime_result
    }
}

pub fn parse_cli_from<I, T>(args: I) -> Result<Cli, clap::Error>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    let mut cli = Cli::try_parse_from(args)?;
    // TUI is enabled by default; --no-tui is the explicit opt-out.
    cli.tui = !cli.no_tui;
    Ok(cli)
}

pub fn resolve_workflow_path(cli: &Cli) -> PathBuf {
    match &cli.command {
        Some(CliCommand::Doctor { workflow_path }) => PathBuf::from(workflow_path),
        Some(CliCommand::Helper { workflow, .. }) => PathBuf::from(workflow),
        None => PathBuf::from(&cli.workflow_path),
    }
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) fn effective_http_binding(config: &ServiceConfig, cli: &Cli) -> Option<HttpBinding> {
    let port = cli.port.or(config.server.port).unwrap_or(8080);
    Some(HttpBinding {
        host: config.server.host.clone(),
        port,
    })
}

fn startup_banner_binding(configured_binding: &HttpBinding, bound_port: u16) -> HttpBinding {
    HttpBinding {
        host: configured_binding.host.clone(),
        port: if configured_binding.port == 0 {
            0
        } else {
            bound_port
        },
    }
}

#[cfg(not(test))]
fn prepare_http_server_binding(
    configured_binding: Option<HttpBinding>,
) -> Result<Option<PreparedHttpServer>, String> {
    let Some(configured_binding) = configured_binding else {
        return Ok(None);
    };

    let host = configured_binding.host.clone();
    let configured_port = configured_binding.port;
    let runtime = tokio::runtime::Handle::try_current()
        .map_err(|err| format!("missing tokio runtime for HTTP server bind: {err}"))?;
    let (listener, bound_port) = tokio::task::block_in_place(|| {
        runtime.block_on(bind_http_listener_with_fallback(
            &host,
            configured_port,
            HTTP_PORT_RETRY_LIMIT,
        ))
    })
    .map_err(|err| err.to_string())?;

    Ok(Some(PreparedHttpServer {
        host,
        configured_port,
        bound_port,
        banner_binding: startup_banner_binding(&configured_binding, bound_port),
        listener,
    }))
}

#[cfg_attr(test, allow(dead_code))]
fn format_polling_interval(interval_ms: u64) -> String {
    if interval_ms.is_multiple_of(1_000) {
        format!("every {}s", interval_ms / 1_000)
    } else {
        format!("every {interval_ms}ms")
    }
}

#[cfg_attr(test, allow(dead_code))]
fn display_path_with_home_alias(path: &Path) -> String {
    let home = match std::env::var("HOME") {
        Ok(home) => PathBuf::from(home),
        Err(_) => return path.display().to_string(),
    };

    match path.strip_prefix(&home) {
        Ok(stripped) if stripped.as_os_str().is_empty() => "~".to_string(),
        Ok(stripped) => format!("~/{}", stripped.display()),
        Err(_) => path.display().to_string(),
    }
}

#[cfg_attr(test, allow(dead_code))]
fn format_dashboard_url(host: &str, port: u16) -> String {
    let host = match host.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V6(_)) if !host.starts_with('[') => format!("[{host}]"),
        _ if host.contains(':') && !host.starts_with('[') && !host.ends_with(']') => {
            format!("[{host}]")
        }
        _ => host.to_string(),
    };

    if port == 0 {
        format!("http://{host}:<ephemeral>")
    } else {
        format!("http://{host}:{port}")
    }
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) fn build_startup_banner(
    cli: &Cli,
    config: &ServiceConfig,
    http_binding: Option<&HttpBinding>,
) -> String {
    let dashboard = http_binding
        .map(|binding| format_dashboard_url(&binding.host, binding.port))
        .unwrap_or_else(|| "disabled".to_string());

    let logs = cli
        .logs_root
        .as_deref()
        .map(|logs_root| Path::new(logs_root).join("log").join("symphony.log"))
        .map(|path| display_path_with_home_alias(&path))
        .unwrap_or_else(|| "stdout".to_string());

    let project_slug = config
        .tracker
        .project_slug
        .as_deref()
        .unwrap_or("unknown_project_slug");

    format!(
        "Symphony v{version}\nDashboard: {dashboard}\nLogs: {logs}\nProject: {project_slug}\nWorkers: {workers} max concurrent\nPolling: {polling}\n\nPress Ctrl+C to stop.\n",
        version = env!("CARGO_PKG_VERSION"),
        workers = config.agent.max_concurrent_agents,
        polling = format_polling_interval(config.polling.interval_ms),
    )
}

#[cfg(not(test))]
fn print_startup_banner(cli: &Cli, config: &ServiceConfig, http_binding: Option<&HttpBinding>) {
    print!("{}", build_startup_banner(cli, config, http_binding));
    if let Err(err) = std::io::stdout().flush() {
        eprintln!("failed to flush startup banner to stdout: {err}");
    }
}

pub fn execute_cli(cli: &Cli, deps: &mut dyn BootstrapDeps) -> Result<(), String> {
    let workflow_path = resolve_workflow_path(cli);

    tracing::info!(
        phase = "startup",
        stage = "bootstrap",
        workflow_path = %workflow_path.display(),
        "starting CLI bootstrap"
    );

    if !deps.workflow_exists(&workflow_path) {
        return Err(format!(
            "workflow file not found: {}",
            workflow_path.display()
        ));
    }

    deps.startup_validate(&workflow_path).map_err(|err| {
        format!(
            "startup validation failed for {}: {err}",
            workflow_path.display()
        )
    })?;

    deps.start_orchestrator(&workflow_path, cli).map_err(|err| {
        format!(
            "orchestrator startup failed for {}: {err}",
            workflow_path.display()
        )
    })
}

#[cfg(not(test))]
fn run_doctor(workflow_path: &Path) -> Result<i32, String> {
    let mut results = doctor::check_config(workflow_path);

    if !doctor::has_errors(&results) {
        match doctor::load_service_config(workflow_path) {
            Ok(service_config) => {
                let runtime = tokio::runtime::Handle::try_current()
                    .map_err(|err| format!("missing tokio runtime for doctor checks: {err}"))?;

                let tracker_kind = service_config.tracker.kind.as_deref().unwrap_or("linear");

                if tracker_kind == "github" {
                    let github_results = tokio::task::block_in_place(|| {
                        runtime.block_on(doctor::check_github(&service_config.tracker))
                    });
                    results.extend(github_results);

                    results.extend(doctor::check_backend(&service_config));
                    results.extend(doctor::check_workspace(&service_config.workspace));

                    match github_adapter_inputs(&service_config.tracker) {
                        Ok(inputs) => {
                            let client = GithubClient::with_base_url(
                                inputs.token,
                                inputs.repo_owner,
                                inputs.repo_name,
                                inputs.label_prefix,
                                inputs.endpoint.as_str(),
                            );
                            let adapter =
                                GithubAdapter::new(client, service_config.tracker.clone());
                            let orphan_results = tokio::task::block_in_place(|| {
                                runtime.block_on(doctor::check_orphans(&service_config, &adapter))
                            });
                            results.extend(orphan_results);
                        }
                        Err(err) => {
                            results.push(doctor::DoctorCheckResult {
                                name: "Orphans".to_string(),
                                status: doctor::CheckStatus::Error,
                                message: format!(
                                    "Failed to initialize GitHub adapter for orphan checks: {err}"
                                ),
                                details: None,
                            });
                        }
                    }
                } else {
                    let linear_results = tokio::task::block_in_place(|| {
                        runtime.block_on(doctor::check_linear(&service_config.tracker))
                    });
                    results.extend(linear_results);

                    results.extend(doctor::check_backend(&service_config));
                    results.extend(doctor::check_workspace(&service_config.workspace));

                    let adapter =
                        LinearAdapter::new(LinearClient::new(service_config.tracker.clone()));
                    let orphan_results = tokio::task::block_in_place(|| {
                        runtime.block_on(doctor::check_orphans(&service_config, &adapter))
                    });
                    results.extend(orphan_results);
                }
            }
            Err(err) => results.push(doctor::DoctorCheckResult {
                name: "Config Parse".to_string(),
                status: doctor::CheckStatus::Error,
                message: format!("Failed to load workflow for runtime checks: {err}"),
                details: None,
            }),
        }
    } else {
        results.push(doctor::DoctorCheckResult {
            name: "Runtime Checks".to_string(),
            status: doctor::CheckStatus::Skipped,
            message: "Skipped Linear/backend/workspace/orphan checks because config check reported errors".to_string(),
            details: None,
        });
    }

    println!("{}", doctor::format_results(&results));

    if doctor::has_errors(&results) {
        Ok(1)
    } else {
        Ok(0)
    }
}

#[cfg(not(test))]
fn helper_success(data: serde_json::Value) -> i32 {
    println!("{}", serde_json::json!({ "ok": true, "data": data }));
    0
}

#[cfg(not(test))]
fn helper_error(message: impl Into<String>) -> i32 {
    println!(
        "{}",
        serde_json::json!({
            "ok": false,
            "error": {
                "code": "HELPER_ERROR",
                "message": message.into(),
            },
        })
    );
    1
}

#[cfg(not(test))]
fn read_helper_input(input_path: Option<&str>) -> Result<serde_json::Value, String> {
    let Some(input_path) = input_path else {
        return Ok(serde_json::json!({}));
    };
    let raw = std::fs::read_to_string(input_path)
        .map_err(|err| format!("failed to read helper input {input_path}: {err}"))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("helper input must be valid JSON object: {err}"))
        .and_then(|value: serde_json::Value| {
            if value.is_object() {
                Ok(value)
            } else {
                Err("helper input must be a JSON object".to_string())
            }
        })
}

#[cfg(not(test))]
fn helper_required_str(input: &serde_json::Value, field: &str) -> Result<String, String> {
    input
        .get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("helper input field `{field}` must be a non-empty string"))
}

#[cfg(not(test))]
fn helper_optional_str(input: &serde_json::Value, field: &str) -> Option<String> {
    input
        .get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(not(test))]
fn helper_bool(input: &serde_json::Value, field: &str, default: bool) -> bool {
    input
        .get(field)
        .and_then(|value| value.as_bool())
        .unwrap_or(default)
}

#[cfg(not(test))]
fn github_adapter_from_tracker(tracker: &TrackerConfig) -> error::Result<GithubAdapter> {
    let inputs = github_adapter_inputs(tracker)?;
    let client = GithubClient::with_base_url(
        inputs.token,
        inputs.repo_owner,
        inputs.repo_name,
        inputs.label_prefix,
        inputs.endpoint.as_str(),
    );
    Ok(GithubAdapter::new(client, tracker.clone()))
}

#[cfg(not(test))]
fn parse_github_issue_number(issue_id: &str) -> Result<u64, String> {
    issue_id
        .trim()
        .trim_start_matches('#')
        .parse::<u64>()
        .map_err(|err| format!("invalid GitHub issue id `{issue_id}`: {err}"))
}

#[cfg(not(test))]
async fn github_issue_payload(
    adapter: &GithubAdapter,
    issue_id: &str,
    include_children: bool,
    include_comments: bool,
) -> Result<serde_json::Value, String> {
    let issue_ids = vec![issue_id.to_string()];
    let issue = adapter
        .fetch_issue_states_by_ids(&issue_ids)
        .await
        .map_err(|err| err.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("issue not found: {issue_id}"))?;

    let number = parse_github_issue_number(&issue.id)?;
    let children = if include_children {
        let child_numbers: Vec<String> = adapter
            .client
            .list_sub_issues(number)
            .await
            .map_err(|err| err.to_string())?
            .into_iter()
            .map(|issue| issue.number.to_string())
            .collect();
        if child_numbers.is_empty() {
            Vec::new()
        } else {
            adapter
                .fetch_issue_states_by_ids(&child_numbers)
                .await
                .map_err(|err| err.to_string())?
        }
    } else {
        Vec::new()
    };

    let comments = if include_comments {
        adapter
            .client
            .list_comments(number)
            .await
            .map_err(|err| err.to_string())?
    } else {
        Vec::new()
    };

    Ok(serde_json::json!({
        "issue": issue,
        "children": children,
        "comments": comments,
    }))
}

#[cfg(not(test))]
async fn github_upsert_comment(
    adapter: &GithubAdapter,
    issue_id: &str,
    marker: Option<&str>,
    body: &str,
) -> Result<GithubIssueComment, String> {
    let number = parse_github_issue_number(issue_id)?;
    let marker = marker.map(str::trim).filter(|value| !value.is_empty());
    let body = match marker {
        Some(marker) if !body.contains(marker) => format!("{marker}\n\n{body}"),
        _ => body.to_string(),
    };

    let existing = match marker {
        Some(marker) => adapter
            .client
            .list_comments(number)
            .await
            .map_err(|err| err.to_string())?
            .into_iter()
            .find(|comment| {
                comment
                    .body
                    .as_deref()
                    .is_some_and(|body| body.contains(marker))
            }),
        None => None,
    };

    match existing {
        Some(comment) => adapter
            .client
            .update_comment(comment.id, &body)
            .await
            .map_err(|err| err.to_string()),
        None => adapter
            .client
            .create_comment_record(number, &body)
            .await
            .map_err(|err| err.to_string()),
    }
}

#[cfg(not(test))]
async fn run_github_helper(
    tracker: &TrackerConfig,
    operation: &str,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let adapter = github_adapter_from_tracker(tracker).map_err(|err| err.to_string())?;

    match operation {
        "issue.get" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            github_issue_payload(
                &adapter,
                &issue_id,
                helper_bool(&input, "includeChildren", true),
                helper_bool(&input, "includeComments", true),
            )
            .await
        }
        "issue.list-children" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let number = parse_github_issue_number(&issue_id)?;
            let child_ids: Vec<String> = adapter
                .client
                .list_sub_issues(number)
                .await
                .map_err(|err| err.to_string())?
                .into_iter()
                .map(|issue| issue.number.to_string())
                .collect();
            let children = if child_ids.is_empty() {
                Vec::new()
            } else {
                adapter
                    .fetch_issue_states_by_ids(&child_ids)
                    .await
                    .map_err(|err| err.to_string())?
            };
            Ok(serde_json::json!({ "children": children }))
        }
        "comment.upsert" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let body = helper_required_str(&input, "body")?;
            let marker = helper_optional_str(&input, "marker");
            let comment =
                github_upsert_comment(&adapter, &issue_id, marker.as_deref(), &body).await?;
            Ok(serde_json::json!({ "comment": comment }))
        }
        "issue.update-state" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let state = helper_required_str(&input, "state")?;
            adapter
                .update_issue_state(&issue_id, &state)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "state": state }))
        }
        "issue.create-followup" => {
            let title = helper_required_str(&input, "title")?;
            let description = helper_required_str(&input, "description")?;
            let parent_issue_id = helper_optional_str(&input, "parentIssueId");
            let issue = adapter
                .client
                .create_issue(&title, &description)
                .await
                .map_err(|err| err.to_string())?;
            if let Some(parent_issue_id) = parent_issue_id {
                let body = format!(
                    "Follow-up issue created: {}",
                    issue
                        .html_url
                        .clone()
                        .unwrap_or_else(|| format!("#{}", issue.number))
                );
                let _ = github_upsert_comment(
                    &adapter,
                    &parent_issue_id,
                    Some(&format!("<!-- symphony:followup:{} -->", issue.number)),
                    &body,
                )
                .await?;
            }
            Ok(serde_json::json!({ "issue": issue }))
        }
        "document.read" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let title = helper_required_str(&input, "title")?;
            let marker = format!("<!-- symphony:document:{} -->", title);
            let number = parse_github_issue_number(&issue_id)?;
            let content = adapter
                .client
                .list_comments(number)
                .await
                .map_err(|err| err.to_string())?
                .into_iter()
                .find_map(|comment| {
                    let body = comment.body?;
                    body.strip_prefix(&marker)
                        .map(|content| content.trim_start().to_string())
                });
            Ok(serde_json::json!({ "title": title, "content": content }))
        }
        "document.write" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let title = helper_required_str(&input, "title")?;
            let content = helper_required_str(&input, "content")?;
            let marker = format!("<!-- symphony:document:{} -->", title);
            let body = format!("{marker}\n\n{content}");
            let comment = github_upsert_comment(&adapter, &issue_id, Some(&marker), &body).await?;
            Ok(serde_json::json!({ "title": title, "comment": comment }))
        }
        other => Err(format!("unsupported Symphony helper operation: {other}")),
    }
}

#[cfg(not(test))]
async fn run_linear_helper(
    tracker: &TrackerConfig,
    operation: &str,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let adapter = LinearAdapter::new(LinearClient::new(tracker.clone()));
    match operation {
        "issue.get" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let issues = adapter
                .fetch_issue_states_by_ids(&[issue_id.clone()])
                .await
                .map_err(|err| err.to_string())?;
            let issue = issues
                .into_iter()
                .next()
                .ok_or_else(|| format!("issue not found: {issue_id}"))?;
            Ok(serde_json::json!({ "issue": issue, "children": [], "comments": [] }))
        }
        "comment.upsert" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let body = helper_required_str(&input, "body")?;
            adapter
                .create_comment(&issue_id, &body)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "upserted": false, "created": true }))
        }
        "issue.update-state" => {
            let issue_id = helper_required_str(&input, "issueId")?;
            let state = helper_required_str(&input, "state")?;
            adapter
                .update_issue_state(&issue_id, &state)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "state": state }))
        }
        "issue.list-children" => Ok(serde_json::json!({ "children": [] })),
        other => Err(format!(
            "operation `{other}` is not supported for Linear-backed Symphony helpers yet"
        )),
    }
}

#[cfg(not(test))]
fn run_helper(workflow_path: &Path, operation: &str, input_path: Option<&str>) -> i32 {
    let input = match read_helper_input(input_path) {
        Ok(input) => input,
        Err(err) => return helper_error(err),
    };

    let context = match RuntimeBootstrapDeps::load_startup_context(workflow_path) {
        Ok(context) => context,
        Err(err) => return helper_error(err),
    };
    if let Err(err) = config::validate(&context.effective_config) {
        return helper_error(format!("invalid workflow config: {err}"));
    }

    let tracker = context.effective_config.tracker;
    let tracker_kind = tracker.kind.as_deref().unwrap_or("linear");
    let runtime = match tokio::runtime::Handle::try_current() {
        Ok(handle) => handle,
        Err(err) => return helper_error(format!("missing tokio runtime for helper: {err}")),
    };

    let result = tokio::task::block_in_place(|| {
        runtime.block_on(async {
            if tracker_kind == "github" {
                run_github_helper(&tracker, operation, input).await
            } else {
                run_linear_helper(&tracker, operation, input).await
            }
        })
    });

    match result {
        Ok(data) => helper_success(data),
        Err(err) => helper_error(err),
    }
}

#[cfg(not(test))]
async fn wait_for_shutdown_signal() -> Result<&'static str, String> {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut terminate = signal(SignalKind::terminate())
            .map_err(|err| format!("failed to listen for sigterm: {err}"))?;

        tokio::select! {
            ctrl_c_result = tokio::signal::ctrl_c() => {
                ctrl_c_result
                    .map(|()| "ctrl_c")
                    .map_err(|err| format!("failed to listen for ctrl_c: {err}"))
            }
            terminate_result = terminate.recv() => {
                terminate_result
                    .map(|_| "sigterm")
                    .ok_or_else(|| "sigterm signal stream ended unexpectedly".to_string())
            }
        }
    }

    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .map(|()| "ctrl_c")
            .map_err(|err| format!("failed to listen for ctrl_c: {err}"))
    }
}

#[cfg(not(test))]
fn run_runtime_until_shutdown(
    orchestrator: &mut Orchestrator,
    port: &mut dyn OrchestratorPort,
    workflow_path: &Path,
    prepared_http_server: Option<PreparedHttpServer>,
    http_state: HttpServerState,
    mut tui_exit: Option<tokio::sync::watch::Receiver<Option<tui::TuiExitReason>>>,
) -> Result<(), String> {
    let handle = tokio::runtime::Handle::try_current()
        .map_err(|err| format!("missing tokio runtime for orchestrator startup: {err}"))?;

    tokio::task::block_in_place(|| {
        handle.block_on(async {
            tracing::info!(
                phase = "runtime",
                stage = "start",
                workflow_path = %workflow_path.display(),
                http_enabled = prepared_http_server.is_some(),
                "starting orchestrator runtime"
            );

            let http_future = async {
                if let Some(server) = prepared_http_server {
                    start_http_server(
                        http_state,
                        server.listener,
                        &server.host,
                        server.configured_port,
                        server.bound_port,
                    )
                        .await
                        .map_err(|err| format!("http server failed: {err}"))
                } else {
                    pending::<Result<(), String>>().await
                }
            };
            let tui_exit_future = async {
                match tui_exit.as_mut() {
                    Some(exit_rx) => loop {
                        if let Some(reason) = *exit_rx.borrow() {
                            break Some(reason);
                        }
                        if exit_rx.changed().await.is_err() {
                            break Some(tui::TuiExitReason::ShutdownSignal);
                        }
                    },
                    None => pending::<Option<tui::TuiExitReason>>().await,
                }
            };

            let runtime_result = tokio::select! {
                run_result = orchestrator.run(port) => {
                    run_result.map_err(|err| format!("orchestrator runtime failed: {err}"))?;
                    tracing::info!(
                        phase = "runtime",
                        stage = "stopped",
                        reason = "run_returned",
                        workflow_path = %workflow_path.display(),
                        "orchestrator loop stopped"
                    );
                    Ok(())
                }
                http_result = http_future => {
                    http_result?;
                    tracing::info!(
                        phase = "runtime",
                        stage = "stopped",
                        reason = "http_server_returned",
                        workflow_path = %workflow_path.display(),
                        "HTTP server stopped"
                    );
                    Ok(())
                }
                signal_reason = wait_for_shutdown_signal() => {
                    let reason = signal_reason?;
                    tracing::info!(
                        phase = "runtime",
                        stage = "stopped",
                        reason = reason,
                        workflow_path = %workflow_path.display(),
                        "received shutdown signal"
                    );
                    Ok(())
                }
                tui_reason = tui_exit_future => {
                    match tui_reason {
                        Some(tui_reason) => match tui_reason {
                            tui::TuiExitReason::CtrlC | tui::TuiExitReason::ShutdownSignal => {
                                tracing::info!(
                                    phase = "runtime",
                                    stage = "stopped",
                                    reason = "tui_exit",
                                    workflow_path = %workflow_path.display(),
                                    tui_reason = ?tui_reason,
                                    "tui requested runtime shutdown"
                                );
                                Ok(())
                            }
                            tui::TuiExitReason::SetupFailed => Err("tui failed to initialize terminal".to_string()),
                            tui::TuiExitReason::InputError => Err("tui failed while reading terminal input".to_string()),
                            tui::TuiExitReason::DrawError => Err("tui failed while drawing dashboard".to_string()),
                        },
                        None => Ok(()),
                    }
                }
            };

            orchestrator.shutdown_supervisor().await;
            runtime_result
        })
    })
}

#[cfg(not(test))]
static FILE_LOG_GUARD: Mutex<Option<WorkerGuard>> = Mutex::new(None);

#[cfg(not(test))]
fn flush_file_logs() {
    if let Ok(mut guard_slot) = FILE_LOG_GUARD.lock() {
        let _ = guard_slot.take();
    }
}

#[cfg(not(test))]
fn init_tracing(logs_root: Option<&Path>, tui_enabled: bool) {
    static INIT: Once = Once::new();

    INIT.call_once(|| {
        let filter = EnvFilter::try_new(resolve_log_filter_directive())
            .unwrap_or_else(|_| EnvFilter::new("info"));
        let subscriber_builder = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(false)
            .json();

        let init_result = match logs_root {
            Some(logs_root_path) => match logging::build_non_blocking_file_writer(logs_root_path) {
                Ok((file_writer, guard)) => match FILE_LOG_GUARD.lock() {
                    Ok(mut guard_slot) => {
                        *guard_slot = Some(guard);
                        subscriber_builder.with_writer(file_writer).try_init()
                    }
                    Err(err) => {
                        eprintln!(
                            "failed to store file log guard (mutex poisoned): {err}; file logging disabled"
                        );
                        if tui_enabled {
                            subscriber_builder.with_writer(std::io::sink).try_init()
                        } else {
                            subscriber_builder.try_init()
                        }
                    }
                },
                Err(err) => {
                    eprintln!(
                        "failed to initialize rotating file logging at {}: {err}",
                        logs_root_path.display()
                    );
                    if tui_enabled {
                        subscriber_builder.with_writer(std::io::sink).try_init()
                    } else {
                        subscriber_builder.try_init()
                    }
                }
            },
            None if tui_enabled => subscriber_builder.with_writer(std::io::sink).try_init(),
            None => subscriber_builder.try_init(),
        };

        if let Err(err) = init_result {
            eprintln!("failed to initialize tracing subscriber: {err}");
        }
    });
}

#[cfg(not(test))]
fn run_entrypoint(args: impl IntoIterator<Item = OsString>) -> i32 {
    let mut cli = match parse_cli_from(args) {
        Ok(cli) => cli,
        Err(err) => {
            eprintln!("{err}");
            return 2;
        }
    };
    apply_env_defaults(&mut cli);

    init_tracing(cli.logs_root.as_deref().map(Path::new), cli.tui);

    if let Some(CliCommand::Doctor { workflow_path }) = &cli.command {
        match run_doctor(Path::new(workflow_path)) {
            Ok(code) => return code,
            Err(err) => {
                eprintln!("{err}");
                return 1;
            }
        }
    }

    if let Some(CliCommand::Helper {
        operation,
        workflow,
        input,
    }) = &cli.command
    {
        return run_helper(Path::new(workflow), operation, input.as_deref());
    }

    let mut deps = RuntimeBootstrapDeps::default();

    match execute_cli(&cli, &mut deps) {
        Ok(()) => 0,
        Err(err) => {
            tracing::error!(
                phase = "startup",
                workflow_path = %cli.workflow_path,
                error = %err,
                "startup failed"
            );
            eprintln!("{err}");
            1
        }
    }
}

#[cfg(not(test))]
fn resolve_git_common_root(start_dir: &Path) -> Option<PathBuf> {
    let output = Command::new("git")
        .args(["rev-parse", "--git-common-dir"])
        .current_dir(start_dir)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8(output.stdout).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let common_dir = PathBuf::from(trimmed);
    let absolute_common_dir = if common_dir.is_absolute() {
        common_dir
    } else {
        start_dir.join(common_dir)
    };

    absolute_common_dir.parent().map(Path::to_path_buf)
}

#[cfg(not(test))]
fn load_canonical_project_env() {
    let cwd = match std::env::current_dir() {
        Ok(cwd) => cwd,
        Err(_) => {
            let _ = dotenvy::dotenv();
            return;
        }
    };

    if let Some(common_root) = resolve_git_common_root(&cwd) {
        let env_path = common_root.join(".env");
        if env_path.is_file() {
            let _ = dotenvy::from_path(&env_path);
        }
        // Inside a git repo we only load the canonical <repo-root>/.env.
        return;
    }

    // Backward-compatible fallback outside git repos.
    let _ = dotenvy::dotenv();
}

#[cfg(not(test))]
fn apply_github_token_aliases() {
    let gh_token = match std::env::var("GH_TOKEN") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };

    if std::env::var("GITHUB_TOKEN")
        .map(|v| v.trim().is_empty())
        .unwrap_or(true)
    {
        std::env::set_var("GITHUB_TOKEN", &gh_token);
    }

    if std::env::var("KATA_GITHUB_TOKEN")
        .map(|v| v.trim().is_empty())
        .unwrap_or(true)
    {
        std::env::set_var("KATA_GITHUB_TOKEN", &gh_token);
    }
}

#[cfg(not(test))]
#[tokio::main]
async fn main() {
    load_canonical_project_env();
    apply_github_token_aliases();

    let code = run_entrypoint(std::env::args_os());
    flush_file_logs();
    if code != 0 {
        std::process::exit(code);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cli_accepts_tui_flag() {
        let cli = parse_cli_from(["symphony", "WORKFLOW.md", "--tui"]).expect("cli parse");
        assert!(cli.tui);
    }

    #[test]
    fn parse_cli_defaults_tui_to_true() {
        let cli = parse_cli_from(["symphony", "WORKFLOW.md"]).expect("cli parse");
        assert!(cli.tui);
    }

    #[test]
    fn parse_cli_accepts_no_tui_flag() {
        let cli = parse_cli_from(["symphony", "WORKFLOW.md", "--no-tui"]).expect("cli parse");
        assert!(!cli.tui);
    }

    #[test]
    fn parse_cli_no_tui_wins_when_both_flags_are_present() {
        let cli =
            parse_cli_from(["symphony", "WORKFLOW.md", "--tui", "--no-tui"]).expect("cli parse");
        assert!(!cli.tui);
    }

    #[test]
    fn startup_banner_binding_uses_bound_port_when_configured_port_changes() {
        let configured = HttpBinding {
            host: "127.0.0.1".to_string(),
            port: 8080,
        };

        let banner_binding = startup_banner_binding(&configured, 8081);
        assert_eq!(banner_binding.host, "127.0.0.1");
        assert_eq!(banner_binding.port, 8081);
    }

    #[test]
    fn startup_banner_binding_keeps_ephemeral_marker_for_zero_port() {
        let configured = HttpBinding {
            host: "127.0.0.1".to_string(),
            port: 0,
        };

        let banner_binding = startup_banner_binding(&configured, 43123);
        assert_eq!(banner_binding.port, 0);
    }

    #[test]
    fn normalize_github_issue_id_accepts_hash_prefixed_numbers() {
        assert_eq!(normalize_github_issue_id("#456"), "456");
        assert_eq!(normalize_github_issue_id("  #456  "), "456");
        assert_eq!(normalize_github_issue_id("456"), "456");
        assert_eq!(normalize_github_issue_id("#not-a-number"), "#not-a-number");
    }

    #[test]
    fn parse_symphony_document_comment_reads_marker_title_and_content() {
        let parsed = parse_symphony_document_comment(
            "<!-- symphony:document:Context -->\n\nThis is the context body.",
        );

        assert_eq!(
            parsed,
            Some((
                "Context".to_string(),
                "This is the context body.".to_string()
            ))
        );
    }

    #[test]
    fn parse_symphony_document_comment_ignores_non_document_comments() {
        assert_eq!(
            parse_symphony_document_comment("## Agent Workpad\n\nNope"),
            None
        );
    }
}
