#[path = "../src/main.rs"]
mod main_bin;

use std::path::Path;

use main_bin::{BootstrapDeps, Cli};
use symphony::domain::ServiceConfig;

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
