// Workflow loader — parses WORKFLOW.md files into WorkflowDefinition.

use crate::domain::WorkflowDefinition;
use crate::error::{Result, SymphonyError};
use std::path::Path;

/// Parse a WORKFLOW.md file into a [`WorkflowDefinition`].
///
/// The file may optionally contain YAML front matter delimited by `---` lines.
/// Parsing rules:
///
/// - **Happy path**: lines between first and second `---` are YAML front
///   matter; everything after the second `---` is the prompt body (trimmed).
/// - **No delimiters**: fewer than two `---` lines → entire content becomes
///   the prompt template; config is an empty mapping.
/// - **Empty YAML**: front-matter block is empty or all-whitespace → config
///   is an empty mapping; no error.
/// - **Non-map YAML**: front-matter parses to a non-mapping value (e.g. a
///   sequence or scalar) → [`SymphonyError::WorkflowFrontMatterNotAMap`].
///
/// # Errors
/// - [`SymphonyError::WorkflowParseError`] — IO failure or YAML syntax error.
/// - [`SymphonyError::WorkflowFrontMatterNotAMap`] — front matter is valid
///   YAML but is not a mapping.
pub fn parse_workflow(path: &Path) -> Result<WorkflowDefinition> {
    // ── 1. Read file ──────────────────────────────────────────────────────
    let content = std::fs::read_to_string(path).map_err(|e| {
        SymphonyError::WorkflowParseError(format!("failed to read {}: {e}", path.display()))
    })?;

    // ── 2. Locate `---` delimiter lines ───────────────────────────────────
    let lines: Vec<&str> = content.lines().collect();
    let delimiter_indices: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| line.trim_end() == "---")
        .map(|(i, _)| i)
        .collect();

    if delimiter_indices.len() < 2 || delimiter_indices[0] != 0 {
        // No-delimiter case: whole file becomes prompt with empty config.
        return Ok(WorkflowDefinition {
            config: serde_yaml::Value::Mapping(Default::default()),
            prompt_template: content.trim().to_string(),
        });
    }

    let first = delimiter_indices[0];
    let second = delimiter_indices[1];

    // ── 3. Split front matter and prompt body ─────────────────────────────
    let front_matter_str = lines[first + 1..second].join("\n");
    let prompt_body = lines[second + 1..].join("\n").trim().to_string();

    // ── 4. Parse YAML front matter ────────────────────────────────────────
    let parsed_value = if front_matter_str.trim().is_empty() {
        // Empty YAML block → default empty mapping, no error.
        serde_yaml::Value::Mapping(Default::default())
    } else {
        serde_yaml::from_str::<serde_yaml::Value>(&front_matter_str).map_err(|e| {
            SymphonyError::WorkflowParseError(format!(
                "YAML parse error in {}: {e}",
                path.display()
            ))
        })?
    };

    // ── 5. Validate that front matter is a mapping ────────────────────────
    if !matches!(parsed_value, serde_yaml::Value::Mapping(_)) {
        return Err(SymphonyError::WorkflowFrontMatterNotAMap);
    }

    Ok(WorkflowDefinition {
        config: parsed_value,
        prompt_template: prompt_body,
    })
}
