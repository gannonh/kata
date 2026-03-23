use chrono::Utc;
use serial_test::serial;
use tempfile::tempdir;

use symphony::docker::{
    container_name_from_issue, derived_image_tag, exec_command, resolve_codex_auth,
};
use symphony::domain::{DockerCodexAuth, Issue};
use symphony::error::SymphonyError;

fn test_issue(identifier: &str) -> Issue {
    Issue {
        id: "issue-id".to_string(),
        identifier: identifier.to_string(),
        title: "Issue title".to_string(),
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

fn restore_env(var: &str, previous: Option<String>) {
    if let Some(value) = previous {
        std::env::set_var(var, value);
    } else {
        std::env::remove_var(var);
    }
}

#[test]
fn test_derived_image_tag_is_deterministic() {
    let tag_a = derived_image_tag("symphony-worker:latest", "echo hello");
    let tag_b = derived_image_tag("symphony-worker:latest", "echo hello");
    assert_eq!(tag_a, tag_b);
}

#[test]
fn test_derived_image_tag_changes_with_content() {
    let tag_a = derived_image_tag("symphony-worker:latest", "echo hello");
    let tag_b = derived_image_tag("symphony-worker:latest", "echo world");
    assert_ne!(tag_a, tag_b);
}

#[test]
#[serial]
fn test_resolve_codex_auth_auto_with_api_key() {
    let prev_api_key = std::env::var("OPENAI_API_KEY").ok();
    std::env::set_var("OPENAI_API_KEY", "sk-test");

    let (env_vars, volumes) = resolve_codex_auth(DockerCodexAuth::Auto).unwrap();
    assert_eq!(
        env_vars,
        vec![("OPENAI_API_KEY".to_string(), "sk-test".to_string())]
    );
    assert!(volumes.is_empty());

    restore_env("OPENAI_API_KEY", prev_api_key);
}

#[test]
#[serial]
fn test_resolve_codex_auth_auto_with_auth_json() {
    let prev_api_key = std::env::var("OPENAI_API_KEY").ok();
    let prev_home = std::env::var("HOME").ok();
    std::env::remove_var("OPENAI_API_KEY");

    let home = tempdir().unwrap();
    let codex_dir = home.path().join(".codex");
    std::fs::create_dir_all(&codex_dir).unwrap();
    std::fs::write(codex_dir.join("auth.json"), "{}").unwrap();
    std::env::set_var("HOME", home.path());

    let (env_vars, volumes) = resolve_codex_auth(DockerCodexAuth::Auto).unwrap();
    assert!(env_vars.is_empty());
    assert_eq!(volumes.len(), 1);
    assert!(volumes[0].contains(".codex/auth.json:/root/.codex/auth.json:ro"));

    restore_env("OPENAI_API_KEY", prev_api_key);
    restore_env("HOME", prev_home);
}

#[test]
#[serial]
fn test_resolve_codex_auth_auto_neither_errors() {
    let prev_api_key = std::env::var("OPENAI_API_KEY").ok();
    let prev_home = std::env::var("HOME").ok();
    std::env::remove_var("OPENAI_API_KEY");

    let home = tempdir().unwrap();
    std::env::set_var("HOME", home.path());

    let result = resolve_codex_auth(DockerCodexAuth::Auto);
    assert!(matches!(result, Err(SymphonyError::DockerAuthError(_))));

    restore_env("OPENAI_API_KEY", prev_api_key);
    restore_env("HOME", prev_home);
}

#[test]
#[serial]
fn test_resolve_codex_auth_mount_missing_errors() {
    let prev_home = std::env::var("HOME").ok();
    let home = tempdir().unwrap();
    std::env::set_var("HOME", home.path());

    let result = resolve_codex_auth(DockerCodexAuth::Mount);
    assert!(matches!(result, Err(SymphonyError::DockerAuthError(_))));

    restore_env("HOME", prev_home);
}

#[test]
#[serial]
fn test_resolve_codex_auth_env_missing_errors() {
    let prev_api_key = std::env::var("OPENAI_API_KEY").ok();
    std::env::remove_var("OPENAI_API_KEY");

    let result = resolve_codex_auth(DockerCodexAuth::Env);
    assert!(matches!(result, Err(SymphonyError::DockerAuthError(_))));

    restore_env("OPENAI_API_KEY", prev_api_key);
}

#[test]
fn test_exec_command_builds_correct_args() {
    let cmd = exec_command("container-id", "echo hello");
    let std_cmd = cmd.as_std();
    let args: Vec<String> = std_cmd
        .get_args()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

    assert_eq!(std_cmd.get_program().to_string_lossy(), "docker");
    assert_eq!(
        args,
        vec!["exec", "-i", "container-id", "sh", "-lc", "echo hello"]
    );
}

#[test]
fn test_container_name_from_issue() {
    let issue = test_issue("KAT-821");
    assert_eq!(container_name_from_issue(&issue), "symphony-kat-821");
}
