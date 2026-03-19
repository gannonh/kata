//! Integration tests for workflow parsing, config extraction, and Liquid rendering.
//!
//! These tests define and verify the behavioral contract for slice S02:
//! WORKFLOW.md parsing, typed config extraction, env-var resolution,
//! tilde expansion, and WorkflowStore hot-reload.

use serial_test::serial;
use std::io::Write;
use tempfile::NamedTempFile;

use symphony::config::{from_workflow, validate};
use symphony::domain::{CodexConfig, ServiceConfig, TrackerConfig};
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
    assert_eq!(config.polling.interval_ms, 30_000);
    assert_eq!(config.agent.max_concurrent_agents, 10);
    assert_eq!(config.agent.max_turns, 20);
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
