//! Prompt builder — renders Liquid templates with issue data.
//!
//! Converts `Issue` fields into Liquid-compatible objects using serde
//! serialization, then renders the template in strict mode (unknown
//! variables produce errors).

use crate::domain::{Issue, PromptsConfig};
use crate::error::{Result, SymphonyError};
use std::path::Path;

/// Render a Liquid template with `issue`, `attempt`, and `workspace` variables.
///
/// - `template`: Liquid template string (Liquid markup)
/// - `issue`: Issue data to bind as `issue.*` variables
/// - `attempt`: Optional attempt number, bound as `attempt`
/// - `workspace_base_branch`: Optional base branch, bound as `workspace.base_branch`
///
/// Uses strict mode — unknown variables produce `TemplateRenderError`.
/// DateTime fields render as ISO 8601 strings. `None` fields render as
/// empty string. `Vec<BlockerRef>` is iterable via `{% for %}`.
pub fn render_prompt(
    template: &str,
    issue: &Issue,
    attempt: Option<u32>,
    workspace_base_branch: Option<&str>,
) -> Result<String> {
    render_prompt_with_shared_context(template, issue, attempt, workspace_base_branch, "")
}

/// Render a Liquid template with optional shared context preamble content.
pub fn render_prompt_with_shared_context(
    template: &str,
    issue: &Issue,
    attempt: Option<u32>,
    workspace_base_branch: Option<&str>,
    shared_context: &str,
) -> Result<String> {
    // 1. Parse the template
    let parser = liquid::ParserBuilder::with_stdlib()
        .build()
        .map_err(|e| SymphonyError::TemplateParseError(e.to_string()))?;

    let compiled = parser
        .parse(template)
        .map_err(|e| SymphonyError::TemplateParseError(e.to_string()))?;

    // 2. Convert Issue to a liquid Object via serde serialization.
    //    DateTime<Utc> → ISO 8601 string, Option::None → Nil, Vec → Array.
    let issue_obj = liquid::to_object(issue)
        .map_err(|e| SymphonyError::TemplateRenderError(format!("issue serialization: {e}")))?;

    // 3. Build globals: { "issue": <object>, "attempt": <value>, "workspace": <object> }
    let attempt_val = match attempt {
        None => liquid_core::model::Value::Nil,
        Some(n) => liquid_core::model::Value::scalar(n as i64),
    };
    let base_branch = workspace_base_branch
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("main");
    let mut workspace_obj = liquid::Object::new();
    workspace_obj.insert(
        "base_branch".into(),
        liquid_core::model::Value::scalar(base_branch.to_string()),
    );

    let mut globals = liquid::Object::new();
    globals.insert("issue".into(), liquid_core::model::Value::Object(issue_obj));
    globals.insert("attempt".into(), attempt_val);
    globals.insert(
        "workspace".into(),
        liquid_core::model::Value::Object(workspace_obj),
    );
    globals.insert(
        "shared_context".into(),
        liquid_core::model::Value::scalar(shared_context.to_string()),
    );

    // 4. Render (liquid-rs is strict by default — unknown variables error)
    compiled
        .render(&globals)
        .map_err(|e| SymphonyError::TemplateRenderError(e.to_string()))
}

/// Resolve a per-state prompt template by reading prompt files and concatenating
/// shared + state-specific content.
///
/// - `prompts_config`: the parsed `PromptsConfig` from YAML
/// - `issue_state`: the issue's current tracker state (e.g. "In Progress")
/// - `workflow_dir`: directory containing the WORKFLOW.md file (prompt paths
///   are resolved relative to this)
///
/// Returns the concatenated prompt template string, or `None` if the state
/// has no mapping and no default is configured.
/// Read a prompt file, ensuring the resolved path stays within `workflow_dir`.
///
/// Prevents path traversal via absolute paths or `..` escapes in YAML config.
fn read_prompt_file(workflow_dir: &Path, configured_path: &str, label: &str) -> Result<String> {
    let base = workflow_dir.canonicalize().map_err(|e| {
        SymphonyError::TemplateParseError(format!(
            "failed to resolve workflow dir {}: {e}",
            workflow_dir.display()
        ))
    })?;
    let candidate = base.join(configured_path);
    let canonical = candidate.canonicalize().map_err(|e| {
        SymphonyError::TemplateParseError(format!(
            "failed to read {label} prompt {}: {e}",
            candidate.display()
        ))
    })?;
    if !canonical.starts_with(&base) {
        return Err(SymphonyError::TemplateParseError(format!(
            "{label} prompt path escapes workflow dir: {configured_path}",
        )));
    }
    std::fs::read_to_string(&canonical).map_err(|e| {
        SymphonyError::TemplateParseError(format!(
            "failed to read {label} prompt {}: {e}",
            canonical.display()
        ))
    })
}

pub fn resolve_per_state_prompt(
    prompts_config: &PromptsConfig,
    issue_state: &str,
    workflow_dir: &Path,
) -> Result<Option<String>> {
    let normalized_state = issue_state.trim().to_ascii_lowercase();

    // Find the state-specific prompt path
    let state_path = prompts_config
        .by_state
        .get(&normalized_state)
        .or(prompts_config.default.as_ref());

    let Some(state_path) = state_path else {
        return Ok(None);
    };

    // Read the state-specific prompt file (path-confined to workflow dir)
    let state_content = read_prompt_file(workflow_dir, state_path, "state")?;

    // Read preamble files: system, repo (new), and shared (legacy).
    // All are optional; when present they are prepended in order before the
    // state-specific content, separated by `---`.
    let system_content = prompts_config
        .system
        .as_deref()
        .map(|p| read_prompt_file(workflow_dir, p, "system"))
        .transpose()?;
    let repo_content = prompts_config
        .repo
        .as_deref()
        .map(|p| read_prompt_file(workflow_dir, p, "repo"))
        .transpose()?;
    let shared_content = prompts_config
        .shared
        .as_deref()
        .map(|p| read_prompt_file(workflow_dir, p, "shared"))
        .transpose()?;

    // Concatenate: system + repo + shared (legacy) + state-specific
    let mut parts: Vec<&str> = Vec::new();
    if let Some(ref s) = system_content {
        parts.push(s);
    }
    if let Some(ref r) = repo_content {
        parts.push(r);
    }
    if let Some(ref sh) = shared_content {
        parts.push(sh);
    }
    parts.push(&state_content);
    let template = parts.join("\n\n---\n\n");

    Ok(Some(template))
}

/// Build a concise continuation prompt for turn 2+ in a multi-turn session.
pub fn render_continuation_prompt(turn_number: u32, max_turns: u32) -> String {
    format!(
        "Continuation guidance:\n\n\
- The previous Codex turn completed normally, but the Linear issue is still in an active state.\n\
- This is continuation turn #{turn_number} of {max_turns} for the current agent run.\n\
- Resume from the current workspace and workpad state instead of restarting from scratch.\n\
- The original task instructions and prior turn context are already present in this thread, so do not restate them before acting.\n\
- Focus on the remaining ticket work and do not end the turn while the issue stays active unless you are truly blocked."
    )
}
