use std::ffi::OsString;
use std::path::{Path, PathBuf};

use clap::Parser;
use symphony::{config, workflow};

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

#[derive(Default)]
pub struct RuntimeBootstrapDeps;

impl BootstrapDeps for RuntimeBootstrapDeps {
    fn workflow_exists(&mut self, workflow_path: &Path) -> bool {
        workflow_path.is_file()
    }

    fn startup_validate(&mut self, workflow_path: &Path) -> Result<(), String> {
        let definition = workflow::parse_workflow(workflow_path)
            .map_err(|err| format!("failed to parse workflow: {err}"))?;

        let config = config::from_workflow(&definition.config)
            .map_err(|err| format!("failed to decode workflow config: {err}"))?;

        config::validate(&config).map_err(|err| format!("invalid startup config: {err}"))?;
        Ok(())
    }

    fn start_orchestrator(&mut self, _workflow_path: &Path, _cli: &Cli) -> Result<(), String> {
        Err("orchestrator startup is not implemented yet".to_string())
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

    if !deps.workflow_exists(&workflow_path) {
        return Err(format!(
            "workflow file not found: {}",
            workflow_path.display()
        ));
    }

    // Intentionally incomplete in T01:
    // - startup validation is not invoked yet
    // - orchestrator startup is not invoked yet
    Ok(())
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let mut deps = RuntimeBootstrapDeps;

    if let Err(err) = execute_cli(&cli, &mut deps) {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
