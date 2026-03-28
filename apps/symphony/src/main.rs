use std::ffi::OsString;
use std::path::{Path, PathBuf};

use clap::Parser;
use symphony::domain::ServiceConfig;

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
use std::sync::{Arc, Mutex, Once};
#[cfg(not(test))]
use std::time::Duration;
#[cfg(not(test))]
use symphony::domain::Issue;
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

#[derive(Parser, Debug, Clone)]
#[command(
    name = "symphony",
    about = "Symphony orchestrator — polls Linear, dispatches Codex agent sessions"
)]
pub struct Cli {
    /// Path to WORKFLOW.md
    #[arg(default_value = "WORKFLOW.md")]
    pub workflow_path: String,

    /// HTTP server port (default: 8080)
    #[arg(long, default_value = "8080")]
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

    fn update_issue_state(&mut self, issue_id: &str, state_name: &str) -> error::Result<()> {
        let adapter = self.tracker_adapter();
        self.block_on(adapter.update_issue_state(issue_id, state_name))
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

        let workflow_store = Arc::new(context.workflow_store);
        let mut tracker_port = LinearOrchestratorPort::new(Arc::clone(&workflow_store));
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
        let http_state = HttpServerState::with_event_stream(
            Arc::new(snapshot_handle),
            Arc::new(refresh_sender),
            orchestrator.escalation_registry(),
            event_hub,
            symphony::http_server::EventStreamConfig::default(),
        )
        .with_shared_context_store(orchestrator.shared_context_store());

        let mut tui_shutdown = None;
        let mut tui_exit = None;
        let mut tui_task = None;
        if cli.tui {
            let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
            let (exit_tx, exit_rx) = tokio::sync::watch::channel(None::<tui::TuiExitReason>);
            tui_shutdown = Some(shutdown_tx);
            tui_exit = Some(exit_rx);
            tui_task = Some(tokio::spawn(async move {
                let reason = tui::run_tui(tui_snapshot_handle, shutdown_rx).await;
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
            &mut tracker_port,
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
    PathBuf::from(&cli.workflow_path)
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) fn effective_http_binding(config: &ServiceConfig, cli: &Cli) -> Option<HttpBinding> {
    let port = cli.port.or(config.server.port)?;
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
        let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
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
    let cli = match parse_cli_from(args) {
        Ok(cli) => cli,
        Err(err) => {
            eprintln!("{err}");
            return 2;
        }
    };

    init_tracing(cli.logs_root.as_deref().map(Path::new), cli.tui);

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
#[tokio::main]
async fn main() {
    // Load .env file if present (silently ignore if missing)
    let _ = dotenvy::dotenv();

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
}
