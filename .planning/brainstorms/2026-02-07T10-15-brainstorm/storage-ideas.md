# Storage & Schema Proposals for User Workflow Preferences

## Context

Issue #104: Kata workflows embed best-practice defaults for changelog updates, README updates, and release processes. These defaults vary between projects. There is no mechanism for users to declare project-specific preferences that workflows read at decision points.

**Current state:** `.planning/config.json` holds ~12 keys read via `grep` patterns at ~90+ call sites across 15+ skills.

---

## Proposal 1: Extend config.json with a `preferences` namespace

**What:** Add a `preferences` top-level key to the existing `.planning/config.json`. Preferences are nested by domain (release, docs, changelog). Skills read preferences with the same `grep` pattern used today, with fallback to defaults.

**Schema:**
```json
{
  "mode": "yolo",
  "depth": "quick",
  "pr_workflow": true,
  "preferences": {
    "release": {
      "changelog": true,
      "changelog_format": "keep-a-changelog",
      "version_bump": "conventional-commits",
      "version_files": ["package.json"],
      "custom_steps": []
    },
    "docs": {
      "readme_update": "prompt",
      "readme_sections": ["installation", "usage", "api"],
      "auto_update_files": ["README.md"]
    },
    "milestone": {
      "archive_requirements": true,
      "post_release_checklist": true
    }
  }
}
```

**Why:** Lowest migration cost. Skills already know how to read config.json. The `grep` pattern works for nested keys. No new file to manage, no new read pattern to teach skills. Users already know where config lives.

**Scope:** Small. Add namespace to schema, update `kata-configure-settings` to handle new keys, update relevant decision points in ~5 skills.

**Risks:**
- config.json grows large and mixed-concern (operational toggles + user preferences)
- Nested `grep` patterns become fragile with deeper nesting (the current `grep` approach already fails for keys that appear in multiple nesting levels, e.g. `"enabled"` in `github` namespace)
- `grep` pattern ambiguity: a key like `"changelog"` could match at multiple depths
- No distinction between "user set this explicitly" vs "default was written at project init"

---

## Proposal 2: Dedicated preferences.json with domain-based sections

**What:** New file at `.planning/preferences.json` dedicated exclusively to user workflow preferences. Distinct from config.json which holds operational settings (mode, depth, model, workflow toggles). Preferences.json holds "how this project does things" settings.

**Schema:**
```json
{
  "$schema": "kata-preferences-v1",
  "release": {
    "changelog": {
      "enabled": true,
      "format": "keep-a-changelog",
      "sections": ["Added", "Fixed", "Changed"]
    },
    "version": {
      "strategy": "conventional-commits",
      "files": ["package.json", "plugin.json"]
    },
    "steps": [
      "bump_version",
      "generate_changelog",
      "update_readme",
      "create_tag"
    ]
  },
  "docs": {
    "readme": {
      "update_on_milestone": "prompt",
      "maintained_sections": ["Installation", "Usage", "API Reference"]
    },
    "files": {
      "auto_update": ["README.md"],
      "never_touch": ["CONTRIBUTING.md"]
    }
  },
  "conventions": {
    "commit_format": "conventional",
    "branch_prefix": "auto"
  }
}
```

**Why:** Clean separation of concerns. Config.json stays focused on operational toggles (mode, depth, agents). Preferences.json captures project identity and workflow customization. Each file has a clear owner: `kata-configure-settings` owns config.json, a new `kata-configure-preferences` (or progressive capture) owns preferences.json.

**Scope:** Medium. New file, new read pattern (or reuse existing grep), update ~5-8 skills at decision points, update `kata-new-project` to scaffold empty preferences.

**Risks:**
- Two files to manage instead of one
- Skills need to know which file to read for which setting
- Potential confusion between "config" and "preferences" boundaries (e.g., is `pr_workflow` a config or a preference?)
- Still uses grep for reading unless we also change the read pattern

---

## Proposal 3: PREFERENCES.md as prose with structured frontmatter

**What:** A markdown file at `.planning/PREFERENCES.md` that combines YAML frontmatter (machine-readable) with prose sections (human-readable context). Skills read the frontmatter; humans read the prose. This matches Kata's existing pattern of using markdown files as both documentation and structured data (e.g., SUMMARY.md frontmatter).

**Schema:**
```markdown
---
release:
  changelog: true
  changelog_format: keep-a-changelog
  version_files:
    - package.json
    - plugin.json
  readme_on_milestone: prompt
docs:
  auto_update:
    - README.md
  never_touch:
    - CONTRIBUTING.md
  readme_sections:
    - Installation
    - Usage
    - API Reference
conventions:
  commit_format: conventional
---

# Project Preferences

## Release Process

This project uses conventional commits to drive changelogs. Version bumps happen during milestone completion. The changelog follows Keep a Changelog format.

Version is tracked in `package.json` and `plugin.json`.

## Documentation Rules

README.md gets updated at milestone boundaries. CONTRIBUTING.md is externally maintained and should not be modified by Kata workflows.

## Notes

Added during v1.7.0 milestone setup. Updated when we switched to PR workflow.
```

**Why:** Humans can read and understand preferences without parsing JSON. The prose sections provide rationale that survives across sessions. YAML frontmatter is extractable with standard patterns. Matches Kata's existing file conventions (PROJECT.md, STATE.md are all markdown with structured data).

**Scope:** Medium. New file, new read pattern (YAML frontmatter extraction via `grep`/`sed`), update skills.

**Risks:**
- YAML parsing via shell grep is more fragile than JSON grep
- Dual-format (frontmatter + prose) means two things to keep in sync
- Prose sections may drift from frontmatter values
- Skills are optimized for JSON `grep` patterns, not YAML

---

## Proposal 4: Layered defaults with explicit override markers

**What:** Keep config.json but add an explicit `_source` metadata field to each preference. When a user explicitly sets a preference, it gets `"_source": "user"`. Defaults get `"_source": "default"`. Skills can distinguish "user chose this" from "default was applied" and decide whether to prompt.

**Schema:**
```json
{
  "mode": "yolo",
  "preferences": {
    "release.changelog": {
      "value": true,
      "_source": "default"
    },
    "release.changelog_format": {
      "value": "keep-a-changelog",
      "_source": "user"
    },
    "docs.readme_update": {
      "value": "prompt",
      "_source": "default"
    }
  }
}
```

**Why:** Solves the discovery problem directly. Skills can check: "Is there a user-expressed preference for X?" If `_source` is `"default"`, the skill knows to prompt on first encounter (progressive capture). If `"user"`, it reads the value silently. This is the core UX requirement from issue #104.

**Scope:** Medium-large. New nested structure, update read patterns, update all skills that need progressive capture behavior.

**Risks:**
- Verbose schema (every preference is an object instead of a scalar)
- `grep` patterns become more complex
- Metadata tracking adds overhead to every preference read
- Risk of _source getting out of sync if users hand-edit the file

---

## Proposal 5: Convention-over-configuration with project type detection

**What:** Instead of storing granular preferences, detect the project type (npm package, Python library, monorepo, static site, etc.) and apply a preset profile. Store only the profile name and explicit overrides. Most preferences are derived from what the project IS rather than what the user configures.

**Schema:**
```json
{
  "preferences": {
    "profile": "npm-package",
    "overrides": {
      "docs.readme_update": "skip",
      "release.custom_steps": ["npm run build:plugin"]
    }
  }
}
```

Profiles defined in Kata's plugin:
```
kata/profiles/
  npm-package.json    # changelog: true, version_files: [package.json], ...
  python-library.json # changelog: true, version_files: [pyproject.toml, setup.cfg], ...
  monorepo.json       # per-package changelogs, lerna/nx detection
  static-site.json    # no versioning, docs-focused
  generic.json        # minimal defaults
```

**Why:** Users answer one question ("what kind of project is this?") instead of 15 granular preferences. Kata already does codebase analysis during `kata-map-codebase` and `kata-new-project`, so project type detection is partially built. Overrides handle edge cases without bloating the schema.

**Scope:** Medium. Create profile definitions, add detection logic, implement override merge. Fewer skill changes since profiles provide complete preference sets.

**Risks:**
- Projects that don't fit a profile need many overrides (defeating the purpose)
- Profile maintenance burden grows with supported project types
- Detection heuristics can be wrong (false positives)
- Users may want granular control that profiles hide

---

## Proposal 6: Progressive preference capture via decision log

**What:** No upfront preferences file at all. When a skill hits a decision point that has no recorded preference, it prompts the user, records the decision, and never asks again. Decisions accumulate in `.planning/decisions.json` as a flat key-value log with timestamps.

**Schema:**
```json
{
  "$schema": "kata-decisions-v1",
  "decisions": {
    "release.changelog_enabled": {
      "value": true,
      "decided": "2026-02-07T10:30:00Z",
      "context": "First milestone completion (v1.0)"
    },
    "release.changelog_format": {
      "value": "keep-a-changelog",
      "decided": "2026-02-07T10:30:00Z",
      "context": "First milestone completion (v1.0)"
    },
    "docs.readme_on_milestone": {
      "value": "prompt",
      "decided": "2026-02-07T11:00:00Z",
      "context": "v1.0 milestone completion"
    }
  }
}
```

**Lookup pattern for skills:**
```bash
# Check if user has expressed a preference
PREF=$(cat .planning/decisions.json 2>/dev/null | grep -o '"release.changelog_enabled"[^}]*}' | grep -o '"value"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false')
if [ -z "$PREF" ]; then
  # No decision recorded — prompt user and record
  ...
else
  # Decision exists — use it
  CHANGELOG_ENABLED=$PREF
fi
```

**Why:** Zero upfront configuration. Preferences emerge naturally from workflow usage. Context field provides audit trail. Flat key namespace avoids nested grep complexity. Scales gracefully: early projects have few decisions, mature projects accumulate a complete preference profile.

**Scope:** Medium. New file, new "check-then-prompt-then-record" pattern at each decision point, utility function or snippet for skills.

**Risks:**
- No way to see all preferences at a glance until many decisions accumulate
- First-time prompts disrupt workflow flow (user gets asked things mid-execution)
- No bulk configuration (can't set 10 preferences at once during setup)
- Context strings may be inconsistent across skills
- Harder to reset or bulk-edit preferences (no `kata-configure-preferences` equivalent)
