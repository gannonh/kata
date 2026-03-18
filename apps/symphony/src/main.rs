use std::ffi::OsString;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Once;

use clap::Parser;
use symphony::domain::{Issue, ServiceConfig};
use symphony::linear::adapter::{LinearAdapter, TrackerAdapter};
use symphony::linear::client::LinearClient;
use symphony::orchestrator::{Orchestrator, OrchestratorPort};
use symphony::workflow_store::WorkflowStore;
use symphony::{config, error};
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

    /// HTTP server port
    #[arg(long)]
    pub port: Option<u16>,

    /// Log file root directory
    #[arg(long)]
    pub logs_root: Option<String>,

    /// Acknowledge that this runs without guardrails
    #[arg(long = "i-understand-that-this-will-be-running-without-the-usual-guardrails")]
    pub acknowledge_guardrails: bool,
}

pub trait BootstrapDeps {
    fn workflow_exists(&mut self, workflow_path: &Path) -> bool;
    fn startup_validate(&mut self, workflow_path: &Path) -> Result<(), String>;
    fn start_orchestrator(&mut self, workflow_path: &Path, cli: &Cli) -> Result<(), String>;
}

struct StartupContext {
    workflow_path: PathBuf,
    workflow_store: WorkflowStore,
    effective_config: ServiceConfig,
}

struct LinearOrchestratorPort {
    adapter: LinearAdapter,
}

impl LinearOrchestratorPort {
    fn new(adapter: LinearAdapter) -> Self {
        Self { adapter }
    }

    fn block_on<T>(&self, future: impl Future<Output = error::Result<T>>) -> error::Result<T> {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
    }
}

impl OrchestratorPort for LinearOrchestratorPort {
    fn startup_terminal_issues(&mut self, terminal_states: &[String]) -> error::Result<Vec<Issue>> {
        self.block_on(self.adapter.fetch_issues_by_states(terminal_states))
    }

    fn reconcile_running_issues(
        &mut self,
        running_issue_ids: &[String],
    ) -> error::Result<Vec<Issue>> {
        if running_issue_ids.is_empty() {
            return Ok(vec![]);
        }

        self.block_on(self.adapter.fetch_issue_states_by_ids(running_issue_ids))
    }

    fn validate_dispatch_preflight(&mut self, config: &ServiceConfig) -> error::Result<()> {
        config::validate(config).map(|_| ())
    }

    fn fetch_candidate_issues(&mut self) -> error::Result<Vec<Issue>> {
        self.block_on(self.adapter.fetch_candidate_issues())
    }

    fn refresh_issue(&mut self, issue_id: &str) -> error::Result<Option<Issue>> {
        let issue_ids = vec![issue_id.to_string()];
        let issues = self.block_on(self.adapter.fetch_issue_states_by_ids(&issue_ids))?;
        Ok(issues.into_iter().next())
    }
}

#[derive(Default)]
pub struct RuntimeBootstrapDeps {
    startup_context: Option<StartupContext>,
}

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
        let mut context = self.take_or_load_validated_context(workflow_path)?;

        if let Some(port) = cli.port {
            context.effective_config.server.port = Some(port);
        }

        // Build runtime dependencies so startup failures surface at bootstrap time.
        let tracker_client = LinearClient::new(context.effective_config.tracker.clone());
        let tracker_adapter = LinearAdapter::new(tracker_client);
        let mut tracker_port = LinearOrchestratorPort::new(tracker_adapter);
        let mut orchestrator = Orchestrator::new(context.effective_config.clone());

        tracing::info!(
            phase = "startup",
            stage = "runtime_init",
            workflow_path = %workflow_path.display(),
            server_port = ?context.effective_config.server.port,
            logs_root_configured = cli.logs_root.is_some(),
            guardrails_acknowledged = cli.acknowledge_guardrails,
            "constructed orchestrator runtime"
        );

        // Keep the watcher-backed store alive for the lifetime of the run.
        let _workflow_store = context.workflow_store;

        run_orchestrator_until_shutdown(&mut orchestrator, &mut tracker_port, workflow_path)
    }
}

pub fn parse_cli_from<I, T>(args: I) -> Result<Cli, clap::Error>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    Cli::try_parse_from(args)
}

pub fn resolve_workflow_path(cli: &Cli) -> PathBuf {
    PathBuf::from(&cli.workflow_path)
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

fn run_orchestrator_until_shutdown(
    orchestrator: &mut Orchestrator,
    port: &mut dyn OrchestratorPort,
    workflow_path: &Path,
) -> Result<(), String> {
    let handle = tokio::runtime::Handle::try_current()
        .map_err(|err| format!("missing tokio runtime for orchestrator startup: {err}"))?;

    tokio::task::block_in_place(|| {
        handle.block_on(async {
            tracing::info!(
                phase = "runtime",
                stage = "start",
                workflow_path = %workflow_path.display(),
                "starting orchestrator loop"
            );

            tokio::select! {
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
                signal_result = tokio::signal::ctrl_c() => {
                    match signal_result {
                        Ok(()) => {
                            tracing::info!(
                                phase = "runtime",
                                stage = "stopped",
                                reason = "ctrl_c",
                                workflow_path = %workflow_path.display(),
                                "received shutdown signal"
                            );
                            Ok(())
                        }
                        Err(err) => Err(format!("failed to listen for ctrl_c: {err}")),
                    }
                }
            }
        })
    })
}

fn init_tracing() {
    static INIT: Once = Once::new();

    INIT.call_once(|| {
        let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(false)
            .json()
            .try_init();
    });
}

fn run_entrypoint(args: impl IntoIterator<Item = OsString>) -> i32 {
    let cli = match parse_cli_from(args) {
        Ok(cli) => cli,
        Err(err) => {
            eprintln!("{err}");
            return 2;
        }
    };

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

#[tokio::main]
async fn main() {
    init_tracing();

    let code = run_entrypoint(std::env::args_os());
    if code != 0 {
        std::process::exit(code);
    }
}
