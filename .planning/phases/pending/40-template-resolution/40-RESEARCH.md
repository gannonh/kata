# Phase 40: Template Resolution - Research

**Researched:** 2026-02-08
**Domain:** Bash script path resolution, Claude Code plugin/skill installation layouts
**Confidence:** HIGH

## Summary

Phase 40 rewrites `resolve-template.sh` to eliminate dependence on `CLAUDE_PLUGIN_ROOT` and absolute path traversal (`../../..`). The current script fails for skills-only installations (via `npx skills add` or manual copy to `.claude/skills/`) where `CLAUDE_PLUGIN_ROOT` is not set and the directory tree above `skills/` has no predictable structure.

The fix uses relative sibling discovery: from the script's own location (`skills/kata-execute-phase/scripts/`), navigate to the parent `skills/` directory, then glob across `kata-*/references/` to find templates. All Kata skills are siblings under the same `skills/` directory regardless of installation method.

Four skills reference `resolve-template.sh` via `${SKILL_BASE_DIR}/../kata-execute-phase/scripts/resolve-template.sh`. These callers require no changes because `SKILL_BASE_DIR` already resolves correctly in all installation contexts.

**Primary recommendation:** Rewrite the plugin-default fallback in `resolve-template.sh` to use `$(dirname "$0")/../..` (reaches `skills/` from `scripts/`) then glob `kata-*/references/`, removing all dependence on `CLAUDE_PLUGIN_ROOT`.

## Standard Stack

No external libraries. This phase modifies one existing Bash script and its error output.

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Bash | 3.2+ (macOS default) | Script runtime | Already used by all Kata scripts |
| find/glob | POSIX | Directory discovery | Already used in find-phase.sh |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Bash glob | Node.js script | Overkill for path lookup; read-pref.sh already uses Node but for JSON parsing. resolve-template.sh is pure filesystem. |
| Sibling discovery | Manifest file listing templates | Over-engineering; only 5 templates, filesystem glob is sufficient |

## Architecture Patterns

### Current resolve-template.sh (What's Wrong)

```bash
# Line 21: Depends on CLAUDE_PLUGIN_ROOT or ../../.. from script location
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"

# Line 24: Globs from plugin root
for f in "${PLUGIN_ROOT}"/skills/kata-*/references/${TEMPLATE_NAME}; do
```

**Problem 1:** `CLAUDE_PLUGIN_ROOT` is only set for plugin installations. Skills installed via `npx skills add` (copied/symlinked to `.claude/skills/`) or manually placed do not have this variable.

**Problem 2:** The `../../..` fallback traverses from `skills/kata-execute-phase/scripts/` up three levels. For plugin installs this reaches the plugin root (which has a `skills/` child). For skills-only installs, three levels up from `.claude/skills/kata-execute-phase/scripts/` reaches `.claude/`, which does NOT have a `skills/` child at `../.claude/skills/` path constructed as `${PLUGIN_ROOT}/skills/`. The constructed glob path would be `.claude/skills/kata-*/references/` which might accidentally work, but the semantics are wrong and fragile.

**Problem 3:** The error message on line 31 says "Template not found" but doesn't list search paths, making debugging difficult.

### Recommended Pattern: Sibling Discovery

```
Script location:    skills/kata-execute-phase/scripts/resolve-template.sh
../..  from script: skills/
Glob target:        skills/kata-*/references/${TEMPLATE_NAME}
```

The key insight: all Kata skills are siblings under a single `skills/` directory. The script can always find its sibling skills by navigating two levels up from its own location (`scripts/ -> kata-execute-phase/ -> skills/`). This works for:

| Installation Method | Script Location | `../../` resolves to |
| --- | --- | --- |
| Plugin (`/plugin install kata`) | `{plugin_root}/skills/kata-execute-phase/scripts/` | `{plugin_root}/skills/` |
| skills.sh (`npx skills add`) | `.claude/skills/kata-execute-phase/scripts/` | `.claude/skills/` |
| Manual copy | `{any}/skills/kata-execute-phase/scripts/` | `{any}/skills/` |
| Dev (source repo) | `skills/kata-execute-phase/scripts/` | `skills/` |

### Caller Inventory (No Changes Needed)

Four skills call `resolve-template.sh`. All use the pattern:
```bash
RESOLVE_SCRIPT="${SKILL_BASE_DIR}/../kata-execute-phase/scripts/resolve-template.sh"
```

| Skill | File | Template(s) Resolved |
| --- | --- | --- |
| kata-execute-phase | references/phase-execute.md | summary-template.md |
| kata-plan-phase | SKILL.md (line 356) | plan-template.md |
| kata-verify-work | references/verify-work.md | UAT-template.md, verification-report.md |
| kata-complete-milestone | references/milestone-complete.md | changelog-entry.md |

`SKILL_BASE_DIR` is documented in Claude Code as pointing to the skill's own directory (e.g., `skills/kata-plan-phase/`). The `..` navigates to the `skills/` parent, then into `kata-execute-phase/scripts/`. This path is valid in all installation layouts because all skills are siblings. No caller changes needed.

### Template Inventory

Templates live in their owning skill's `references/` directory:

| Template | Owning Skill | Path |
| --- | --- | --- |
| summary-template.md | kata-execute-phase | skills/kata-execute-phase/references/ |
| plan-template.md | kata-plan-phase | skills/kata-plan-phase/references/ |
| UAT-template.md | kata-verify-work | skills/kata-verify-work/references/ |
| verification-report.md | kata-verify-work | skills/kata-verify-work/references/ |
| changelog-entry.md | kata-complete-milestone | skills/kata-complete-milestone/references/ |

### Error Message Pattern

Current error (line 31):
```
ERROR: Template not found: ${TEMPLATE_NAME}
```

Improved error should list search paths:
```
ERROR: Template not found: ${TEMPLATE_NAME}
  Searched:
    .planning/templates/${TEMPLATE_NAME} (project override)
    skills/kata-*/references/${TEMPLATE_NAME} (sibling skills)
```

This satisfies TMPL-03: clear error messages naming the template and search paths.

### Drift Detection Hook (kata-template-drift.js)

The drift detection hook at `hooks/kata-template-drift.js` (line 80) also discovers templates using `CLAUDE_PLUGIN_ROOT`:
```javascript
const skillsDir = path.join(pluginRoot, 'skills');
```

Phase 41 migrates this hook into skills, so Phase 40 does NOT need to fix the hook. The hook is plugin-only infrastructure that Phase 41 replaces. Phase 40 focuses solely on `resolve-template.sh`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Finding sibling directories | Custom search/index | Bash glob `kata-*/references/` | 5 templates across ~30 skills. Glob is instant. |
| Template path caching | Path cache between invocations | Direct filesystem lookup each time | Called once per skill invocation. Sub-millisecond. |
| Installation detection | Logic to detect plugin vs skills-only | Sibling discovery that works everywhere | The whole point is eliminating installation-specific logic |

## Common Pitfalls

### Pitfall 1: Symlink resolution breaking dirname

**What goes wrong:** `npx skills add` can install via symlink. If `resolve-template.sh` is accessed through a symlink, `$(dirname "$0")` returns the symlink's directory, not the target's directory.
**Why it happens:** Bash `$0` resolves to the invocation path, not the physical path.
**How to avoid:** Use `$(cd "$(dirname "$0")" && pwd -P)` to resolve symlinks. The `-P` flag on `pwd` resolves the physical path. Alternatively, use `readlink -f "$0"` on Linux or fall back to the `cd && pwd -P` approach for macOS compatibility (macOS `readlink` doesn't support `-f` without coreutils).
**Warning signs:** Tests pass in dev but fail in skills.sh installations.

### Pitfall 2: Glob expansion with no matches

**What goes wrong:** If the `skills/kata-*/references/${TEMPLATE_NAME}` glob matches nothing, Bash returns the literal glob string instead of an empty list (when `nullglob` is not set).
**Why it happens:** Default Bash behavior without `shopt -s nullglob`.
**How to avoid:** The existing script already handles this correctly by checking `[ -f "$f" ]` inside the loop. The literal glob string won't pass the `-f` test. Keep this pattern.

### Pitfall 3: Changing the project-override check path

**What goes wrong:** The `.planning/templates/${TEMPLATE_NAME}` check (lines 11-15) uses a relative path. If the script is called from a directory other than the project root, it fails.
**Why it happens:** Bash scripts inherit the caller's working directory.
**How to avoid:** This is the existing behavior and hasn't caused issues because Claude Code skills always execute from the project root. Don't change this. The relative `.planning/templates/` path is correct.

### Pitfall 4: macOS readlink compatibility

**What goes wrong:** `readlink -f` does not work on macOS without GNU coreutils.
**Why it happens:** macOS ships BSD readlink which lacks the `-f` flag.
**How to avoid:** Use the `cd "$(dirname "$0")" && pwd -P` pattern instead of `readlink -f`. This works on both macOS and Linux.

## Code Examples

### Rewritten resolve-template.sh

```bash
#!/usr/bin/env bash
# Usage: resolve-template.sh <template-name>
# Returns: absolute path to the resolved template file (stdout)
# Resolution: .planning/templates/{name}.md -> sibling skill references
# Exit: 0=found, 1=not found
set -euo pipefail

TEMPLATE_NAME="${1:?Usage: resolve-template.sh <template-name>}"

# Check project override first
PROJECT_TEMPLATE=".planning/templates/${TEMPLATE_NAME}"
if [ -f "$PROJECT_TEMPLATE" ]; then
  echo "$(pwd)/${PROJECT_TEMPLATE}"
  exit 0
fi

# Fall back to sibling skill discovery
# Script is at skills/kata-execute-phase/scripts/resolve-template.sh
# Two levels up (scripts/ -> kata-execute-phase/ -> skills/) reaches the skills directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

for f in "${SKILLS_DIR}"/kata-*/references/${TEMPLATE_NAME}; do
  if [ -f "$f" ]; then
    echo "$f"
    exit 0
  fi
done

# Template not found - provide actionable error
echo "ERROR: Template not found: ${TEMPLATE_NAME}" >&2
echo "  Searched:" >&2
echo "    $(pwd)/.planning/templates/${TEMPLATE_NAME} (project override)" >&2
echo "    ${SKILLS_DIR}/kata-*/references/${TEMPLATE_NAME} (sibling skills)" >&2
exit 1
```

### Verification commands

```bash
# Test 1: Resolve from source repo (dev)
bash skills/kata-execute-phase/scripts/resolve-template.sh summary-template.md
# Expected: absolute path to skills/kata-execute-phase/references/summary-template.md

# Test 2: Resolve from plugin dist
bash dist/plugin/skills/kata-execute-phase/scripts/resolve-template.sh summary-template.md
# Expected: absolute path to dist/plugin/skills/kata-execute-phase/references/summary-template.md

# Test 3: Resolve from skills-sh dist
bash dist/skills-sh/skills/kata-execute-phase/scripts/resolve-template.sh summary-template.md
# Expected: absolute path to dist/skills-sh/skills/kata-execute-phase/references/summary-template.md

# Test 4: Project override takes precedence
mkdir -p .planning/templates
echo "override content" > .planning/templates/summary-template.md
bash skills/kata-execute-phase/scripts/resolve-template.sh summary-template.md
# Expected: absolute path to .planning/templates/summary-template.md
rm .planning/templates/summary-template.md

# Test 5: Missing template produces clear error
bash skills/kata-execute-phase/scripts/resolve-template.sh nonexistent.md 2>&1; echo "exit: $?"
# Expected: error message listing search paths, exit code 1

# Test 6: All five templates resolve
for t in summary-template.md plan-template.md UAT-template.md verification-report.md changelog-entry.md; do
  bash skills/kata-execute-phase/scripts/resolve-template.sh "$t" || echo "FAIL: $t"
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| `CLAUDE_PLUGIN_ROOT` + absolute path | Sibling discovery via `dirname` | Phase 40 (this phase) | Works for all installation methods |
| `../../..` from script to plugin root | `../..` from script to skills dir | Phase 40 (this phase) | Shorter, more intuitive path traversal |

## Open Questions

1. **Should `CLAUDE_PLUGIN_ROOT` be kept as an optional fast path?**
   - What we know: The sibling discovery approach works universally. `CLAUDE_PLUGIN_ROOT` adds no value when sibling discovery is the primary mechanism, since the glob path is the same either way.
   - Recommendation: Remove `CLAUDE_PLUGIN_ROOT` usage entirely. One code path is simpler to test and maintain. The sibling discovery works in plugin contexts too.

2. **Should the script location move out of kata-execute-phase?**
   - What we know: `resolve-template.sh` is a shared utility called by 4 skills, but lives in `kata-execute-phase/scripts/`. Other shared scripts (`read-pref.sh`, `has-pref.sh`) live in `kata-configure-settings/scripts/`.
   - Recommendation: Keep it where it is for Phase 40. Moving would require updating 4 caller paths. That's a refactor, not a resolution fix, and can be done separately if desired.

## Sources

### Primary (HIGH confidence)
- Claude Code official docs (https://code.claude.com/docs/en/skills) - skill installation locations, `CLAUDE_PLUGIN_ROOT` variable, skill directory structure
- Kata source code - `resolve-template.sh`, all 4 callers, drift detection hook, build system
- Phase 38 research and implementation - original design context

### Secondary (MEDIUM confidence)
- skills.sh / Vercel skills installer (https://github.com/vercel-labs/skills) - installation to `.claude/skills/` via symlink or copy
- Claude Code plugin-dev docs via Context7 (`/anthropics/claude-code`) - `CLAUDE_PLUGIN_ROOT` behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no libraries, pure bash filesystem operations
- Architecture: HIGH - sibling relationship is structural fact, verified across all installation layouts
- Pitfalls: HIGH - tested dirname/symlink behavior on macOS, verified glob expansion semantics

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable; Bash semantics and Kata directory layout unlikely to change)
