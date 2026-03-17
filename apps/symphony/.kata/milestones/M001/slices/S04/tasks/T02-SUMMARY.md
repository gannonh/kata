---
id: T02
parent: S04
milestone: M001
provides:
  - prompt_builder module with render_prompt function
  - Issue → liquid::Object serialization (DateTime, Option, Vec<BlockerRef>)
  - Strict mode template rendering (unknown variables → TemplateRenderError)
key_files:
  - src/prompt_builder.rs
key_decisions:
  - Used liquid::to_object (serde serialization) for Issue → Object conversion rather than manual field-by-field mapping
patterns_established:
  - liquid::to_object for struct → Liquid Object via serde (DateTime<Utc> → ISO 8601 string, Option::None → Nil, Vec → Array)
  - liquid-rs is strict by default (unknown variables error without needing explicit strict mode flag)
observability_surfaces:
  - SymphonyError::TemplateParseError(String) for malformed templates
  - SymphonyError::TemplateRenderError(String) for unknown variables and serialization failures
duration: 10m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Implement prompt_builder module

**Implemented render_prompt with serde-based Issue→Liquid serialization, strict variable resolution, and correct handling of DateTime, Option, and Vec<BlockerRef> types.**

## What Happened

Replaced the stub `render_prompt` in `src/prompt_builder.rs` with the full implementation:

1. **Template parsing**: `liquid::ParserBuilder::with_stdlib().build().parse(template)` — parse errors map to `TemplateParseError`.

2. **Issue serialization**: `liquid::to_object(&issue)` converts the `Issue` struct to a `liquid::Object` via serde. This handles all field types correctly:
   - `DateTime<Utc>` → ISO 8601 string (chrono's serde impl produces RFC 3339)
   - `Option<T>::None` → `Value::Nil` (renders as empty string)
   - `Option<T>::Some(v)` → serialized inner value
   - `Vec<BlockerRef>` → `Value::Array` of `Value::Object` (iterable in `{% for %}`)
   - `Vec<String>` → `Value::Array` of scalars (compatible with `| join` filter)
   - `bool` → `Value::Scalar(bool)`

3. **Globals construction**: Manual `Object` with two keys: `"issue"` (the serialized object) and `"attempt"` (`Value::Nil` for None, `Value::scalar(n as i64)` for Some(n)).

4. **Strict rendering**: liquid-rs errors on unknown variables by default (no explicit strict mode flag needed — the runtime's `get()` method returns Err for missing paths). Render errors map to `TemplateRenderError`.

## Verification

- `cargo build` — zero errors, zero warnings ✅
- `cargo test --test workspace_prompt_tests -- test_render_prompt` — all 7/7 prompt tests pass ✅
- `cargo test` — full suite: 111 tests pass, 0 failures ✅

**Slice verification pass status (28/28):**
- Path Safety: 6/6 ✅
- Workspace Manager: 12/12 ✅
- Hook Lifecycle: 3/3 ✅
- Prompt Builder: 7/7 ✅
- Observability check: ✅ (WorkspaceHookFailed contains hook name and exit status)
- Build health: ✅ (zero warnings, all 111 tests pass)

## Diagnostics

- `SymphonyError::TemplateParseError(msg)` — carries the liquid parse error message for malformed templates (e.g., unclosed `{% if %}`)
- `SymphonyError::TemplateRenderError(msg)` — carries the liquid render error message for unknown variables or serialization failures

## Deviations

None — implementation matched the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/prompt_builder.rs` — replaced stub with full render_prompt implementation using liquid::to_object and strict rendering
