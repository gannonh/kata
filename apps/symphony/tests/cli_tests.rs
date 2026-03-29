#[path = "../src/main.rs"]
mod main_bin;

use std::path::Path;
use std::process::Command;
use std::{fs, io};

use main_bin::{BootstrapDeps, Cli, CliCommand};
use mockito::{Matcher, Server};
use symphony::doctor::{self, CheckStatus};
use symphony::domain::{
    AgentBackend, ApiKey, ServiceConfig, TrackerConfig, WorkspaceConfig, WorkspaceIsolation,
    WorkspaceRepoStrategy,
};
use symphony::linear::adapter::LinearAdapter;
use symphony::linear::client::LinearClient;

struct FakeDeps {
    calls: Vec<String>,
    workflow_exists: bool,
    startup_validate_result: Result<(), String>,
    start_orchestrator_result: Result<(), String>,
}

impl Default for FakeDeps {
    fn default() -> Self {
        Self {
            calls: vec![],
            workflow_exists: false,
            startup_validate_result: Ok(()),
            start_orchestrator_result: Ok(()),
        }
    }
}

impl FakeDeps {
    fn call_history(&self) -> &[String] {
        &self.calls
    }
}

impl BootstrapDeps for FakeDeps {
    fn workflow_exists(&mut self, workflow_path: &Path) -> bool {
        self.calls
            .push(format!("workflow_exists:{}", workflow_path.display()));
        self.workflow_exists
    }

    fn startup_validate(&mut self, workflow_path: &Path) -> Result<(), String> {
        self.calls
            .push(format!("startup_validate:{}", workflow_path.display()));
        self.startup_validate_result.clone()
    }

    fn start_orchestrator(&mut self, workflow_path: &Path, _cli: &Cli) -> Result<(), String> {
        self.calls
            .push(format!("start_orchestrator:{}", workflow_path.display()));
        self.start_orchestrator_result.clone()
    }
}

#[test]
fn test_default_workflow_path_is_workflow_md() {
    let parsed = main_bin::parse_cli_from(["symphony"]);
    assert!(parsed.is_ok(), "CLI parse should succeed: {parsed:?}");

    let workflow_path = parsed
        .ok()
        .map(|cli| cli.workflow_path)
        .unwrap_or_else(|| "<missing>".to_string());

    assert_eq!(
        workflow_path, "WORKFLOW.md",
        "missing positional workflow path should default to WORKFLOW.md"
    );
}

#[test]
fn test_positional_workflow_override_is_respected() {
    let parsed = main_bin::parse_cli_from(["symphony", "tmp/custom/WORKFLOW.md"]);
    assert!(parsed.is_ok(), "CLI parse should succeed: {parsed:?}");

    let workflow_path = parsed
        .ok()
        .map(|cli| cli.workflow_path)
        .unwrap_or_else(|| "<missing>".to_string());

    assert_eq!(
        workflow_path, "tmp/custom/WORKFLOW.md",
        "explicit positional workflow path should override default"
    );
}

#[test]
fn test_doctor_subcommand_parses() {
    let parsed = main_bin::parse_cli_from(["symphony", "doctor", "WORKFLOW.md"])
        .expect("CLI parse should succeed");

    assert_eq!(
        parsed.command,
        Some(CliCommand::Doctor {
            workflow_path: "WORKFLOW.md".to_string()
        })
    );
}

#[test]
fn test_run_subcommand_backward_compat() {
    let parsed =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    assert!(
        parsed.command.is_none(),
        "default invocation should not select a subcommand"
    );
    assert_eq!(parsed.workflow_path, "WORKFLOW.md");
}

#[test]
fn test_missing_workflow_path_returns_startup_failure() {
    let parsed = main_bin::parse_cli_from(["symphony", "missing/WORKFLOW.md"]);
    assert!(parsed.is_ok(), "CLI parse should succeed");
    let cli = parsed.expect("CLI parse should succeed");

    let mut deps = FakeDeps {
        workflow_exists: false,
        ..FakeDeps::default()
    };

    let result = main_bin::execute_cli(&cli, &mut deps);
    assert!(
        result.is_err(),
        "missing workflow file should return startup error"
    );

    let message = result.err().unwrap_or_default();
    assert!(
        message.contains("workflow file not found"),
        "error should mention missing workflow path, got: {message}"
    );

    let called_validate = deps
        .call_history()
        .iter()
        .any(|call| call.starts_with("startup_validate:"));
    assert!(
        !called_validate,
        "startup validation should not run when workflow file does not exist"
    );

    let called_start = deps
        .call_history()
        .iter()
        .any(|call| call.starts_with("start_orchestrator:"));
    assert!(
        !called_start,
        "orchestrator startup should not run when workflow file does not exist"
    );
}

#[test]
fn test_startup_validation_failure_surfaces_error_and_stops_bootstrap() {
    let parsed = main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]);
    assert!(parsed.is_ok(), "CLI parse should succeed");
    let cli = parsed.expect("CLI parse should succeed");

    let mut deps = FakeDeps {
        workflow_exists: true,
        startup_validate_result: Err("missing tracker.api_key".to_string()),
        start_orchestrator_result: Ok(()),
        ..FakeDeps::default()
    };

    let result = main_bin::execute_cli(&cli, &mut deps);
    assert!(
        result.is_err(),
        "startup validation errors must fail bootstrap with non-zero semantics"
    );

    let called_start = deps
        .call_history()
        .iter()
        .any(|call| call.starts_with("start_orchestrator:"));

    assert!(
        !called_start,
        "orchestrator startup must not be invoked after validation failure"
    );
}

#[test]
fn test_successful_bootstrap_invokes_orchestrator_start() {
    let parsed = main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]);
    assert!(parsed.is_ok(), "CLI parse should succeed");
    let cli = parsed.expect("CLI parse should succeed");

    let mut deps = FakeDeps {
        workflow_exists: true,
        startup_validate_result: Ok(()),
        start_orchestrator_result: Ok(()),
        ..FakeDeps::default()
    };

    let result = main_bin::execute_cli(&cli, &mut deps);
    assert!(result.is_ok(), "valid bootstrap should succeed: {result:?}");

    assert_eq!(
        deps.call_history(),
        [
            "workflow_exists:WORKFLOW.md",
            "startup_validate:WORKFLOW.md",
            "start_orchestrator:WORKFLOW.md"
        ],
        "bootstrap should run existence check, startup validation, then orchestrator start"
    );
}

#[test]
fn test_orchestrator_start_failure_surfaces_error() {
    let cli =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    let mut deps = FakeDeps {
        workflow_exists: true,
        startup_validate_result: Ok(()),
        start_orchestrator_result: Err("bind failed".to_string()),
        ..FakeDeps::default()
    };

    let result = main_bin::execute_cli(&cli, &mut deps);
    assert!(result.is_err(), "startup failure should propagate");

    let message = result.err().unwrap_or_default();
    assert!(
        message.contains("orchestrator startup failed"),
        "error should include startup stage context, got: {message}"
    );
    assert!(
        message.contains("bind failed"),
        "error should include orchestrator startup failure reason"
    );

    assert_eq!(
        deps.call_history(),
        [
            "workflow_exists:WORKFLOW.md",
            "startup_validate:WORKFLOW.md",
            "start_orchestrator:WORKFLOW.md"
        ],
        "bootstrap should invoke orchestrator start before surfacing startup failure"
    );
}

#[test]
fn test_effective_http_binding_uses_workflow_server_port_when_cli_port_missing() {
    let mut config = ServiceConfig::default();
    config.server.host = "127.0.0.1".to_string();
    config.server.port = Some(8080);

    let cli =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    let binding = main_bin::effective_http_binding(&config, &cli)
        .expect("workflow config port should enable HTTP binding");

    assert_eq!(binding.host, "127.0.0.1");
    assert_eq!(binding.port, 8080);
}

#[test]
fn test_effective_http_binding_prefers_cli_port_override() {
    let mut config = ServiceConfig::default();
    config.server.host = "127.0.0.1".to_string();
    config.server.port = Some(8080);

    let cli = main_bin::parse_cli_from(["symphony", "WORKFLOW.md", "--port", "9090"])
        .expect("CLI parse should succeed");

    let binding = main_bin::effective_http_binding(&config, &cli)
        .expect("CLI override should enable HTTP binding");

    assert_eq!(binding.host, "127.0.0.1");
    assert_eq!(binding.port, 9090);
}

#[test]
fn test_effective_http_binding_defaults_to_8080() {
    let mut config = ServiceConfig::default();
    config.server.port = None;

    let cli =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    let binding = main_bin::effective_http_binding(&config, &cli);
    assert!(
        binding.is_some(),
        "HTTP binding should default to port 8080"
    );
    assert_eq!(binding.unwrap().port, 8080);
}

#[test]
fn test_startup_banner_includes_expected_runtime_summary_fields() {
    let mut config = ServiceConfig::default();
    config.tracker.project_slug = Some("89d4761fddf0".to_string());
    config.agent.max_concurrent_agents = 3;
    config.polling.interval_ms = 30_000;

    let cli = main_bin::parse_cli_from(["symphony", "WORKFLOW.md", "--logs-root", "/tmp/symphony"])
        .expect("CLI parse should succeed");

    let binding = main_bin::HttpBinding {
        host: "127.0.0.1".to_string(),
        port: 8080,
    };

    let banner = main_bin::build_startup_banner(&cli, &config, Some(&binding));

    assert!(
        banner.contains("Symphony v"),
        "banner should include version line, got: {banner}"
    );
    assert!(
        banner.contains("Dashboard: http://127.0.0.1:8080"),
        "banner should include dashboard URL, got: {banner}"
    );
    assert!(
        banner.contains("Logs: /tmp/symphony/log/symphony.log")
            || banner.contains("Logs: ~/symphony/log/symphony.log"),
        "banner should include resolved log file path (raw or home-aliased), got: {banner}"
    );
    assert!(
        banner.contains("Project: 89d4761fddf0"),
        "banner should include project slug, got: {banner}"
    );
    assert!(
        banner.contains("Workers: 3 max concurrent"),
        "banner should include worker count, got: {banner}"
    );
    assert!(
        banner.contains("Polling: every 30s"),
        "banner should include polling cadence, got: {banner}"
    );
    assert!(
        banner.contains("Press Ctrl+C to stop."),
        "banner should include shutdown hint, got: {banner}"
    );
}

#[test]
fn test_startup_banner_brackets_ipv6_dashboard_host() {
    let mut config = ServiceConfig::default();
    config.tracker.project_slug = Some("89d4761fddf0".to_string());

    let cli =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    let binding = main_bin::HttpBinding {
        host: "::1".to_string(),
        port: 8080,
    };

    let banner = main_bin::build_startup_banner(&cli, &config, Some(&binding));
    assert!(
        banner.contains("Dashboard: http://[::1]:8080"),
        "banner should bracket IPv6 host in URL, got: {banner}"
    );
}

#[test]
fn test_startup_banner_marks_ephemeral_dashboard_port() {
    let mut config = ServiceConfig::default();
    config.tracker.project_slug = Some("89d4761fddf0".to_string());

    let cli =
        main_bin::parse_cli_from(["symphony", "WORKFLOW.md"]).expect("CLI parse should succeed");

    let binding = main_bin::HttpBinding {
        host: "127.0.0.1".to_string(),
        port: 0,
    };

    let banner = main_bin::build_startup_banner(&cli, &config, Some(&binding));
    assert!(
        banner.contains("Dashboard: http://127.0.0.1:<ephemeral>"),
        "banner should mark ephemeral dashboard ports, got: {banner}"
    );
}

#[test]
fn test_logs_root_writes_startup_logs_to_file_and_suppresses_stdout_logs() {
    let logs_root = tempfile::tempdir().expect("temp dir should be created");
    let missing_workflow = logs_root.path().join("missing-workflow.md");

    let output = Command::new(env!("CARGO_BIN_EXE_symphony"))
        .arg(&missing_workflow)
        .arg("--logs-root")
        .arg(logs_root.path())
        .output()
        .expect("symphony binary should execute");

    assert!(
        !output.status.success(),
        "missing workflow path should still fail startup"
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        !stdout.contains("starting CLI bootstrap"),
        "stdout should suppress startup log stream when --logs-root is set; got: {stdout}"
    );
    assert!(
        !stdout.contains("\"phase\":\"startup\""),
        "stdout should not include startup JSON fields when --logs-root is set; got: {stdout}"
    );

    let log_file_path = logs_root.path().join("log").join("symphony.log");
    assert!(
        log_file_path.is_file(),
        "expected log file at {}",
        log_file_path.display()
    );

    let log_file_contents = read_to_string_or_panic(&log_file_path);
    assert!(
        log_file_contents.contains("starting CLI bootstrap"),
        "log file should mirror startup log events; got: {log_file_contents}"
    );
}

#[test]
fn test_without_logs_root_suppresses_stdout_logs_when_tui_defaults_on() {
    let run_dir = tempfile::tempdir().expect("temp dir should be created");
    let missing_workflow = run_dir.path().join("missing-workflow.md");

    let output = Command::new(env!("CARGO_BIN_EXE_symphony"))
        .current_dir(run_dir.path())
        .arg(&missing_workflow)
        .output()
        .expect("symphony binary should execute");

    assert!(
        !output.status.success(),
        "missing workflow path should still fail startup"
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        !stdout.contains("starting CLI bootstrap"),
        "stdout should suppress startup logs when TUI is enabled by default; got: {stdout}"
    );
    assert!(
        !stdout.contains("\"phase\":\"startup\""),
        "stdout should suppress startup JSON fields when TUI is enabled by default; got: {stdout}"
    );

    let log_file_path = run_dir.path().join("log").join("symphony.log");
    assert!(
        !log_file_path.exists(),
        "no log file should be created when --logs-root is omitted, found {}",
        log_file_path.display()
    );
}

#[test]
fn test_without_logs_root_no_tui_streams_stdout_logs() {
    let run_dir = tempfile::tempdir().expect("temp dir should be created");
    let missing_workflow = run_dir.path().join("missing-workflow.md");

    let output = Command::new(env!("CARGO_BIN_EXE_symphony"))
        .current_dir(run_dir.path())
        .arg(&missing_workflow)
        .arg("--no-tui")
        .output()
        .expect("symphony binary should execute");

    assert!(
        !output.status.success(),
        "missing workflow path should still fail startup"
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("starting CLI bootstrap"),
        "stdout should include startup logs when --no-tui is set and --logs-root is omitted; got: {stdout}"
    );

    let log_file_path = run_dir.path().join("log").join("symphony.log");
    assert!(
        !log_file_path.exists(),
        "no log file should be created when --logs-root is omitted, found {}",
        log_file_path.display()
    );
}

#[test]
fn test_doctor_config_check_catches_missing_api_key() {
    let temp_dir = tempfile::tempdir().expect("temp dir should be created");
    let workflow_path = temp_dir.path().join("WORKFLOW.md");

    fs::write(
        &workflow_path,
        "---\ntracker:\n  kind: linear\n  project_slug: my-project\n---\nPrompt",
    )
    .expect("workflow fixture should be written");

    let results = doctor::check_config(&workflow_path);
    assert!(doctor::has_errors(&results));
    assert!(results.iter().any(|result| {
        result.status == CheckStatus::Error
            && result.name == "Config Validate"
            && result.message.contains("missing Linear API token")
    }));
}

#[test]
fn test_check_backend_with_nonexistent_command() {
    let mut config = ServiceConfig::default();
    config.agent_backend = AgentBackend::Codex;
    config.codex.command = vec!["definitely-not-a-real-command-symphony".to_string()];

    let results = doctor::check_backend(&config);
    assert!(results.iter().any(|result| {
        result.status == CheckStatus::Error
            && result.name == "Backend"
            && result.message.contains("not found on PATH")
    }));
}

#[test]
fn test_check_workspace_root_nonexistent_and_creatable() {
    let temp_dir = tempfile::tempdir().expect("temp dir should be created");
    let workspace_root = temp_dir.path().join("new-workspaces");

    let mut workspace = WorkspaceConfig::default();
    workspace.root = workspace_root.display().to_string();
    workspace.repo = Some(temp_dir.path().display().to_string());
    workspace.strategy = WorkspaceRepoStrategy::Auto;
    workspace.isolation = WorkspaceIsolation::Local;

    let results = doctor::check_workspace(&workspace);
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Pass && result.name == "Workspace Root" }));
    assert!(
        workspace_root.exists(),
        "doctor should create workspace root"
    );
}

#[test]
fn test_check_workspace_strategy_reports_remote_worktree_mismatch() {
    let mut workspace = WorkspaceConfig::default();
    workspace.root = tempfile::tempdir()
        .expect("temp dir should be created")
        .path()
        .display()
        .to_string();
    workspace.repo = Some("https://github.com/kata-sh/kata.git".to_string());
    workspace.strategy = WorkspaceRepoStrategy::Worktree;

    let results = doctor::check_workspace(&workspace);
    assert!(results.iter().any(|result| {
        result.status == CheckStatus::Error
            && result.name == "Workspace Strategy"
            && result
                .message
                .contains("requires a local workspace.repo path")
    }));
}

#[test]
fn test_check_workspace_root_nonexistent_and_not_creatable() {
    let mut workspace = WorkspaceConfig::default();
    workspace.root = "/dev/null/symphony-root".to_string();
    workspace.strategy = WorkspaceRepoStrategy::Auto;
    workspace.isolation = WorkspaceIsolation::Local;

    let results = doctor::check_workspace(&workspace);
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Error && result.name == "Workspace Root" }));
}

#[tokio::test]
async fn test_check_linear_auth_failure() {
    let mut server = Server::new_async().await;
    let _auth_mock = server
        .mock("POST", "/graphql")
        .with_status(401)
        .with_header("content-type", "application/json")
        .with_body("{\"error\":\"Unauthorized\"}")
        .create_async()
        .await;

    let config = TrackerConfig {
        kind: Some("linear".to_string()),
        endpoint: format!("{}/graphql", server.url()),
        api_key: Some(ApiKey::new("bad-key")),
        project_slug: Some("proj".to_string()),
        workspace_slug: None,
        repo_owner: None,
        repo_name: None,
        github_project_number: None,
        label_prefix: None,
        assignee: None,
        active_states: vec!["Todo".to_string()],
        terminal_states: vec!["Done".to_string()],
        exclude_labels: vec![],
    };

    let results = doctor::check_linear(&config).await;
    assert!(results.iter().any(|result| {
        result.status == CheckStatus::Error
            && result.name == "Linear Auth"
            && result.message.contains("HTTP 401")
    }));
}

#[tokio::test]
async fn test_doctor_full_run_with_valid_config() {
    let temp_dir = tempfile::tempdir().expect("temp dir should be created");
    let workspace_root = temp_dir.path().join("workspaces");
    let local_repo = temp_dir.path().join("repo");
    fs::create_dir_all(&local_repo).expect("local repo fixture should be created");

    let mut server = Server::new_async().await;

    let _viewer_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("SymphonyDoctorViewer".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("{\"data\":{\"viewer\":{\"id\":\"viewer-1\"}}}")
        .create_async()
        .await;

    let _project_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("SymphonyDoctorProject".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            "{\"data\":{\"projects\":{\"nodes\":[{\"id\":\"proj-1\",\"name\":\"Project\",\"teams\":{\"nodes\":[{\"id\":\"team-1\",\"name\":\"Team\",\"states\":{\"nodes\":[{\"name\":\"Todo\"},{\"name\":\"In Progress\"},{\"name\":\"Done\"}]}}]}}]}}}",
        )
        .create_async()
        .await;

    let _issues_mock = server
        .mock("POST", "/graphql")
        .match_body(Matcher::Regex("SymphonyLinearPoll".to_string()))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            "{\"data\":{\"issues\":{\"nodes\":[],\"pageInfo\":{\"hasNextPage\":false,\"endCursor\":null}}}}",
        )
        .create_async()
        .await;

    let workflow_path = temp_dir.path().join("WORKFLOW.md");
    fs::write(
        &workflow_path,
        format!(
            "---\ntracker:\n  kind: linear\n  api_key: test-token\n  endpoint: {endpoint}\n  project_slug: project\n  active_states:\n    - Todo\n    - In Progress\n  terminal_states:\n    - Done\nworkspace:\n  root: {workspace_root}\n  repo: {repo}\n  git_strategy: auto\n  isolation: local\nagent:\n  backend: codex\ncodex:\n  command:\n    - git\n---\nPrompt\n",
            endpoint = format!("{}/graphql", server.url()),
            workspace_root = workspace_root.display(),
            repo = local_repo.display(),
        ),
    )
    .expect("workflow fixture should be written");

    let mut results = doctor::check_config(&workflow_path);
    assert!(
        !doctor::has_errors(&results),
        "config checks should pass: {results:?}"
    );

    let service_config = doctor::load_service_config(&workflow_path)
        .expect("doctor should load config for runtime checks");

    results.extend(doctor::check_linear(&service_config.tracker).await);
    results.extend(doctor::check_backend(&service_config));
    results.extend(doctor::check_workspace(&service_config.workspace));

    let adapter = LinearAdapter::new(LinearClient::new(service_config.tracker.clone()));
    results.extend(doctor::check_orphans(&service_config, &adapter).await);

    assert!(
        !doctor::has_errors(&results),
        "full doctor checks should pass: {results:?}"
    );
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Pass && result.name == "Linear Auth" }));
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Pass && result.name == "Backend" }));
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Pass && result.name == "Workspace Root" }));
    assert!(results
        .iter()
        .any(|result| { result.status == CheckStatus::Pass && result.name == "Orphans" }));
}

fn read_to_string_or_panic(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_else(|err| panic_io(path, err))
}

fn panic_io(path: &Path, err: io::Error) -> ! {
    panic!("failed to read {}: {err}", path.display());
}
