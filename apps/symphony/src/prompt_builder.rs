//! Prompt builder — renders Liquid templates with issue data.
//!
//! Converts `Issue` fields into Liquid-compatible objects using serde
//! serialization, then renders the template in strict mode (unknown
//! variables produce errors).

use crate::domain::Issue;
use crate::error::{Result, SymphonyError};

/// Render a Liquid template with `issue` and `attempt` variables.
///
/// - `template`: Liquid template string (Liquid markup)
/// - `issue`: Issue data to bind as `issue.*` variables
/// - `attempt`: Optional attempt number, bound as `attempt`
///
/// Uses strict mode — unknown variables produce `TemplateRenderError`.
/// DateTime fields render as ISO 8601 strings. `None` fields render as
/// empty string. `Vec<BlockerRef>` is iterable via `{% for %}`.
pub fn render_prompt(template: &str, issue: &Issue, attempt: Option<u32>) -> Result<String> {
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

    // 3. Build globals: { "issue": <object>, "attempt": <value> }
    let attempt_val = match attempt {
        None => liquid_core::model::Value::Nil,
        Some(n) => liquid_core::model::Value::scalar(n as i64),
    };

    let mut globals = liquid::Object::new();
    globals.insert("issue".into(), liquid_core::model::Value::Object(issue_obj));
    globals.insert("attempt".into(), attempt_val);

    // 4. Render (liquid-rs is strict by default — unknown variables error)
    compiled
        .render(&globals)
        .map_err(|e| SymphonyError::TemplateRenderError(e.to_string()))
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
