# Phase 38: Template Overrides — Research

## Standard Stack

No external libraries. This phase operates entirely within Kata's own codebase:
- Bash scripts (`read-pref.sh` pattern from Phase 37)
- Node.js for session-start hook (existing pattern in `hooks/kata-setup-statusline.js`)
- Markdown with HTML comments for schema annotations
- `hooks.json` for hook registration (existing pattern)

## The Five Templates

The brainstorm identified five extractable templates. Research confirms all five exist inline today and maps their exact locations.

### 1. summary-template.md

**Current location:** Already a standalone file at `skills/kata-execute-phase/references/summary-template.md` (270 lines).

**Referenced by:**
- `skills/kata-execute-phase/references/execute-plan.md` line 1361: `Use @./summary-template.md for structure.`
- `skills/kata-execute-phase/references/phase-execute.md` line 248: `@./summary-template.md`

**Required fields:** phase, plan, subsystem, tags, requires, provides, affects, tech-stack, key-files, key-decisions, duration, completed. Plus body sections: Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made, Deviations from Plan, Issues Encountered, User Setup Required, Next Phase Readiness.

**Customization target:** Projects add/remove body sections (e.g., "Deployment Notes", "Security Review"). Frontmatter fields are structural and should remain fixed.

**Status:** Already standalone. Needs schema comment added. Needs resolution logic wired into skills that reference it.

### 2. changelog-entry.md

**Current location:** Inline in `skills/kata-complete-milestone/references/changelog-generator.md` (309 lines). The changelog format, commit type mapping, and generation functions are all embedded in this single reference file.

**Referenced by:**
- `skills/kata-complete-milestone/SKILL.md` line 19 (via milestone-complete.md)
- `skills/kata-complete-milestone/references/milestone-complete.md` lines 13, 42, 645

**Required fields:** version, date, sections (Added, Changed, Deprecated, Removed, Fixed, Security). The `<format>` section (lines 15-41) defines the template structure. The `<commit_type_mapping>` section defines how commits map to sections.

**Customization target:** Changelog format preference. Users may want conventional-changelog format, custom groupings, or different section ordering. The `release.changelog_format` preference key already exists in `read-pref.sh` defaults.

**Extraction approach:** Extract the `<format>` and `<commit_type_mapping>` sections into a standalone `changelog-entry.md` template. Keep the bash functions (`get_commits_by_type`, `generate_changelog_entry`, `insert_changelog_entry`) in the generator reference since those are implementation, not template.

### 3. plan-template.md

**Current location:** Inline in `skills/kata-plan-phase/references/planner-instructions.md` lines 375-440 (inside `<plan_format>` section).

**Referenced by:**
- `skills/kata-plan-phase/references/planner-instructions.md` (self-contained)
- The planner subagent reads this when creating PLAN.md files

**Required fields:** Frontmatter: phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves (truths, artifacts, key_links). Body: objective, execution_context, context, tasks, verification, success_criteria, output.

**Customization target:** Custom frontmatter fields, additional plan sections, different task structure. Low customization demand in practice since plans are prompts and structure is tightly coupled to executor expectations.

**Extraction approach:** Extract the PLAN.md structure (lines 379-440) into standalone `plan-template.md`. Leave the surrounding guidance (frontmatter field table, context section rules, user setup frontmatter) in planner-instructions since those are planning rules, not template content.

### 4. uat-template.md

**Current location:** Already a standalone file at `skills/kata-verify-work/references/UAT-template.md` (248 lines).

**Referenced by:**
- `skills/kata-verify-work/SKILL.md` line 17: `@./references/UAT-template.md`
- `skills/kata-verify-work/references/verify-work.md` line 18: `@./UAT-template.md`

**Required fields:** Frontmatter: status, phase, source, started, updated. Sections: Current Test, Tests (with expected/result per test), Summary (total/passed/issues/pending/skipped), Gaps (YAML format with truth/status/reason/severity/test/root_cause/artifacts/missing/debug_session).

**Customization target:** Test report format, result categories, additional metadata fields. Projects might want extra severity levels or custom gap fields.

**Status:** Already standalone. Needs schema comment added. Needs resolution logic wired in.

### 5. verification-report.md

**Current location:** Inline in `skills/kata-verify-work/references/verifier-instructions.md` lines 529-615 (inside `<output>` section).

**Referenced by:**
- `skills/kata-verify-work/references/verifier-instructions.md` (self-contained)
- The verifier subagent creates VERIFICATION.md using this structure

**Required fields:** Frontmatter: phase, verified, status, score, gaps (conditional), human_verification (conditional), re_verification (conditional). Body: Goal Achievement, Observable Truths table, Required Artifacts table, Key Link Verification table, Requirements Coverage table, Anti-Patterns Found table, Human Verification Required, Gaps Summary.

**Customization target:** Verification output format. Projects might want different table structures, additional check categories, or custom scoring.

**Extraction approach:** Extract the VERIFICATION.md template (lines 535-615) into standalone `verification-report.md`. Leave the surrounding verification process, stub detection patterns, and critical rules in verifier-instructions.

## Architecture Patterns

### Template Resolution Pattern

Use a bash function following the `read-pref.sh` resolution chain pattern from Phase 37. The function checks `.planning/templates/{name}.md` first, falls back to the plugin default.

**Resolution function (new file: `resolve-template.sh`):**

```bash
#!/usr/bin/env bash
# Usage: resolve-template.sh <template-name>
# Returns: absolute path to the resolved template file
# Resolution: .planning/templates/{name}.md -> plugin default
set -euo pipefail

TEMPLATE_NAME="${1:?Usage: resolve-template.sh <template-name>}"

# Check project override first
PROJECT_TEMPLATE=".planning/templates/${TEMPLATE_NAME}"
if [ -f "$PROJECT_TEMPLATE" ]; then
  echo "$PROJECT_TEMPLATE"
  exit 0
fi

# Fall back to plugin default
# Plugin root from environment, or discover from script location
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
PLUGIN_TEMPLATE="${PLUGIN_ROOT}/skills/kata-*/references/${TEMPLATE_NAME}"

# Glob expansion - find first match
for f in $PLUGIN_TEMPLATE; do
  if [ -f "$f" ]; then
    echo "$f"
    exit 0
  fi
done

echo "ERROR: Template not found: ${TEMPLATE_NAME}" >&2
exit 1
```

**Key design decisions:**
- File-based resolution, not content-based. The function returns a path, and the consuming skill reads it.
- Same pattern as `read-pref.sh`: project first, plugin default second. Consistent with Phase 37's resolution chain concept.
- Template names are the filename itself (e.g., `summary-template.md`, not a logical name mapped to a file). Keeps it simple.

### Template Location Within Plugin

Templates stay in their owning skill's `references/` directory. They are NOT centralized into a shared `templates/` directory within the plugin. Rationale:
- Skills are self-contained. Moving templates to a central location breaks the "skill = orchestrator + references" pattern.
- `@`-references in skills already point to `./references/`. No path changes needed.
- The resolution function knows to glob across `skills/kata-*/references/` when looking for defaults.

### Schema Comment Format

Use HTML comments at the top of each template file. HTML comments are invisible to Claude's rendering but parseable by the drift detection hook.

```markdown
<!-- kata-template-schema
required-fields:
  frontmatter: [phase, plan, subsystem, tags, duration, completed]
  body: [Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made]
optional-fields:
  frontmatter: [requires, provides, affects, tech-stack, key-files, key-decisions, patterns-established]
  body: [Deviations from Plan, Issues Encountered, User Setup Required, Next Phase Readiness]
version: 1
-->
```

**Format rules:**
- Block starts with `<!-- kata-template-schema` and ends with `-->`
- YAML-like syntax inside the comment (readable, parseable)
- `required-fields` lists fields that trigger drift warnings if missing from project overrides
- `optional-fields` are documented but don't trigger warnings
- `version` enables future schema evolution (warn on version mismatch)

### Session-Start Hook for Drift Detection

Add a new hook to `hooks.json` alongside the existing `kata-setup-statusline.js`. The hook runs on SessionStart, scans `.planning/templates/` for project overrides, and compares each against the plugin default's schema comment.

**Hook behavior:**
1. Check if `.planning/templates/` exists. If not, exit silently (no overrides, no drift).
2. For each file in `.planning/templates/`:
   a. Find the corresponding plugin default (glob `skills/kata-*/references/{filename}`)
   b. Parse the schema comment from the plugin default
   c. Parse the project override for required fields
   d. Compare: any required fields missing from project override?
3. If missing fields found: emit warning to stdout (Claude sees this in session context)
4. Warning format: `"[kata] Template drift: {name}.md missing required field(s): {fields}. Default template has been updated."`
5. Never block. Never modify project files. Warn only.

**Implementation model:** Node.js script reading stdin JSON (same pattern as `kata-setup-statusline.js`). Parse schema comments with regex, scan for field names in project template content.

**Hook registration in `hooks.json`:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-setup-statusline.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-template-drift.js" }
        ]
      }
    ]
  }
}
```

## Don't Hand-Roll

- **Template parsing**: Use regex to extract schema comments. Do not build a YAML parser. The schema comment format is intentionally simple enough for regex.
- **File discovery**: Use `find` and `ls` to locate templates. Do not build an index or manifest. The number of templates (5) is small enough for direct filesystem queries.
- **Resolution caching**: Do not cache resolved template paths. Resolution happens once per skill invocation. The filesystem check is fast enough.

## Common Pitfalls

### 1. Breaking existing @-references

Skills currently use `@./references/summary-template.md` to reference templates. Extraction must preserve these paths. Templates stay in their skill's `references/` directory.

**Verification:** After extraction, grep for all `@.*template` references and confirm each still resolves.

### 2. Schema comment format inconsistency

If each template uses a different schema comment format, the drift detection hook becomes complex.

**Mitigation:** Define one format. Use it for all five templates. The hook parses one format.

### 3. Missing `.planning/templates/` directory

Projects without overrides have no `.planning/templates/` directory. The resolution function must handle this gracefully (fall through to default without error).

### 4. Template names that collide across skills

Two skills might have templates with the same filename but different content. Current candidates: `project-template.md` exists in both `kata-new-project` and `kata-add-milestone` (and they're identical). `requirements-template.md` also exists in both (also identical).

**Mitigation for Phase 38:** The five extractable templates have unique names. Project overrides use the same filename. No collision within the five. The duplicate `project-template.md` and `requirements-template.md` across skills are not part of the five extractable templates and don't need override support in this phase.

### 5. Hook stdout contamination

Session-start hooks that write to stdout inject content into Claude's context. Verbose or error output from the drift detection hook would waste context.

**Mitigation:** Emit at most one line per drifted template. Emit nothing if no drift detected. Use `try/catch` around everything. Silent failure on errors (same pattern as `kata-setup-statusline.js`).

### 6. Skill subagents can't access project templates directly

Subagents spawned via Task tool get fresh context. They don't inherit environment variables or working directory context from the orchestrator. The orchestrator must resolve the template path and either inline the template content or pass the path to the subagent.

**Mitigation:** The orchestrator skill (e.g., `kata-execute-phase`) resolves the template path BEFORE spawning the subagent. It reads the template content and inlines it into the subagent prompt alongside other references. This matches the existing pattern: orchestrators already inline `@./references/` content at spawn time.

## Code Examples

### resolve-template.sh usage in a skill

```bash
# In kata-execute-phase SKILL.md or phase-execute.md:
SUMMARY_TEMPLATE_PATH=$(bash "${CLAUDE_PLUGIN_ROOT}/skills/kata-execute-phase/scripts/resolve-template.sh" "summary-template.md")
SUMMARY_TEMPLATE=$(cat "$SUMMARY_TEMPLATE_PATH")

# Inline into subagent prompt
# ... "Summary template:\n${SUMMARY_TEMPLATE}" ...
```

### Schema comment parsing in drift detection hook

```javascript
function parseSchemaComment(content) {
  const match = content.match(/<!--\s*kata-template-schema\n([\s\S]*?)-->/);
  if (!match) return null;

  const schema = match[1];
  const required = [];

  // Extract required frontmatter fields
  const fmMatch = schema.match(/frontmatter:\s*\[([^\]]*)\]/);
  if (fmMatch) {
    required.push(...fmMatch[1].split(',').map(f => f.trim()));
  }

  // Extract required body sections
  const bodyMatch = schema.match(/body:\s*\[([^\]]*)\]/);
  if (bodyMatch) {
    required.push(...bodyMatch[1].split(',').map(f => f.trim()));
  }

  return { required };
}
```

### Template override in a project

```
.planning/templates/summary-template.md
```

User adds custom sections (e.g., "Deployment Notes") while keeping all required fields. The drift detection hook confirms required fields are present.

## Existing Patterns to Follow

### Phase 37 resolution chain

`read-pref.sh` resolves values through: `preferences.json -> config.json -> built-in defaults`. Template resolution follows the same two-step chain: `.planning/templates/{name}.md -> plugin default`.

### hooks.json registration

Existing pattern in `hooks/hooks.json`: array of hook entries under `SessionStart`. Add the new drift detection hook as a second entry in the same array.

### Silent failure pattern

Both `kata-setup-statusline.js` and `kata-plugin-statusline.js` wrap all logic in `try/catch` with empty catch blocks. The drift detection hook follows this pattern.

### Build system inclusion

`scripts/build.js` includes `skills` and `hooks` directories in the plugin build. New files in these directories are automatically included. No build config changes needed for template files that stay in `skills/*/references/`. The new hook script in `hooks/` is also automatically included.

## Scope Assessment

| Work Item | Complexity | Files Affected |
|---|---|---|
| Extract 2 templates (changelog-entry, verification-report, plan-template) into standalone files | Low | 3 new files, 3 reference files updated |
| Add schema comments to all 5 templates | Low | 5 files modified |
| Create resolve-template.sh script | Low | 1 new file |
| Wire resolution into skills (execute-phase, complete-milestone, verify-work, plan-phase) | Medium | 4-5 files modified |
| Create kata-template-drift.js hook | Medium | 1 new file |
| Register hook in hooks.json | Low | 1 file modified |

Total: ~7-8 new files, ~10 files modified. Fits in 2-3 plans.

## Open Questions (Resolved)

**Q: Should templates have a centralized directory in the plugin?**
A: No. Templates stay in their owning skill's `references/` directory. This preserves skill self-containment.

**Q: Should the resolution function be Node.js or Bash?**
A: Bash. It's a path lookup, not data processing. Skills already use bash for file operations. Matches `read-pref.sh` pattern.

**Q: What happens if a project template has EXTRA fields not in the schema?**
A: Nothing. The hook only warns on MISSING required fields. Extra fields are fine. This follows the "warn, don't block" principle from the brainstorm.
