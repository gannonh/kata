//! Integration tests for Docker container isolation.
//! Requires Docker daemon running and SYMPHONY_DOCKER_TESTS=1.

use chrono::Utc;
use serial_test::serial;
use tokio::process::Command;

use symphony::docker;
use symphony::domain::{DockerCodexAuth, DockerConfig, Issue};

fn docker_tests_enabled() -> bool {
    std::env::var("SYMPHONY_DOCKER_TESTS").unwrap_or_default() == "1"
}

fn unique_identifier(prefix: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{prefix}-{nanos}")
}

fn make_issue(identifier: String) -> Issue {
    Issue {
        id: identifier.clone(),
        identifier,
        title: "Docker integration test".to_string(),
        description: None,
        priority: None,
        state: "In Progress".to_string(),
        branch_name: None,
        url: None,
        assignee_id: None,
        labels: vec![],
        blocked_by: vec![],
        assigned_to_worker: true,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
    }
}

#[tokio::test]
async fn test_docker_available() {
    if !docker_tests_enabled() {
        return;
    }
    assert!(docker::is_docker_available().await);
}

#[tokio::test]
#[serial]
async fn test_start_and_stop_container() {
    if !docker_tests_enabled() {
        return;
    }

    if !docker::is_docker_available().await {
        return;
    }

    let previous_api_key = std::env::var("OPENAI_API_KEY").ok();
    std::env::set_var("OPENAI_API_KEY", "sk-test");

    let issue = make_issue(unique_identifier("KAT-821-container"));
    let docker_config = DockerConfig {
        codex_auth: DockerCodexAuth::Env,
        ..DockerConfig::default()
    };

    let container_id = docker::start_container("alpine:3.20", &issue, &docker_config, &[])
        .await
        .expect("container should start");

    let inspect_output = Command::new("docker")
        .args(["inspect", "-f", "{{.State.Running}}", &container_id])
        .output()
        .await
        .expect("docker inspect should run");
    assert!(
        String::from_utf8_lossy(&inspect_output.stdout).trim() == "true",
        "container should be running"
    );

    docker::stop_container(&container_id)
        .await
        .expect("container should stop");

    let inspect_after_stop = Command::new("docker")
        .args(["inspect", &container_id])
        .output()
        .await
        .expect("docker inspect after stop should run");
    assert!(
        !inspect_after_stop.status.success(),
        "container should be removed after stop"
    );

    if let Some(value) = previous_api_key {
        std::env::set_var("OPENAI_API_KEY", value);
    } else {
        std::env::remove_var("OPENAI_API_KEY");
    }
}

#[tokio::test]
#[serial]
async fn test_exec_in_container() {
    if !docker_tests_enabled() {
        return;
    }

    if !docker::is_docker_available().await {
        return;
    }

    let previous_api_key = std::env::var("OPENAI_API_KEY").ok();
    std::env::set_var("OPENAI_API_KEY", "sk-test");

    let issue = make_issue(unique_identifier("KAT-821-exec"));
    let docker_config = DockerConfig {
        codex_auth: DockerCodexAuth::Env,
        ..DockerConfig::default()
    };

    let container_id = docker::start_container("alpine:3.20", &issue, &docker_config, &[])
        .await
        .expect("container should start");

    let output = docker::exec_in_container(&container_id, "echo hello")
        .await
        .expect("docker exec should succeed");
    assert_eq!(output.trim(), "hello");

    docker::stop_container(&container_id)
        .await
        .expect("container should stop");

    if let Some(value) = previous_api_key {
        std::env::set_var("OPENAI_API_KEY", value);
    } else {
        std::env::remove_var("OPENAI_API_KEY");
    }
}

#[tokio::test]
#[serial]
async fn test_auth_resolution_auto() {
    if !docker_tests_enabled() {
        return;
    }

    let previous_api_key = std::env::var("OPENAI_API_KEY").ok();
    std::env::set_var("OPENAI_API_KEY", "sk-test");

    let (env_vars, volumes) =
        docker::resolve_codex_auth(DockerCodexAuth::Auto).expect("auto auth should resolve");
    assert!(!env_vars.is_empty());
    assert!(volumes.is_empty());

    if let Some(value) = previous_api_key {
        std::env::set_var("OPENAI_API_KEY", value);
    } else {
        std::env::remove_var("OPENAI_API_KEY");
    }
}
