# Storage & Schema: Final Report

## Recommendation

**Flat-key `preferences.json` with a `node`-based accessor script, shipped with the plugin.**

Preferences stored as dot-notation keys in `.planning/preferences.json`. Skills read preferences through a thin accessor script (`kata/scripts/read-pref.sh`) that centralizes parsing, file resolution, and defaults. The accessor reads from preferences.json first, falls back to config.json (for migrated keys), then falls back to built-in defaults.

---

## Design

### File: `.planning/preferences.json`

Flat dot-notation keys. No nesting. Each key maps directly to a scalar value.

```json
{
  "release.changelog": true,
  "release.changelog_format": "keep-a-changelog",
  "release.version_bump": "conventional-commits",
  "release.version_files_override": ["plugin.json"],
  "docs.readme_on_milestone": "prompt",
  "docs.auto_update_files": ["README.md"],
  "conventions.commit_format": "conventional"
}
```

**Why flat keys:**
- Grep-safe: `'"release.changelog"'` matches exactly one key. No substring collisions, no nesting ambiguity, no `head -1` hacks.
- Profile-compatible: a profile is just another flat key-value map with the same namespace. No structural mismatch between profiles and overrides.
- Accessor-friendly: `node -e "p['release.changelog']"` works without JSON path traversal.

**Key naming convention:** `{domain}.{setting}` where domain is one of: `release`, `docs`, `conventions`, `milestone`. Two levels max. Use underscores within segments (`changelog_format`, not `changelogFormat`) to match existing Kata conventions for bash variables.

### Accessor Script: `kata/scripts/read-pref.sh`

Ships with the Kata plugin. Single entry point for all preference reads.

```bash
#!/bin/bash
# Usage: read-pref.sh <key>
# Returns the value for the given preference key.
# Resolution order: preferences.json → config.json → built-in default
KEY="$1"
node -e "
  const fs = require('fs');
  const DEFAULTS = {
    'release.changelog': 'true',
    'release.changelog_format': 'keep-a-changelog',
    'release.version_bump': 'conventional-commits',
    'docs.readme_on_milestone': 'prompt',
    'docs.auto_update_files': 'README.md',
    'conventions.commit_format': 'conventional',
    'pr_workflow': 'false',
    'commit_docs': 'true',
    'mode': 'yolo',
    'depth': 'standard',
    'model_profile': 'balanced'
  };
  function read(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  }
  const prefs = read('.planning/preferences.json');
  const config = read('.planning/config.json');
  const v = prefs['${KEY}'] ?? config['${KEY}'] ?? DEFAULTS['${KEY}'] ?? '';
  console.log(typeof v === 'object' ? JSON.stringify(v) : v);
" 2>/dev/null || echo "${2:-}"
```

**What this centralizes:**
1. File path resolution (skills never hardcode `.planning/preferences.json`)
2. Parsing logic (no grep patterns to get wrong)
3. Default values (one authoritative source, fixing the inconsistent-defaults bug where `issueMode` defaults to `"never"` in execute-phase but `"auto"` in add-milestone)
4. Migration (reads both files transparently; preferences.json takes precedence)

**Skill usage:**
```bash
CHANGELOG_ENABLED=$("${KATA_SCRIPTS}/read-pref.sh" "release.changelog")
README_MODE=$("${KATA_SCRIPTS}/read-pref.sh" "docs.readme_on_milestone")
```

### Separation from config.json

**Boundary rule:** "Would you change this between runs?" If yes, it belongs in config.json. If no, it belongs in preferences.json.

| File | Contains | Changes when |
|------|----------|-------------|
| `config.json` | Session-variable settings: mode, depth, model_profile, display.statusline | User switches workflow style |
| `preferences.json` | Project-lifetime constants: changelog format, version files, doc conventions | Project setup or first encounter |

Keys like `pr_workflow` and `commit_docs` are project-lifetime settings and belong in preferences.json. The accessor script handles backward compatibility by reading from both files, so existing config.json values continue to work without migration.

### Actual Decision Points (Current Codebase)

The initial schema covers decision points that exist in skills today:

| Decision Point | Skill | Current Behavior | Preference Key |
|---------------|-------|-----------------|---------------|
| Generate changelog? | `kata-complete-milestone` | Always generates | `release.changelog` |
| Changelog format | `changelog-generator.md` | Hardcoded Keep a Changelog | `release.changelog_format` |
| Version bump strategy | `version-detector.md` | Hardcoded conventional commits | `release.version_bump` |
| Extra version files | `version-detector.md` | Auto-detected only | `release.version_files_override` |
| Update README at milestone? | `kata-complete-milestone` | Prompts every time | `docs.readme_on_milestone` |
| Commit planning docs? | Multiple (10+ skills) | config.json `commit_docs` | `commit_docs` |
| PR workflow? | Multiple (5+ skills) | config.json `pr_workflow` | `pr_workflow` |

Note: `version-detector.md` already auto-detects version files dynamically. The `release.version_files_override` preference handles only additions or exclusions that detection misses, not full replacement.

New preference keys are added when a skill gains a new decision point. The schema grows organically.

---

## Proposals Eliminated

**Proposal 1 (Extend config.json):** Mixed concerns. Grep ambiguity worsens with more keys in the same file. No clean boundary between operational and project-identity settings.

**Proposal 3 (PREFERENCES.md with YAML frontmatter):** YAML parsing in bash is harder than JSON parsing. Kata uses YAML frontmatter in files read holistically by Claude, not in files parsed by bash grep snippets. Wrong tool for the execution environment.

**Proposal 4 (Layered defaults with `_source` markers):** Implementation cost exceeds benefit. Every preference read becomes 4 bash operations instead of 1. The discovery problem (has user expressed a preference?) is solved more simply by the accessor script: if the key exists in preferences.json, the user set it. If it falls through to defaults, they haven't.

---

## Discovery: "Has the user expressed a preference?"

The accessor script's resolution order provides implicit discovery:

1. Key exists in `preferences.json` → user expressed a preference. Use it.
2. Key exists in `config.json` only → legacy setting, not yet migrated. Use it.
3. Key exists in neither → no preference expressed. Use built-in default, or trigger progressive capture (prompt and persist to preferences.json).

Skills that need progressive capture check for key existence before reading:

```bash
# Check if user has expressed a preference
HAS_PREF=$(node -e "
  try {
    const p = require('$PWD/.planning/preferences.json');
    console.log(p['release.changelog'] !== undefined ? 'yes' : 'no');
  } catch { console.log('no'); }
" 2>/dev/null || echo "no")

if [ "$HAS_PREF" = "no" ]; then
  # Progressive capture: prompt user, then write to preferences.json
  ...
fi
```

This could also be a second accessor function: `has-pref.sh release.changelog` returning `yes`/`no`.

---

## Deferred: Profile-Based Defaults

Project-type profiles (npm-package, python-library, etc.) are compatible with this design but deferred to a later milestone. When implemented, the resolution order becomes:

```
preferences.json → profile defaults → config.json → built-in defaults
```

Profiles are flat key-value maps with the same dot-notation namespace. No schema changes needed. The accessor script gains one additional read layer.

---

## Deferred: Migrate Existing Config Reads

The accessor script can also replace the ~90 existing `grep` one-liners for config.json keys. This would fix the inconsistent-defaults bug for all existing keys and unify the read pattern across all skills. Recommended as a follow-up after the preferences system is established, not as part of the initial implementation. Skills can migrate incrementally (new code uses accessor, old grep patterns continue to work).

---

## Scope Estimate

**Initial implementation:**
- Create `kata/scripts/read-pref.sh` with defaults table
- Create `kata/scripts/has-pref.sh` for discovery checks
- Update `kata-new-project` to scaffold empty `preferences.json`
- Update `kata-complete-milestone` to read release preferences via accessor
- Update `kata-configure-settings` (or create `kata-configure-preferences`) to write preferences

**~5 skills modified, 2 new scripts, 1 new file per project.**

---

## Open Questions for Implementation

1. **Should `read-pref.sh` accept nested config.json keys?** E.g., `read-pref.sh github.enabled` where the value lives at `config.github.enabled` in the JSON. The accessor would need to handle both flat keys (preferences.json) and nested keys (config.json fallback).

2. **How does `KATA_SCRIPTS` resolve?** Skills need to find the accessor script. Options: `$CLAUDE_PLUGIN_ROOT/kata/scripts/`, a hardcoded path relative to skill location, or a `KATA_SCRIPTS` env var set by a session hook.

3. **Should preferences.json be committed to git?** It follows the same `commit_docs` rule as other `.planning/` files. But preferences are project-level and arguably should always be committed (they're like `.editorconfig` — shared project identity, not personal config).
