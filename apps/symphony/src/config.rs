// Config layer — typed extraction, env resolution, tilde expansion, and validation.
//
// Implements spec §5.3 defaults, $VAR env indirection, ~ home expansion,
// nil-dropping normalization, and field validation.
//
// SECURITY: api_key values must never be emitted via tracing.

use std::collections::HashMap;

use serde::Deserialize;
use serde_yaml::{Mapping, Value};

use crate::domain::{
    AgentConfig, ApiKey, CodexConfig, HooksConfig, PollingConfig, ServerConfig, ServiceConfig,
    TrackerConfig, WorkerConfig, WorkspaceConfig, WorkspaceIsolation, WorkspaceRepoStrategy,
};
use crate::error::{Result, SymphonyError};
use crate::repo_url::repo_is_remote;

// ── Key normalization and null-dropping ───────────────────────────────────────

/// Recursively walk a YAML `Value`:
/// - coerce all mapping keys to `Value::String`
/// - drop mapping entries whose value is `Value::Null`
///
/// Note: only `agent.max_concurrent_agents_by_state` map keys are lowercased
/// (done separately in `from_workflow`).  General key casing is NOT changed.
fn normalize_keys(val: Value) -> Value {
    match val {
        Value::Mapping(map) => {
            let mut new_map = Mapping::new();
            for (k, v) in map {
                if v.is_null() {
                    continue; // drop null entries
                }
                let key_str = key_to_string(k);
                new_map.insert(Value::String(key_str), normalize_keys(v));
            }
            Value::Mapping(new_map)
        }
        Value::Sequence(seq) => Value::Sequence(seq.into_iter().map(normalize_keys).collect()),
        other => other,
    }
}

fn key_to_string(k: Value) -> String {
    match k {
        Value::String(s) => s,
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::Null => "null".to_string(),
        // Sequence/Mapping keys are unusual; log a warning and fall back to
        // debug representation so the entry is preserved rather than silently
        // dropped, but the operator is notified.
        other => {
            tracing::warn!(
                key = ?other,
                "mapping key is not a scalar type — using debug representation; \
                 config sections with complex keys may not be extracted correctly"
            );
            format!("{other:?}")
        }
    }
}

// ── Env-var resolution ────────────────────────────────────────────────────────

/// Returns the bare variable name if `val` is a `$IDENTIFIER` reference
/// (starts with `$`, no `/`, spaces, or `:` — guards against partial paths
/// like `$HOME/x`).  Returns `None` for all other inputs.
fn env_reference_name(val: &str) -> Option<&str> {
    let var_name = val.strip_prefix('$')?;
    let is_bare_identifier = !var_name.is_empty()
        && !var_name.contains('/')
        && !var_name.contains(' ')
        && !var_name.contains(':');
    if is_bare_identifier {
        Some(var_name)
    } else {
        None
    }
}

/// Resolve a `$VAR` reference.
///
/// If `val` starts with `$` and the remainder is a non-empty identifier
/// (no `/`, spaces, or `:` — guards against partial paths like `$HOME/x`),
/// look up the env var.  Return the value if set and non-empty; otherwise
/// return an empty string.  For all other inputs return `val` unchanged.
///
/// Logs a warning when a `$VAR` reference is provided but the env var is not
/// set or is empty, giving operators a clear signal for the root cause of
/// subsequent validation failures.
fn resolve_env(val: &str) -> String {
    if let Some(var_name) = env_reference_name(val) {
        return match std::env::var(var_name) {
            Ok(v) if !v.is_empty() => v,
            Ok(_) => {
                tracing::warn!(
                    var = var_name,
                    "env var referenced in config is set but empty"
                );
                String::new()
            }
            Err(_) => {
                tracing::warn!(var = var_name, "env var referenced in config is not set");
                String::new()
            }
        };
    }
    val.to_string()
}

// ── Tilde expansion ───────────────────────────────────────────────────────────

/// Expand a leading `~` to `$HOME`.
///
/// `"~"` → `$HOME`; `"~/foo"` → `"$HOME/foo"`; anything else is returned
/// unchanged.
fn expand_tilde_with_home(val: &str, home: Option<&str>) -> String {
    if val == "~" || val.starts_with("~/") {
        match home {
            Some(home) if !home.is_empty() => {
                if val == "~" {
                    home.to_string()
                } else {
                    format!("{}{}", home, &val[1..])
                }
            }
            _ => val.to_string(),
        }
    } else {
        val.to_string()
    }
}

fn expand_tilde(val: &str) -> String {
    if val == "~" || val.starts_with("~/") {
        let home = std::env::var("HOME").ok();
        let home_ref = home.as_deref().filter(|h| !h.is_empty());
        if home_ref.is_none() {
            tracing::warn!(
                raw_path = val,
                "HOME is not set or empty; tilde in workspace.root will not be expanded \
                 — workspace path may be relative or invalid"
            );
        }
        expand_tilde_with_home(val, home_ref)
    } else {
        val.to_string()
    }
}

// ── Intermediate serde structs ────────────────────────────────────────────────
//
// All fields are Option<T> so that missing YAML keys produce None (not an
// error), letting callers substitute domain defaults.

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawTrackerConfig {
    kind: Option<String>,
    endpoint: Option<String>,
    api_key: Option<String>,
    project_slug: Option<String>,
    assignee: Option<String>,
    active_states: Option<Vec<String>>,
    terminal_states: Option<Vec<String>>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawPollingConfig {
    interval_ms: Option<u64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawWorkspaceConfig {
    root: Option<String>,
    repo: Option<String>,
    strategy: Option<String>,
    git_strategy: Option<String>,
    isolation: Option<String>,
    branch_prefix: Option<String>,
    clone_branch: Option<String>,
    cleanup_on_done: Option<bool>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawWorkerConfig {
    ssh_hosts: Option<Vec<String>>,
    max_concurrent_agents_per_host: Option<u32>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawAgentConfig {
    max_concurrent_agents: Option<u32>,
    max_turns: Option<u32>,
    max_retry_backoff_ms: Option<u64>,
    max_concurrent_agents_by_state: Option<HashMap<String, u32>>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawCodexConfig {
    /// Accepts a YAML string (`"codex app-server"`) or a list
    /// (`["codex", "app-server"]`).  Deserialized as a raw Value so we can
    /// support both forms in `parse_codex_command`.
    command: Option<Value>,
    approval_policy: Option<Value>,
    thread_sandbox: Option<String>,
    turn_sandbox_policy: Option<Value>,
    turn_timeout_ms: Option<u64>,
    read_timeout_ms: Option<u64>,
    stall_timeout_ms: Option<u64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawHooksConfig {
    after_create: Option<String>,
    before_run: Option<String>,
    after_run: Option<String>,
    before_remove: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawServerConfig {
    port: Option<u16>,
    host: Option<String>,
}

// ── Section extraction helper ─────────────────────────────────────────────────

fn extract_section<T>(normalized: &Value, section: &str) -> Result<T>
where
    T: for<'de> Deserialize<'de> + Default,
{
    let section_val = normalized
        .get(section)
        .cloned()
        .unwrap_or(Value::Mapping(Mapping::new()));

    serde_yaml::from_value(section_val).map_err(|e| {
        SymphonyError::InvalidWorkflowConfig(format!("config section '{section}': {e}"))
    })
}

// ── YAML → JSON conversion ────────────────────────────────────────────────────

/// Convert a `serde_yaml::Value` to `serde_json::Value`.
///
/// Both serde representations share the same serde data model for the subset
/// of types used in config (maps, sequences, strings, numbers, booleans).
/// Returns an error for YAML-only types (tagged values, special floats, etc.)
/// that cannot be represented in JSON.
fn yaml_to_json(val: Value) -> Result<serde_json::Value> {
    serde_yaml::from_value(val).map_err(|e| {
        SymphonyError::InvalidWorkflowConfig(format!(
            "codex policy field could not be converted to JSON: {e}"
        ))
    })
}

// ── codex.command parsing ─────────────────────────────────────────────────────

/// Parse `codex.command` from YAML.
///
/// Accepts either a whitespace-split string (`"codex app-server"`) or an
/// explicit list (`["codex", "app-server"]`).  Returns `InvalidWorkflowConfig`
/// for any other shape.
fn parse_codex_command(val: Value) -> Result<Vec<String>> {
    match val {
        Value::String(s) if s.is_empty() => Ok(vec![]),
        Value::String(s) => Ok(s.split_whitespace().map(|p| p.to_string()).collect()),
        Value::Sequence(seq) => seq
            .into_iter()
            .map(|v| match v {
                Value::String(s) => Ok(s),
                other => Err(SymphonyError::InvalidWorkflowConfig(format!(
                    "codex.command list elements must be strings, got: {other:?}"
                ))),
            })
            .collect(),
        other => Err(SymphonyError::InvalidWorkflowConfig(format!(
            "codex.command must be a string or list of strings, got: {other:?}"
        ))),
    }
}

fn parse_workspace_git_strategy(value: &str) -> Result<WorkspaceRepoStrategy> {
    match value {
        "clone-local" => Ok(WorkspaceRepoStrategy::CloneLocal),
        "clone-remote" => Ok(WorkspaceRepoStrategy::CloneRemote),
        "worktree" => Ok(WorkspaceRepoStrategy::Worktree),
        "auto" => Ok(WorkspaceRepoStrategy::Auto),
        other => Err(SymphonyError::InvalidWorkflowConfig(format!(
            "workspace.git_strategy must be 'clone-local', 'clone-remote', 'worktree', or 'auto' (got '{other}')"
        ))),
    }
}

fn parse_legacy_workspace_strategy(value: &str) -> Result<WorkspaceRepoStrategy> {
    match value {
        "clone" => Ok(WorkspaceRepoStrategy::Auto),
        "worktree" => Ok(WorkspaceRepoStrategy::Worktree),
        other => Err(SymphonyError::InvalidWorkflowConfig(format!(
            "workspace.strategy must be 'clone' or 'worktree' (got '{other}')"
        ))),
    }
}

fn parse_workspace_isolation(value: &str) -> Result<WorkspaceIsolation> {
    match value {
        "local" => Ok(WorkspaceIsolation::Local),
        "docker" => Ok(WorkspaceIsolation::Docker),
        other => Err(SymphonyError::InvalidWorkflowConfig(format!(
            "workspace.isolation must be 'local' or 'docker' (got '{other}')"
        ))),
    }
}

// ── Validated config wrapper ──────────────────────────────────────────────────

/// A [`ServiceConfig`] that has passed [`validate`].
///
/// This newtype enforces at the type level that validation must occur before
/// dispatch.  The orchestrator's dispatch function should accept
/// `ValidatedServiceConfig`, making it impossible to accidentally dispatch
/// with an unvalidated config.
#[derive(Debug)]
pub struct ValidatedServiceConfig(ServiceConfig);

impl ValidatedServiceConfig {
    /// Borrow the underlying config.
    pub fn inner(&self) -> &ServiceConfig {
        &self.0
    }
    /// Consume and return the underlying config.
    pub fn into_inner(self) -> ServiceConfig {
        self.0
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Derive a typed [`ServiceConfig`] from a raw YAML front-matter map.
///
/// Applies spec §5.3 defaults, resolves `$ENV_VAR` references in string
/// fields, expands leading `~` in path fields, drops null entries, and
/// normalises map keys to strings.
///
/// # Errors
/// Returns [`SymphonyError::InvalidWorkflowConfig`] if a YAML section cannot
/// be deserialized into its target struct, or if a codex policy field cannot
/// be converted to JSON.
pub fn from_workflow(config: &Value) -> Result<ServiceConfig> {
    let normalized = normalize_keys(config.clone());

    // ── Deserialize each config section ──────────────────────────────────
    let raw_tracker: RawTrackerConfig = extract_section(&normalized, "tracker")?;
    let raw_polling: RawPollingConfig = extract_section(&normalized, "polling")?;
    let raw_workspace: RawWorkspaceConfig = extract_section(&normalized, "workspace")?;
    let raw_worker: RawWorkerConfig = extract_section(&normalized, "worker")?;
    let raw_agent: RawAgentConfig = extract_section(&normalized, "agent")?;
    let raw_codex: RawCodexConfig = extract_section(&normalized, "codex")?;
    let raw_hooks: RawHooksConfig = extract_section(&normalized, "hooks")?;
    let raw_server: RawServerConfig = extract_section(&normalized, "server")?;

    let defaults = ServiceConfig::default();

    // ── TrackerConfig ─────────────────────────────────────────────────────
    // Resolve $VAR references in api_key; on empty result try LINEAR_API_KEY
    // as canonical fallback (spec §5.3.1 note).
    // NOTE: api_key is intentionally never passed to any tracing call.
    let api_key: Option<ApiKey> = raw_tracker
        .api_key
        .map(|v| {
            let explicit_env_ref = env_reference_name(&v).is_some();
            let resolved = resolve_env(&v);
            if explicit_env_ref && resolved.is_empty() {
                // Try canonical fallback only when an explicit $VAR reference was
                // provided but resolved to nothing.
                std::env::var("LINEAR_API_KEY").unwrap_or_default()
            } else {
                resolved
            }
        })
        .filter(|v| !v.is_empty()) // treat empty string as absent
        .map(ApiKey::new);

    let assignee = raw_tracker
        .assignee
        .map(|v| resolve_env(&v))
        .filter(|v| !v.is_empty());

    let project_slug = raw_tracker
        .project_slug
        .map(|v| resolve_env(&v))
        .filter(|v| !v.is_empty());

    let tracker = TrackerConfig {
        kind: raw_tracker.kind,
        endpoint: raw_tracker
            .endpoint
            .unwrap_or(defaults.tracker.endpoint.clone()),
        api_key,
        project_slug,
        assignee,
        active_states: raw_tracker
            .active_states
            .unwrap_or(defaults.tracker.active_states.clone()),
        terminal_states: raw_tracker
            .terminal_states
            .unwrap_or(defaults.tracker.terminal_states.clone()),
    };

    // ── PollingConfig ─────────────────────────────────────────────────────
    let polling = PollingConfig {
        interval_ms: raw_polling
            .interval_ms
            .unwrap_or(defaults.polling.interval_ms),
    };

    // ── WorkspaceConfig ───────────────────────────────────────────────────
    let raw_root = raw_workspace
        .root
        .unwrap_or_else(|| defaults.workspace.root.clone());
    let git_strategy = raw_workspace
        .git_strategy
        .map(|value| resolve_env(&value))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let legacy_strategy = raw_workspace
        .strategy
        .map(|value| resolve_env(&value))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let strategy = if let Some(value) = git_strategy.as_deref() {
        if legacy_strategy.is_some() {
            tracing::warn!(
                "workspace.strategy is deprecated and ignored because workspace.git_strategy is set"
            );
        }
        parse_workspace_git_strategy(value)?
    } else if let Some(value) = legacy_strategy.as_deref() {
        tracing::warn!("workspace.strategy is deprecated; use workspace.git_strategy");
        parse_legacy_workspace_strategy(value)?
    } else {
        WorkspaceRepoStrategy::Auto
    };
    let isolation = raw_workspace
        .isolation
        .map(|value| resolve_env(&value))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .as_deref()
        .map(parse_workspace_isolation)
        .transpose()?
        .unwrap_or(WorkspaceIsolation::Local);
    if isolation == WorkspaceIsolation::Docker {
        tracing::warn!(
            "workspace.isolation is set to 'docker', but docker isolation is not yet implemented"
        );
    }
    let repo = raw_workspace.repo.and_then(|value| {
        let resolved = resolve_env(&value);
        let trimmed = resolved.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(expand_tilde(trimmed))
        }
    });
    let branch_prefix = raw_workspace
        .branch_prefix
        .map(|value| resolve_env(&value))
        .unwrap_or_else(|| defaults.workspace.branch_prefix.clone());
    let clone_branch = raw_workspace
        .clone_branch
        .map(|value| resolve_env(&value))
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
    let workspace = WorkspaceConfig {
        root: expand_tilde(&raw_root),
        repo,
        strategy,
        isolation,
        branch_prefix: branch_prefix.trim().to_string(),
        clone_branch,
        cleanup_on_done: raw_workspace
            .cleanup_on_done
            .unwrap_or(defaults.workspace.cleanup_on_done),
    };

    // ── WorkerConfig ──────────────────────────────────────────────────────
    let worker = WorkerConfig {
        ssh_hosts: raw_worker.ssh_hosts.unwrap_or_default(),
        max_concurrent_agents_per_host: raw_worker.max_concurrent_agents_per_host,
    };

    // ── AgentConfig ───────────────────────────────────────────────────────
    // Normalize max_concurrent_agents_by_state map keys to lowercase and filter
    // out invalid (zero) entries per spec §17.1 ("ignores invalid values").
    // Negative values are already rejected by the `u32` type at deserialization time.
    let by_state: HashMap<String, u32> = raw_agent
        .max_concurrent_agents_by_state
        .unwrap_or_default()
        .into_iter()
        .filter(|(_, v)| *v > 0)
        .map(|(k, v)| (k.to_lowercase(), v))
        .collect();

    let agent = AgentConfig {
        max_concurrent_agents: raw_agent
            .max_concurrent_agents
            .unwrap_or(defaults.agent.max_concurrent_agents),
        max_turns: raw_agent.max_turns.unwrap_or(defaults.agent.max_turns),
        max_retry_backoff_ms: raw_agent
            .max_retry_backoff_ms
            .unwrap_or(defaults.agent.max_retry_backoff_ms),
        max_concurrent_agents_by_state: by_state,
    };

    // ── CodexConfig ───────────────────────────────────────────────────────
    // approval_policy: propagate conversion errors rather than silently
    // substituting null, which could bypass configured safety constraints.
    let approval_policy = match raw_codex.approval_policy {
        Some(v) => yaml_to_json(v)?,
        None => defaults.codex.approval_policy.clone(),
    };

    // turn_sandbox_policy: also propagate errors (Option<Result> → Result<Option>).
    let turn_sandbox_policy: Option<serde_json::Value> = raw_codex
        .turn_sandbox_policy
        .map(yaml_to_json)
        .transpose()?;

    let command = match raw_codex.command {
        Some(val) => parse_codex_command(val)?,
        None => defaults.codex.command.clone(),
    };

    let codex = CodexConfig {
        command,
        approval_policy,
        thread_sandbox: raw_codex
            .thread_sandbox
            .unwrap_or(defaults.codex.thread_sandbox.clone()),
        turn_sandbox_policy,
        turn_timeout_ms: raw_codex
            .turn_timeout_ms
            .unwrap_or(defaults.codex.turn_timeout_ms),
        read_timeout_ms: raw_codex
            .read_timeout_ms
            .unwrap_or(defaults.codex.read_timeout_ms),
        stall_timeout_ms: raw_codex
            .stall_timeout_ms
            .unwrap_or(defaults.codex.stall_timeout_ms),
    };

    // ── HooksConfig ───────────────────────────────────────────────────────
    let hooks = HooksConfig {
        after_create: raw_hooks.after_create,
        before_run: raw_hooks.before_run,
        after_run: raw_hooks.after_run,
        before_remove: raw_hooks.before_remove,
        timeout_ms: raw_hooks.timeout_ms.unwrap_or(defaults.hooks.timeout_ms),
    };

    // ── ServerConfig ──────────────────────────────────────────────────────
    let server = ServerConfig {
        port: raw_server.port,
        host: raw_server.host.unwrap_or(defaults.server.host.clone()),
    };

    Ok(ServiceConfig {
        tracker,
        polling,
        workspace,
        worker,
        agent,
        codex,
        hooks,
        server,
    })
}

/// Validate a [`ServiceConfig`] for required fields and acceptable values.
///
/// Checks spec §6.3 requirements:
/// - `tracker.kind` must be `"linear"`
/// - `tracker.api_key` must be present and non-empty
/// - `tracker.project_slug` must be present and non-empty
/// - `codex.command` must be non-empty
///
/// On success returns a [`ValidatedServiceConfig`] — a newtype wrapper that
/// signals at the type level that validation has occurred.  The orchestrator's
/// dispatch function should accept `ValidatedServiceConfig` to prevent
/// dispatching with an unvalidated config (see D017).
///
/// The api_key value is never included in failure messages.
pub fn validate(config: &ServiceConfig) -> Result<ValidatedServiceConfig> {
    // tracker.kind must be "linear"
    match config.tracker.kind.as_deref() {
        Some("linear") => {}
        Some(other) => {
            return Err(SymphonyError::UnsupportedTrackerKind(other.to_string()));
        }
        None => {
            return Err(SymphonyError::MissingTrackerKind);
        }
    }

    // tracker.api_key must be present and non-empty
    match config.tracker.api_key.as_deref() {
        Some(k) if !k.is_empty() => {}
        _ => {
            return Err(SymphonyError::MissingLinearApiToken);
        }
    }

    // tracker.project_slug must be present and non-empty
    match config.tracker.project_slug.as_deref() {
        Some(slug) if !slug.is_empty() => {}
        _ => {
            return Err(SymphonyError::MissingLinearProjectSlug);
        }
    }

    // codex.command must be non-empty
    if config.codex.command.is_empty() {
        return Err(SymphonyError::InvalidWorkflowConfig(
            "codex.command is required".to_string(),
        ));
    }

    // workspace.branch_prefix must be present and non-empty
    if config.workspace.branch_prefix.trim().is_empty() {
        return Err(SymphonyError::InvalidWorkflowConfig(
            "workspace.branch_prefix must be non-empty".to_string(),
        ));
    }

    // workspace.strategy=worktree requires a local workspace.repo path
    if config.workspace.strategy == WorkspaceRepoStrategy::Worktree {
        let repo = config.workspace.repo.as_deref().ok_or_else(|| {
            SymphonyError::InvalidWorkflowConfig(
                "workspace.repo is required when workspace.strategy is 'worktree'".to_string(),
            )
        })?;
        if repo_is_remote(repo) {
            return Err(SymphonyError::InvalidWorkflowConfig(
                "workspace.strategy 'worktree' requires workspace.repo to be a local path"
                    .to_string(),
            ));
        }
    }

    if config.workspace.strategy == WorkspaceRepoStrategy::CloneLocal {
        let repo = config.workspace.repo.as_deref().ok_or_else(|| {
            SymphonyError::InvalidWorkflowConfig(
                "workspace.repo is required when workspace.git_strategy is 'clone-local'"
                    .to_string(),
            )
        })?;
        if repo_is_remote(repo) {
            return Err(SymphonyError::InvalidWorkflowConfig(
                "workspace.git_strategy 'clone-local' requires workspace.repo to be a local path"
                    .to_string(),
            ));
        }
    }

    Ok(ValidatedServiceConfig(config.clone()))
}
// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_drops_nulls() {
        let yaml_str = "key: ~\nother: value";
        let val: Value = serde_yaml::from_str(yaml_str).unwrap();
        let normalized = normalize_keys(val);
        assert!(
            normalized.get("key").is_none(),
            "null entry should be dropped"
        );
        assert!(normalized.get("other").is_some());
    }

    #[test]
    fn normalize_coerces_keys() {
        // Numeric map keys in YAML
        let yaml_str = "1: one\n2: two";
        let val: Value = serde_yaml::from_str(yaml_str).unwrap();
        let normalized = normalize_keys(val);
        assert!(
            normalized.get("1").is_some(),
            "numeric key should be coerced to string"
        );
    }

    #[test]
    fn resolve_env_returns_raw_for_non_dollar() {
        assert_eq!(resolve_env("literal"), "literal");
    }

    #[test]
    fn resolve_env_returns_empty_for_unset_var() {
        // Use an env var name that is extremely unlikely to be set.
        let result = resolve_env("$SYMPHONY_TEST_UNSET_XYZZY_12345");
        assert_eq!(result, "");
    }

    #[test]
    fn expand_tilde_home() {
        assert_eq!(
            expand_tilde_with_home("~/foo", Some("/Users/tester")),
            "/Users/tester/foo"
        );
        assert_eq!(
            expand_tilde_with_home("~", Some("/Users/tester")),
            "/Users/tester"
        );
    }

    #[test]
    fn expand_tilde_no_op() {
        assert_eq!(expand_tilde("/abs/path"), "/abs/path");
        assert_eq!(expand_tilde("relative"), "relative");
    }

    #[test]
    fn expand_tilde_home_unset_keeps_input() {
        assert_eq!(expand_tilde_with_home("~", None), "~");
        assert_eq!(expand_tilde_with_home("~/foo", None), "~/foo");
        assert_eq!(expand_tilde_with_home("~/foo", Some("")), "~/foo");
    }

    #[test]
    fn parse_codex_command_string() {
        let val = Value::String("codex app-server".to_string());
        let cmd = parse_codex_command(val).unwrap();
        assert_eq!(cmd, vec!["codex", "app-server"]);
    }

    #[test]
    fn parse_codex_command_list() {
        let val: Value = serde_yaml::from_str("- codex\n- app-server").unwrap();
        let cmd = parse_codex_command(val).unwrap();
        assert_eq!(cmd, vec!["codex", "app-server"]);
    }

    #[test]
    fn parse_codex_command_empty_string() {
        let val = Value::String(String::new());
        let cmd = parse_codex_command(val).unwrap();
        assert!(cmd.is_empty());
    }

    #[test]
    fn api_key_debug_is_redacted() {
        let key = ApiKey::new("super-secret-key");
        assert_eq!(format!("{:?}", key), "[REDACTED]");
    }

    #[test]
    fn api_key_deref_gives_str() {
        let key = ApiKey::new("my-key");
        assert_eq!(&*key, "my-key");
        assert_eq!(key.as_str(), "my-key");
    }
}
