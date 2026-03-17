use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "symphony",
    about = "Symphony orchestrator — polls Linear, dispatches Codex agent sessions"
)]
struct Cli {
    /// Path to WORKFLOW.md
    #[arg(default_value = "WORKFLOW.md")]
    workflow_path: String,

    /// HTTP server port
    #[arg(long)]
    port: Option<u16>,

    /// Log file root directory
    #[arg(long)]
    logs_root: Option<String>,

    /// Acknowledge that this runs without guardrails
    #[arg(long = "i-understand-that-this-will-be-running-without-the-usual-guardrails")]
    acknowledge_guardrails: bool,
}

#[tokio::main]
async fn main() {
    let _cli = Cli::parse();
    println!("Symphony starting...");
}
