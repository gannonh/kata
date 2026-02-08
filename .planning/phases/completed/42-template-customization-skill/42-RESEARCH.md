# Phase 42: Template Customization Skill - Research

**Researched:** 2026-02-08
**Domain:** Claude Code skill creation, template management UI, Bash script tooling
**Confidence:** HIGH

## Summary

Phase 42 creates a new `/kata-customize-template` skill that gives users a self-service interface for listing available templates, copying defaults to project override locations, editing overrides, and validating them against schemas. The skill operates on 5 schema-backed templates resolved via `resolve-template.sh` and does not spawn subagents.

The codebase already contains all the infrastructure this skill needs: `resolve-template.sh` (Phase 40) for template path resolution, `check-template-drift.sh` (Phase 41) for validation logic, the `kata-template-schema` comment format (Phase 38) embedded in each template, and the sibling discovery pattern for locating templates across installation layouts.

The skill is a single SKILL.md file with a companion Bash script for listing templates and extracting schema metadata. No references/ directory is needed because the skill doesn't spawn subagents. It follows the `kata-configure-settings` pattern: read current state, present options via AskUserQuestion, execute user's choice, display confirmation.

**Primary recommendation:** Build a single SKILL.md orchestrator with one helper script (`list-templates.sh`) that discovers all schema-backed templates, extracts descriptions and schema info, and outputs structured data for the skill to present. Copy, edit, and validate operations use existing scripts (`resolve-template.sh`, `check-template-drift.sh`).

## Standard Stack

No external libraries. This phase creates one new skill directory and one helper script.

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Bash | 3.2+ (macOS default) | Script runtime | Already used by all Kata scripts |
| Node.js (inline) | 20+ | JSON output and schema parsing | Same pattern as read-pref.sh, check-template-drift.sh |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Helper script for listing | Inline discovery in SKILL.md | Script is reusable for Phase 43 documentation and keeps SKILL.md focused on orchestration. |
| Single script for all operations | Separate scripts per operation | Single script with subcommands is simpler. Copy/validate are small enough to inline in SKILL.md or delegate to existing scripts. |

## Architecture Patterns

### Skill Structure

```
skills/kata-customize-template/
├── SKILL.md           # Orchestrator (no subagents)
└── scripts/
    └── list-templates.sh  # Template discovery and metadata extraction
```

No `references/` directory needed. This skill operates inline without spawning subagents.

### Template Inventory (Schema-Backed)

These 5 templates have `kata-template-schema` comments and are resolvable via `resolve-template.sh`. They are the only templates eligible for project override:

| Template | Owning Skill | Controls | Required Fields (Frontmatter) | Required Fields (Body) |
| --- | --- | --- | --- | --- |
| summary-template.md | kata-execute-phase | Phase completion documentation format | phase, plan, subsystem, tags, duration, completed | Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made |
| plan-template.md | kata-plan-phase | Phase plan structure | phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves | objective, execution_context, context, tasks, verification, success_criteria, output |
| UAT-template.md | kata-verify-work | User acceptance testing session format | status, phase, source, started, updated | Current Test, Tests, Summary, Gaps |
| verification-report.md | kata-verify-work | Automated verification report format | phase, verified, status, score | Goal Achievement, Observable Truths, Required Artifacts, Key Link Verification, Requirements Coverage |
| changelog-entry.md | kata-complete-milestone | Changelog entry format for milestone releases | (none) | Added, Fixed, Changed |

### Templates Without Schema (Not Overridable)

These templates are referenced via `@` in skill files and do NOT have `kata-template-schema` comments. They are excluded from the customization skill:

| Template | Owning Skill | Reason Not Overridable |
| --- | --- | --- |
| requirements-template.md | kata-new-project, kata-add-milestone | Used via @-reference, not resolve-template.sh |
| project-template.md | kata-new-project, kata-add-milestone | Used via @-reference, not resolve-template.sh |
| context-template.md | kata-discuss-phase | Used via @-reference, not resolve-template.sh |
| milestone-archive-template.md | kata-complete-milestone | Used via @-reference, not resolve-template.sh |

### Skill Workflow (UI-01 through UI-05)

**Step 1: Validate environment**
Check `.planning/` exists (project initialized).

**Step 2: Determine operation**
Parse `$ARGUMENTS` for subcommand or present AskUserQuestion:
- **list** -- List available templates with descriptions (UI-02)
- **copy <template>** -- Copy default to override location (UI-03)
- **edit <template>** -- Open override for editing (UI-04)
- **validate** -- Validate all overrides against schemas (UI-05)

**Step 3: Execute operation**

#### List Operation (UI-02)

Run `list-templates.sh` to discover all schema-backed templates. Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata > CUSTOMIZABLE TEMPLATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Template | Controls | Override Status |
| --- | --- | --- |
| summary-template.md | Phase completion docs | [active override / default] |
| plan-template.md | Phase plan structure | [active override / default] |
| ... | ... | ... |

Override location: .planning/templates/
```

#### Copy Operation (UI-03)

1. Resolve template via `resolve-template.sh` to get the default path
2. Create `.planning/templates/` if not exists
3. Copy default to `.planning/templates/{template-name}`
4. Display confirmation with path

```bash
RESOLVE_SCRIPT="${SKILL_BASE_DIR}/../kata-execute-phase/scripts/resolve-template.sh"
DEFAULT_PATH=$(bash "$RESOLVE_SCRIPT" "$TEMPLATE_NAME")
mkdir -p .planning/templates
cp "$DEFAULT_PATH" ".planning/templates/$TEMPLATE_NAME"
```

If override already exists, confirm overwrite via AskUserQuestion.

#### Edit Operation (UI-04)

1. Check if override exists at `.planning/templates/{template-name}`. If not, offer to copy first.
2. Tell user to edit `.planning/templates/{template-name}`
3. After user confirms edit is done, run validation (UI-05)

Since Claude Code skills cannot open an external editor, "edit" means: read the current override content, present it to the user, accept modifications via conversation, write the updated content. Alternatively, display the file path and instruct the user to edit it, then validate after.

#### Validate Operation (UI-05)

Run `check-template-drift.sh` to validate all overrides:

```bash
bash "${SKILL_BASE_DIR}/../kata-doctor/scripts/check-template-drift.sh"
```

Capture output. If warnings, display them. If clean, display success.

For single-template validation after an edit, parse the specific template against its schema. The `check-template-drift.sh` already does this for all overrides. A targeted validation could reuse the same Node.js logic from that script.

### Helper Script: list-templates.sh

Discovers all schema-backed templates and outputs structured information.

**Location:** `skills/kata-customize-template/scripts/list-templates.sh`

**Logic:**
1. Use sibling discovery pattern: navigate from `scripts/` two levels up to `skills/`
2. Glob `skills/kata-*/references/*.md` and filter for files containing `kata-template-schema`
3. For each matching file, extract: filename, owning skill, description (first line after heading), required/optional fields from schema
4. Check `.planning/templates/{filename}` for override status
5. Output structured text (or JSON via inline Node.js)

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
// Discover templates with kata-template-schema
// Output: JSON array of template metadata
NODE_EOF
```

### Existing Scripts Reused

| Script | Location | Used For |
| --- | --- | --- |
| resolve-template.sh | kata-execute-phase/scripts/ | Resolve template path (copy operation) |
| check-template-drift.sh | kata-doctor/scripts/ | Validate overrides (validate operation) |

### SKILL.md YAML Frontmatter

```yaml
---
name: kata-customize-template
description: Manage template overrides for customizing Kata output formats. List available templates, copy defaults for local editing, edit overrides, validate template schemas. Triggers include "customize template", "override template", "edit template", "template overrides", "list templates", "show templates", "template customization", "manage templates".
metadata:
  version: "1.9.0"
---
```

### Skill Naming and Trigger Analysis

The name `kata-customize-template` uses a verb (customize) consistent with the naming pattern. The description must include exhaustive triggers per KATA-STYLE.md:
- "customize template", "override template", "edit template"
- "template overrides", "list templates", "show templates"
- "template customization", "manage templates"
- "what templates can I customize", "template schema"

### Build System Impact

New skill directory `skills/kata-customize-template/` is automatically picked up by `scripts/build.js` since it copies the entire `skills/` directory. No build changes needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Template path resolution | Custom path logic | resolve-template.sh | Proven across all installation layouts |
| Override validation | Custom schema parser | check-template-drift.sh | Already parses kata-template-schema and checks fields |
| Template discovery | Hardcoded list | Filesystem glob + schema comment detection | Automatically picks up new templates added in future |
| Schema extraction | Manual field lists | Parse kata-template-schema comments | Source of truth is the comment in each template file |

## Common Pitfalls

### Pitfall 1: Hardcoding template list instead of discovering from filesystem

**What goes wrong:** A hardcoded list of 5 templates becomes stale when templates are added or removed.
**Why it happens:** Easier to write a static list than glob + parse.
**How to avoid:** Use sibling discovery to find all files with `kata-template-schema` comments. The list is dynamic and self-maintaining.
**Warning signs:** New template added but doesn't appear in `/kata-customize-template list`.

### Pitfall 2: Copy operation doesn't check for existing override

**What goes wrong:** User's existing customizations get overwritten silently.
**Why it happens:** `cp` overwrites by default.
**How to avoid:** Check if `.planning/templates/{name}` exists before copying. If it does, use AskUserQuestion to confirm overwrite. Show diff between current override and default.
**Warning signs:** User complains customizations disappeared.

### Pitfall 3: Edit operation tries to open an external editor

**What goes wrong:** Claude Code skills cannot invoke `$EDITOR` or open GUI editors. The skill hangs or errors.
**Why it happens:** Assuming the skill can launch interactive processes.
**How to avoid:** Two approaches: (A) Display the file content and let the user describe changes, then write the modified version. (B) Tell the user the file path and instruct them to edit it externally, then validate when they return. Approach B is simpler and keeps the skill focused.
**Warning signs:** Skill blocks trying to spawn an editor process.

### Pitfall 4: Validation after copy shows drift on the copy itself

**What goes wrong:** User copies a default, runs validate, and the default fails validation because the template content (with placeholders like `[Description]`) doesn't contain actual field values.
**Why it happens:** The schema checks for field presence (headings, frontmatter keys). The default template contains them as placeholder patterns within a code block, not as actual document structure.
**How to avoid:** Understand that the default templates contain the schema-required fields as markdown headings inside a code fence. The override file should contain the actual template structure (headings, frontmatter keys) outside code fences. After copying, the user needs to customize the content for their project. Validation checks the override's actual structure, not content within code fences. The existing `check-template-drift.sh` already handles this correctly by checking headings and frontmatter patterns.
**Warning signs:** Freshly copied override fails validation.

### Pitfall 5: Skill grows too large by inlining everything

**What goes wrong:** SKILL.md exceeds the 500-line limit.
**Why it happens:** Including detailed validation logic, template descriptions, and schema parsing inline.
**How to avoid:** Keep orchestration in SKILL.md, delegate discovery/metadata to `list-templates.sh`, delegate validation to `check-template-drift.sh`. The SKILL.md should be 200-300 lines of pure orchestration.
**Warning signs:** SKILL.md line count approaching 500.

## Code Examples

### list-templates.sh

```bash
#!/usr/bin/env bash
# Usage: list-templates.sh
# Discovers all schema-backed templates and outputs metadata as JSON
# Exit: 0 always
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

const skillsDir = process.env.SKILLS_DIR;
const templates = [];

try {
  const skillDirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));

  for (const skillDir of skillDirs) {
    const refsDir = path.join(skillsDir, skillDir, 'references');
    if (!fs.existsSync(refsDir)) continue;

    const files = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(refsDir, file), 'utf8');
      const schemaMatch = content.match(/<!--\s*kata-template-schema\n([\s\S]*?)-->/);
      if (!schemaMatch) continue;

      const schema = schemaMatch[1];
      const required = { frontmatter: [], body: [] };
      const optional = { frontmatter: [], body: [] };

      const reqFm = schema.match(/required-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
      if (reqFm) required.frontmatter = reqFm[1].split(',').map(f => f.trim()).filter(Boolean);

      const reqBody = schema.match(/required-fields:[\s\S]*?body:\s*\[([^\]]*)\]/);
      if (reqBody) required.body = reqBody[1].split(',').map(f => f.trim()).filter(Boolean);

      const optFm = schema.match(/optional-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
      if (optFm) optional.frontmatter = optFm[1].split(',').map(f => f.trim()).filter(Boolean);

      const optBody = schema.match(/optional-fields:[\s\S]*?body:\s*\[([^\]]*)\]/);
      if (optBody) optional.body = optBody[1].split(',').map(f => f.trim()).filter(Boolean);

      // Extract description from first heading content
      const descMatch = content.match(/^#\s+(.+)/m);
      const description = descMatch ? descMatch[1] : file;

      // Check override status
      const overridePath = path.join('.planning', 'templates', file);
      const hasOverride = fs.existsSync(overridePath);

      templates.push({
        filename: file,
        skill: skillDir,
        description,
        hasOverride,
        required,
        optional
      });
    }
  }
} catch (e) {
  // Silent fail
}

console.log(JSON.stringify(templates, null, 2));
NODE_EOF

exit 0
```

### SKILL.md structure outline

```markdown
---
name: kata-customize-template
description: [exhaustive triggers]
---

<objective>
Manage template overrides for customizing Kata output formats.
</objective>

<context>
$ARGUMENTS
</context>

<process>
## 1. Validate Environment
## 2. Parse Operation
## 3. List Templates (if list)
## 4. Copy Template (if copy)
## 5. Edit Template (if edit)
## 6. Validate Overrides (if validate)
</process>

<success_criteria>
- [ ] Templates listed with descriptions and override status
- [ ] Default copied to .planning/templates/ with overwrite protection
- [ ] Validation runs after edit and reports missing fields
- [ ] All operations use existing infrastructure (resolve-template.sh, check-template-drift.sh)
</success_criteria>
```

### Verification commands

```bash
# Test 1: list-templates.sh discovers all 5 schema-backed templates
bash skills/kata-customize-template/scripts/list-templates.sh | node -e "
  const t = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('Found:', t.length, 'templates');
  console.log('Names:', t.map(x => x.filename).join(', '));
  process.exit(t.length === 5 ? 0 : 1);
"
# Expected: Found: 5 templates

# Test 2: Copy operation creates override
mkdir -p .planning/templates
RESOLVE_SCRIPT="skills/kata-execute-phase/scripts/resolve-template.sh"
DEFAULT=$(bash "$RESOLVE_SCRIPT" "summary-template.md")
cp "$DEFAULT" .planning/templates/summary-template.md
[ -f .planning/templates/summary-template.md ] && echo "OK" || echo "FAIL"
rm .planning/templates/summary-template.md

# Test 3: Validate operation runs without errors
bash skills/kata-doctor/scripts/check-template-drift.sh; echo "exit: $?"
# Expected: exit 0 (no overrides present)

# Test 4: Script works from all installation layouts
bash skills/kata-customize-template/scripts/list-templates.sh > /dev/null && echo "source: OK"
bash dist/plugin/skills/kata-customize-template/scripts/list-templates.sh > /dev/null && echo "plugin: OK"
bash dist/skills-sh/skills/kata-customize-template/scripts/list-templates.sh > /dev/null && echo "skills-sh: OK"

# Test 5: No CLAUDE_PLUGIN_ROOT references
grep -r "CLAUDE_PLUGIN_ROOT" skills/kata-customize-template/ && echo "FAIL" || echo "OK"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| No user interface for template management | /kata-customize-template skill | Phase 42 | Users can discover, copy, edit, and validate templates |
| Manual file copying for overrides | Guided copy with overwrite protection | Phase 42 | Prevents accidental data loss |
| Drift detection as background check only | On-demand validation via skill | Phase 42 | Users can validate proactively |

## Open Questions

1. **Should the edit operation present content inline or instruct the user to edit externally?**
   - What we know: Claude Code skills can read and write files. The user could describe changes conversationally. Alternatively, display the path and let the user edit in their editor.
   - Recommendation: Support both. If the user provides specific changes ("change the heading format to..."), apply them. If the user says "let me edit it", display the file path and offer to validate when they return. Default to showing the current content and asking what to change.

2. **Should the skill update kata-help reference to include itself?**
   - What we know: kata-help/SKILL.md contains a complete skill reference. New skills should be documented there.
   - Recommendation: Yes, add a brief entry for `/kata-customize-template` in the Configuration section of kata-help. This is a small addition and belongs in the same plan.

3. **Should non-schema templates be listed with a "not customizable" note?**
   - What we know: 4 templates lack schema comments (requirements-template.md, project-template.md, context-template.md, milestone-archive-template.md).
   - Recommendation: No. The list should only show actionable items. Mentioning non-customizable templates adds noise. Phase 43 (Documentation) can explain which templates are customizable and why.

## Sources

### Primary (HIGH confidence)
- Kata source code: `resolve-template.sh` (Phase 40), `check-template-drift.sh` (Phase 41), all 5 schema-backed template files
- Kata source code: `kata-configure-settings/SKILL.md` (pattern for settings-style skills)
- Kata source code: `kata-doctor/SKILL.md` (pattern for health-check-style skills)
- Phase 38/40/41 SUMMARY.md files (documented decisions and patterns)
- KATA-STYLE.md (naming conventions, skill structure, trigger phrase requirements)

### Secondary (MEDIUM confidence)
- Claude Code skill documentation (SKILL.md frontmatter, SKILL_BASE_DIR variable, tool restrictions)
- Existing skill patterns across 30+ skills in the codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, reuses existing Bash + inline Node.js patterns
- Architecture: HIGH - all infrastructure exists from Phases 38/40/41; skill follows established patterns
- Pitfalls: HIGH - all identified pitfalls have mitigation strategies based on existing codebase patterns

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable; template infrastructure and skill patterns unlikely to change)
