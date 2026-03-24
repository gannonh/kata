//! Integration tests for workflow parsing, config extraction, and Liquid rendering.
//!
//! These tests define and verify the behavioral contract for slice S02:
//! WORKFLOW.md parsing, typed config extraction, env-var resolution,
//! tilde expansion, and WorkflowStore hot-reload.

use serial_test::serial;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

use symphony::config::{from_workflow, validate};
use symphony::domain::{
    CodexConfig, DockerCodexAuth, ServiceConfig, TrackerConfig, WorkspaceConfig,
    WorkspaceIsolation, WorkspaceRepoStrategy,
};
use symphony::error::SymphonyError;
use symphony::workflow::parse_workflow;
use symphony::workflow_store::WorkflowStore;

// ─────────────────────────────────────────────────────────────────────────────
// Parse group
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_parse_workflow_happy_path() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n---\nHello {{{{ issue.id }}}}"
    )
    .unwrap();

    let result = parse_workflow(file.path());
    let def = result.expect("happy-path parse should succeed");

    assert!(
        def.prompt_template.contains("Hello"),
        "prompt_template should contain 'Hello', got: {:?}",
        def.prompt_template
    );
    let kind = def.config["tracker"]["kind"].as_str().unwrap_or("");
    assert_eq!(kind, "linear");
}

#[test]
fn test_parse_workflow_no_delimiter() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "Hello {{{{ issue.id }}}}").unwrap();

    let result = parse_workflow(file.path());
    let def = result.expect("no-delimiter parse should succeed");

    assert!(
        def.prompt_template.contains("Hello"),
        "whole file should become prompt, got: {:?}",
        def.prompt_template
    );
    // config yields an empty/null/default mapping (no front matter)
    assert!(
        def.config.is_mapping() || def.config.is_null(),
        "config should be empty mapping or null, got: {:?}",
        def.config
    );
}

#[test]
fn test_parse_workflow_delimiter_not_on_first_line_is_not_front_matter() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "Intro paragraph\n---\nthis-is-not-front-matter\n---\nPrompt body"
    )
    .unwrap();

    let result = parse_workflow(file.path());
    let def = result.expect("non-leading delimiters should be treated as prompt text");

    assert!(
        def.config.as_mapping().is_some_and(|m| m.is_empty()),
        "config should be empty when front matter does not start at line 1, got: {:?}",
        def.config
    );
    assert!(
        def.prompt_template.contains("Intro paragraph"),
        "prompt should preserve text before delimiter, got: {:?}",
        def.prompt_template
    );
    assert!(
        def.prompt_template.contains("---"),
        "prompt should preserve markdown horizontal rule delimiters, got: {:?}",
        def.prompt_template
    );
}

#[test]
fn test_parse_workflow_empty_yaml() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "---\n\n---\nSome prompt text").unwrap();

    let result = parse_workflow(file.path());
    let def = result.expect("empty YAML front matter should succeed with defaults");

    assert!(
        def.prompt_template.contains("Some prompt text"),
        "prompt should contain body text, got: {:?}",
        def.prompt_template
    );
}

#[test]
fn test_parse_workflow_non_map_yaml() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(file, "---\n- list item\n---\nSome prompt").unwrap();

    let result = parse_workflow(file.path());
    assert!(
        matches!(result, Err(SymphonyError::WorkflowFrontMatterNotAMap)),
        "non-map YAML front matter should return WorkflowFrontMatterNotAMap, got: {:?}",
        result
    );
}

#[test]
fn test_repo_workflow_requires_publish_gate_before_human_review() {
    let workflow_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("WORKFLOW-symphony.md");
    let def = parse_workflow(&workflow_path)
        .expect("repo WORKFLOW.md should parse for publish-gate contract assertions");

    assert!(
        def.prompt_template
            .contains("git ls-remote --exit-code --heads origin \"$(git branch --show-current)\""),
        "WORKFLOW.md must require explicit remote-branch proof before Human Review"
    );
    assert!(
        def.prompt_template
            .contains("gh pr view --json url,state,headRefName,baseRefName"),
        "WORKFLOW.md must require explicit PR proof before Human Review"
    );
    assert!(
        def.prompt_template
            .contains("If either publish proof fails, do not move state"),
        "WORKFLOW.md must explicitly block Human Review transition until publish checks pass"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config group
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_config_defaults() {
    let empty = serde_yaml::Value::Mapping(serde_yaml::Mapping::new());
    let config = from_workflow(&empty).expect("empty config should produce spec §5.3 defaults");

    assert_eq!(config.tracker.kind, None);
    assert_eq!(config.tracker.api_key, None);
    assert_eq!(config.tracker.project_slug, None);
    assert_eq!(config.tracker.workspace_slug, None);
    assert_eq!(config.polling.interval_ms, 30_000);
    assert_eq!(config.agent.max_concurrent_agents, 10);
    assert_eq!(config.agent.max_turns, 20);
    assert_eq!(config.workspace.repo, None);
    assert_eq!(config.workspace.strategy, WorkspaceRepoStrategy::Auto);
    assert_eq!(config.workspace.isolation, WorkspaceIsolation::Local);
    assert_eq!(config.workspace.branch_prefix, "symphony");
    assert_eq!(config.workspace.clone_branch, None);
    assert_eq!(config.workspace.base_branch.as_deref(), Some("main"));
    assert!(!config.workspace.cleanup_on_done);
}

#[test]
#[serial]
fn test_config_env_var_resolution() {
    // Note: use a test-unique env var name to limit parallel-test interference.
    std::env::set_var("SYMPHONY_TEST_LINEAR_API_KEY", "test-key");

    let yaml_str = "tracker:\n  api_key: $SYMPHONY_TEST_LINEAR_API_KEY";
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("$ENV_VAR should be resolved to its value");

    assert_eq!(
        config.tracker.api_key.as_deref(),
        Some("test-key"),
        "api_key should be resolved from env"
    );

    std::env::remove_var("SYMPHONY_TEST_LINEAR_API_KEY");
}

#[test]
fn test_config_workspace_slug_parse() {
    let yaml_str = "tracker:\n  workspace_slug: acme";
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace slug should parse");
    assert_eq!(config.tracker.workspace_slug.as_deref(), Some("acme"));
}

#[test]
fn test_config_workspace_slug_whitespace_is_treated_as_missing() {
    let yaml_str = "tracker:\n  workspace_slug: \"   \"";
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace slug should parse");
    assert_eq!(config.tracker.workspace_slug, None);
}

#[test]
#[serial]
fn test_config_empty_literal_api_key_does_not_use_linear_api_key_fallback() {
    let previous_linear_api_key = std::env::var("LINEAR_API_KEY").ok();
    std::env::set_var("LINEAR_API_KEY", "fallback-linear-token");

    let yaml_str = "tracker:\n  api_key: \"\"";
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("empty literal api_key should parse");

    assert_eq!(
        config.tracker.api_key, None,
        "literal empty api_key should remain missing instead of using LINEAR_API_KEY fallback"
    );

    match previous_linear_api_key {
        Some(value) => std::env::set_var("LINEAR_API_KEY", value),
        None => std::env::remove_var("LINEAR_API_KEY"),
    }
}

#[test]
#[serial]
fn test_config_tilde_expansion() {
    let previous_home = std::env::var("HOME").ok();
    std::env::set_var("HOME", "/tmp/symphony-test-home");

    let yaml_str = "workspace:\n  root: ~/workspaces";
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("tilde expansion should succeed");

    assert_eq!(
        config.workspace.root, "/tmp/symphony-test-home/workspaces",
        "workspace root should expand against HOME"
    );

    match previous_home {
        Some(home) => std::env::set_var("HOME", home),
        None => std::env::remove_var("HOME"),
    }
}

#[test]
fn test_workspace_git_strategy_and_branch_prefix_parse() {
    let yaml_str = r#"
workspace:
  root: ~/workspaces
  repo: https://github.com/gannonh/kata.git
  git_strategy: clone-remote
  branch_prefix: " symphony "
  clone_branch: elixir-feature-parity
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace bootstrap config should parse");

    assert_eq!(
        config.workspace.repo.as_deref(),
        Some("https://github.com/gannonh/kata.git")
    );
    assert_eq!(
        config.workspace.strategy,
        WorkspaceRepoStrategy::CloneRemote
    );
    assert_eq!(config.workspace.branch_prefix, "symphony");
    assert_eq!(
        config.workspace.clone_branch.as_deref(),
        Some("elixir-feature-parity")
    );
    assert_eq!(config.workspace.base_branch.as_deref(), Some("main"));
}

#[test]
fn test_workspace_legacy_strategy_clone_maps_to_auto() {
    let yaml_str = r#"
workspace:
  strategy: clone
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("legacy workspace strategy should parse");
    assert_eq!(config.workspace.strategy, WorkspaceRepoStrategy::Auto);
}

#[test]
fn test_workspace_legacy_strategy_worktree_maps_to_worktree() {
    let yaml_str = r#"
workspace:
  strategy: worktree
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("legacy workspace strategy should parse");
    assert_eq!(config.workspace.strategy, WorkspaceRepoStrategy::Worktree);
}

#[test]
fn test_workspace_git_strategy_takes_precedence_over_legacy_strategy() {
    let yaml_str = r#"
workspace:
  strategy: worktree
  git_strategy: clone-local
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace strategy precedence should parse");
    assert_eq!(config.workspace.strategy, WorkspaceRepoStrategy::CloneLocal);
}

#[test]
fn test_workspace_clone_branch_blank_is_ignored() {
    let yaml_str = r#"
workspace:
  clone_branch: "   "
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace clone branch should parse");
    assert_eq!(config.workspace.clone_branch, None);
}

#[test]
fn test_workspace_base_branch_parses_and_trims() {
    let yaml_str = r#"
workspace:
  base_branch: " elixir-feature-parity "
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace base branch should parse");
    assert_eq!(
        config.workspace.base_branch.as_deref(),
        Some("elixir-feature-parity")
    );
}

#[test]
fn test_workspace_base_branch_blank_uses_default_main() {
    let yaml_str = r#"
workspace:
  base_branch: "   "
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace base branch blank should parse");
    assert_eq!(config.workspace.base_branch.as_deref(), Some("main"));
}

#[test]
fn test_workspace_isolation_defaults_to_local() {
    let yaml_str = r#"
workspace:
  repo: /tmp/local-repo
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("workspace defaults should parse");
    assert_eq!(config.workspace.isolation, WorkspaceIsolation::Local);
}

#[test]
fn test_workspace_isolation_docker_parses() {
    let yaml_str = r#"
workspace:
  isolation: docker
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("docker isolation should parse");
    assert_eq!(config.workspace.isolation, WorkspaceIsolation::Docker);
    assert!(config.workspace.docker.is_some());
}

#[test]
fn test_docker_isolation_parses_with_defaults() {
    let yaml_str = r#"
workspace:
  isolation: docker
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("docker defaults should parse");

    let docker = config.workspace.docker.expect("docker config should exist");
    assert_eq!(docker.image, "symphony-worker:latest");
    assert_eq!(docker.setup, None);
    assert_eq!(docker.codex_auth, DockerCodexAuth::Auto);
    assert!(docker.env.is_empty());
    assert!(docker.volumes.is_empty());
}

#[test]
fn test_docker_isolation_parses_full_config() {
    let yaml_str = r#"
workspace:
  isolation: docker
  docker:
    image: my-worker:dev
    setup: docker/setups/rust.sh
    codex_auth: mount
    env:
      - FOO=bar
      - BAR=baz
    volumes:
      - ~/.ssh:/home/node/.ssh:ro
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("full docker config should parse");

    let docker = config.workspace.docker.expect("docker config should exist");
    assert_eq!(docker.image, "my-worker:dev");
    assert_eq!(docker.setup.as_deref(), Some("docker/setups/rust.sh"));
    assert_eq!(docker.codex_auth, DockerCodexAuth::Mount);
    assert_eq!(
        docker.env,
        vec!["FOO=bar".to_string(), "BAR=baz".to_string()]
    );
    assert_eq!(docker.volumes.len(), 1);
    assert!(docker.volumes[0].contains(".ssh:/home/node/.ssh:ro"));
}

#[test]
fn test_docker_codex_auth_values() {
    for (value, expected) in [
        ("auto", DockerCodexAuth::Auto),
        ("mount", DockerCodexAuth::Mount),
        ("env", DockerCodexAuth::Env),
    ] {
        let yaml_str = format!(
            r#"
workspace:
  isolation: docker
  docker:
    codex_auth: {value}
"#
        );
        let raw: serde_yaml::Value = serde_yaml::from_str(&yaml_str).unwrap();
        let config = from_workflow(&raw).expect("docker codex auth should parse");
        assert_eq!(
            config
                .workspace
                .docker
                .expect("docker config should exist")
                .codex_auth,
            expected
        );
    }
}

#[test]
fn test_docker_config_absent_when_local_isolation() {
    let yaml_str = r#"
workspace:
  isolation: local
  docker:
    image: ignored
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let config = from_workflow(&raw).expect("local isolation with docker section should parse");
    assert_eq!(config.workspace.isolation, WorkspaceIsolation::Local);
    assert!(config.workspace.docker.is_none());
}

#[test]
fn test_docker_isolation_rejects_worker_ssh_hosts() {
    let yaml_str = r#"
workspace:
  isolation: docker
worker:
  ssh_hosts:
    - worker-a
    - worker-b
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let err = from_workflow(&raw).expect_err("docker isolation should reject worker.ssh_hosts");
    assert!(
        err.to_string()
            .contains("worker.ssh_hosts is not supported with workspace.isolation 'docker'"),
        "unexpected error: {err}"
    );
}

#[test]
fn test_docker_isolation_rejects_clone_local_strategy() {
    let yaml_str = r#"
workspace:
  isolation: docker
  repo: /tmp/local-repo
  git_strategy: clone-local
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let err = from_workflow(&raw).expect_err("docker isolation should reject clone-local");
    assert!(
        err.to_string().contains(
            "workspace.git_strategy 'clone-local' is not supported with workspace.isolation 'docker'"
        ),
        "unexpected error: {err}"
    );
}

#[test]
fn test_docker_isolation_rejects_worktree_strategy() {
    let yaml_str = r#"
workspace:
  isolation: docker
  repo: /tmp/local-repo
  strategy: worktree
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let err = from_workflow(&raw).expect_err("docker isolation should reject worktree");
    assert!(
        err.to_string().contains(
            "workspace.git_strategy 'worktree' is not supported with workspace.isolation 'docker'"
        ),
        "unexpected error: {err}"
    );
}

#[test]
fn test_docker_isolation_rejects_auto_with_local_repo() {
    let yaml_str = r#"
workspace:
  isolation: docker
  repo: /tmp/local-repo
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let err = from_workflow(&raw).expect_err("docker isolation should reject local auto strategy");
    assert!(
        err.to_string().contains(
            "workspace.git_strategy 'clone-local' is not supported with workspace.isolation 'docker'"
        ),
        "unexpected error: {err}"
    );
}

#[test]
fn test_workspace_cleanup_on_done_parses_true_and_false() {
    let yaml_true = r#"
workspace:
  cleanup_on_done: true
"#;
    let raw_true: serde_yaml::Value = serde_yaml::from_str(yaml_true).unwrap();
    let config_true = from_workflow(&raw_true).expect("cleanup_on_done=true should parse");
    assert!(config_true.workspace.cleanup_on_done);

    let yaml_false = r#"
workspace:
  cleanup_on_done: false
"#;
    let raw_false: serde_yaml::Value = serde_yaml::from_str(yaml_false).unwrap();
    let config_false = from_workflow(&raw_false).expect("cleanup_on_done=false should parse");
    assert!(!config_false.workspace.cleanup_on_done);
}

#[test]
fn test_workspace_strategy_invalid_value_errors() {
    let yaml_str = r#"
workspace:
  repo: /tmp/local-repo
  strategy: invalid
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let result = from_workflow(&raw);

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.strategy")),
        "invalid workspace.strategy should return InvalidWorkflowConfig, got: {:?}",
        result
    );
}

#[test]
fn test_workspace_git_strategy_invalid_value_errors() {
    let yaml_str = r#"
workspace:
  git_strategy: invalid
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let result = from_workflow(&raw);

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.git_strategy")),
        "invalid workspace.git_strategy should return InvalidWorkflowConfig, got: {:?}",
        result
    );
}

#[test]
fn test_workspace_isolation_invalid_value_errors() {
    let yaml_str = r#"
workspace:
  isolation: invalid
"#;
    let raw: serde_yaml::Value = serde_yaml::from_str(yaml_str).unwrap();
    let result = from_workflow(&raw);

    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.isolation")),
        "invalid workspace.isolation should return InvalidWorkflowConfig, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_rejects_worktree_without_repo() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        workspace: WorkspaceConfig {
            strategy: WorkspaceRepoStrategy::Worktree,
            repo: None,
            ..WorkspaceConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.repo")),
        "worktree strategy without repo should fail validation, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_rejects_worktree_with_remote_repo() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        workspace: WorkspaceConfig {
            strategy: WorkspaceRepoStrategy::Worktree,
            repo: Some("https://github.com/gannonh/kata.git".to_string()),
            ..WorkspaceConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.strategy") && msg.contains("local")),
        "worktree strategy with remote repo should fail validation, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_rejects_clone_local_with_remote_repo() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        workspace: WorkspaceConfig {
            strategy: WorkspaceRepoStrategy::CloneLocal,
            repo: Some("https://github.com/gannonh/kata.git".to_string()),
            ..WorkspaceConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.git_strategy") && msg.contains("clone-local")),
        "clone-local strategy with remote repo should fail validation, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_rejects_clone_local_without_repo() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        workspace: WorkspaceConfig {
            strategy: WorkspaceRepoStrategy::CloneLocal,
            repo: None,
            ..WorkspaceConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.repo") && msg.contains("clone-local")),
        "clone-local strategy without repo should fail validation, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_rejects_clone_local_with_scp_style_remote_repo() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        workspace: WorkspaceConfig {
            strategy: WorkspaceRepoStrategy::CloneLocal,
            repo: Some("github.example.com:org/repo.git".to_string()),
            ..WorkspaceConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("workspace.git_strategy") && msg.contains("clone-local")),
        "clone-local strategy with SCP-style remote repo should fail validation, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_missing_api_key() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: None,
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::MissingLinearApiToken)),
        "missing api_key should return MissingLinearApiToken, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_missing_project_slug() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: None,
            ..TrackerConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::MissingLinearProjectSlug)),
        "missing project_slug should return MissingLinearProjectSlug, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_bad_tracker_kind() {
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("github".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::UnsupportedTrackerKind(ref k)) if k == "github"),
        "unsupported tracker kind 'github' should return UnsupportedTrackerKind, got: {:?}",
        result
    );
}

#[test]
fn test_config_validation_missing_codex_command() {
    // Build a fully valid base config so validation reaches the codex.command
    // check.  Previously this test used ServiceConfig::default() which has
    // tracker.kind=None, causing validation to fail on kind before ever
    // reaching the codex.command check.
    let config = ServiceConfig {
        tracker: TrackerConfig {
            kind: Some("linear".to_string()),
            api_key: Some("test-key".into()),
            project_slug: Some("my-project".to_string()),
            ..TrackerConfig::default()
        },
        codex: CodexConfig {
            command: vec![],
            ..CodexConfig::default()
        },
        ..ServiceConfig::default()
    };

    let result = validate(&config);
    assert!(
        matches!(result, Err(SymphonyError::InvalidWorkflowConfig(ref msg)) if msg.contains("codex.command")),
        "empty codex.command should return codex-specific InvalidWorkflowConfig, got: {:?}",
        result
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Liquid group
// ─────────────────────────────────────────────────────────────────────────────

/// Symphony requires strict variable behavior: unknown variables must produce
/// an error rather than render as empty string.
#[test]
fn test_liquid_unknown_variable_error() {
    let parser = liquid::ParserBuilder::with_stdlib()
        .build()
        .expect("liquid parser should build");

    let template = parser
        .parse("{{ unknown_var }}")
        .expect("template string should parse");

    let globals = liquid::object!({});
    let result = template.render(&globals);

    // liquid 0.26 uses strict unknown-variable behavior by default; this test
    // locks in the spec §5.4 (R007) strict-variable rendering contract explicitly.
    assert!(
        result.is_err(),
        "strict mode should error on unknown variables; got Ok: {:?}",
        result.ok()
    );
}

#[test]
fn test_liquid_known_variables_render() {
    let parser = liquid::ParserBuilder::with_stdlib()
        .build()
        .expect("liquid parser should build");

    let template = parser
        .parse("{{ issue_id }}")
        .expect("template string should parse");

    let globals = liquid::object!({ "issue_id": "LIN-1" });
    let output = template.render(&globals).expect("render should succeed");

    assert_eq!(output, "LIN-1");
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowStore group
// ─────────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_workflow_store_initial_load() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: test-key\n  project_slug: my-proj\n---\nHello"
    )
    .unwrap();

    let store = WorkflowStore::new(file.path()).expect("store should initialize from valid file");
    let (def, config) = store.effective_config();

    assert_eq!(config.tracker.kind.as_deref(), Some("linear"));
    assert_eq!(config.tracker.api_key.as_deref(), Some("test-key"));
    assert!(
        def.prompt_template.contains("Hello"),
        "prompt should be loaded, got: {:?}",
        def.prompt_template
    );
}

#[tokio::test]
async fn test_workflow_store_hot_reload() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: key1\n---\nOriginal"
    )
    .unwrap();

    let store = WorkflowStore::new(file.path()).expect("store should initialize");
    let (_, config_before) = store.effective_config();
    assert_eq!(
        config_before.tracker.api_key.as_deref(),
        Some("key1"),
        "initial api_key should be key1"
    );

    // Overwrite with updated content
    {
        let mut f = std::fs::File::create(file.path()).unwrap();
        writeln!(
            f,
            "---\ntracker:\n  kind: linear\n  api_key: key2\n---\nUpdated"
        )
        .unwrap();
    }

    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(3);
    let mut observed = None;
    while tokio::time::Instant::now() < deadline {
        let (_, config_after) = store.effective_config();
        observed = config_after.tracker.api_key.clone();
        if observed.as_deref() == Some("key2") {
            break;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(75)).await;
    }

    assert_eq!(
        observed.as_deref(),
        Some("key2"),
        "hot-reload should update api_key to key2 within timeout"
    );
}

#[tokio::test]
async fn test_workflow_store_reload_failure_keeps_last_good() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: good-key\n---\nGood"
    )
    .unwrap();

    let store = WorkflowStore::new(file.path()).expect("store should initialize");
    let (_, config_before) = store.effective_config();
    assert_eq!(
        config_before.tracker.api_key.as_deref(),
        Some("good-key"),
        "initial api_key should be good-key"
    );

    // Overwrite with deliberately broken YAML
    {
        let mut f = std::fs::File::create(file.path()).unwrap();
        // This is syntactically invalid YAML (bare colon sequence)
        writeln!(f, "---\n: : : broken yaml : : :\n---\nBroken").unwrap();
    }

    // Keep checking for a bounded window to ensure filesystem notifications and
    // debounce processing have a chance to run under slower CI.
    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(3);
    while tokio::time::Instant::now() < deadline {
        let (_, config_after) = store.effective_config();
        assert_eq!(
            config_after.tracker.api_key.as_deref(),
            Some("good-key"),
            "failed reload should preserve last-known-good config; api_key must still be good-key"
        );
        tokio::time::sleep(tokio::time::Duration::from_millis(75)).await;
    }
}

#[tokio::test]
async fn test_workflow_store_force_reload_reports_error_on_invalid_workflow() {
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\ntracker:\n  kind: linear\n  api_key: good-key\n---\nGood"
    )
    .unwrap();

    let store = WorkflowStore::new(file.path()).expect("store should initialize");

    // Overwrite with deliberately broken YAML then force an immediate reload.
    {
        let mut f = std::fs::File::create(file.path()).unwrap();
        writeln!(f, "---\n: : : broken yaml : : :\n---\nBroken").unwrap();
    }

    let reload_result = store.force_reload().await;
    assert!(
        reload_result.is_err(),
        "force_reload should return Err for invalid workflow reloads"
    );

    // Last-known-good semantics must still hold even when force_reload reports failure.
    let (_, config_after) = store.effective_config();
    assert_eq!(
        config_after.tracker.api_key.as_deref(),
        Some("good-key"),
        "failed force_reload should preserve last-known-good config"
    );
}

#[test]
fn test_by_state_concurrency_normalization() {
    // Build WORKFLOW.md with a mix of uppercase, zero-value, spaced, and valid entries.
    let mut file = NamedTempFile::new().unwrap();
    writeln!(
        file,
        "---\nagent:\n  max_concurrent_agents_by_state:\n    InProgress: 2\n    Review: 0\n    in_review: 3\n    In Progress: 4\n---\ntemplate"
    )
    .unwrap();

    let workflow = parse_workflow(file.path()).expect("should parse workflow");
    let config = from_workflow(&workflow.config).expect("should convert workflow to config");

    let by_state = &config.agent.max_concurrent_agents_by_state;

    // Uppercase key must be normalized to lowercase.
    assert_eq!(
        by_state.get("inprogress"),
        Some(&2u32),
        "InProgress key must be normalized to 'inprogress'"
    );
    // Original casing must not appear.
    assert!(
        !by_state.contains_key("InProgress"),
        "original uppercase key 'InProgress' must not survive normalization"
    );

    // Zero-value entry must be filtered out (spec §17.1: ignores invalid values).
    assert!(
        !by_state.contains_key("review"),
        "zero-value entry 'Review: 0' must be filtered (value 0 is invalid)"
    );

    // Valid lowercase entry must survive unchanged.
    assert_eq!(
        by_state.get("in_review"),
        Some(&3u32),
        "valid lowercase entry 'in_review: 3' must be preserved"
    );

    // Spaced key matching a typical Linear state name must be case-folded
    // but preserve the space, since Linear states like "In Progress" have spaces.
    assert_eq!(
        by_state.get("in progress"),
        Some(&4u32),
        "'In Progress: 4' must normalize to 'in progress' (space preserved)"
    );
}
