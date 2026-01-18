---
name: kata:update
description: Update Kata to latest version with changelog display
---

<objective>
Check for Kata updates, install if available, and display what changed.

Provides a better update experience than raw `npx @gannonh/kata` by showing version diff and changelog entries.
</objective>

<process>

<step name="detect_installation">
Detect whether Kata is installed locally (in current project) or globally:

```bash
if [ -d "./.claude/commands/kata" ]; then
  echo "local"
else
  echo "global"
fi
```

**Set paths based on installation type:**

| Installation | VERSION Path | Install Flag | Cache Path |
|-------------|--------------|--------------|------------|
| Local | `./.claude/kata/VERSION` | (no flag) | `./.claude/kata/cache/update-check.json` |
| Global | `~/.claude/kata/VERSION` | `--global` | `~/.claude/kata/cache/update-check.json` |

Store the installation type for use in subsequent steps.

**Display detection result:**
```
Detected installation: [local/global]
```
</step>

<step name="get_installed_version">
Read installed version from the detected installation path:

**For local installation:**
```bash
cat ./.claude/kata/VERSION 2>/dev/null
```

**For global installation:**
```bash
cat ~/.claude/kata/VERSION 2>/dev/null
```

**If VERSION file missing:**
```
## Kata Update

**Installed version:** Unknown
**Installation type:** [local/global]

Your installation doesn't include version tracking.

Running fresh install...
```

Proceed to install step (treat as version 0.0.0 for comparison).
</step>

<step name="check_latest_version">
Check npm for latest version:

```bash
npm view @gannonh/kata version 2>/dev/null
```

**If npm check fails:**
```
Couldn't check for updates (offline or npm unavailable).

To update manually: `npx @gannonh/kata --global`
```

STOP here if npm unavailable.
</step>

<step name="compare_versions">
Compare installed vs latest:

**If installed == latest:**
```
## Kata Update

**Installed:** X.Y.Z
**Latest:** X.Y.Z

You're already on the latest version.
```

STOP here if already up to date.

**If installed > latest:**
```
## Kata Update

**Installed:** X.Y.Z
**Latest:** A.B.C

You're ahead of the latest release (development version?).
```

STOP here if ahead.
</step>

<step name="show_changes_and_confirm">
**If update available**, fetch and show what's new BEFORE updating:

1. Fetch changelog (same as fetch_changelog step)
2. Extract entries between installed and latest versions
3. Display preview and ask for confirmation:

```
## Kata Update Available

**Installed:** 1.5.10
**Latest:** 1.5.15

### What's New
────────────────────────────────────────────────────────────

## [1.5.15] - 2026-01-20

### Added
- Feature X

## [1.5.14] - 2026-01-18

### Fixed
- Bug fix Y

────────────────────────────────────────────────────────────

⚠️  **Note:** The installer performs a clean install of Kata folders.

**For local installation (in current project):**
- `./.claude/commands/kata/` will be wiped and replaced
- `./.claude/kata/` will be wiped and replaced
- `./.claude/agents/kata-*` files will be replaced

**For global installation:**
- `~/.claude/commands/kata/` will be wiped and replaced
- `~/.claude/kata/` will be wiped and replaced
- `~/.claude/agents/kata-*` files will be replaced

Your custom files in other locations are preserved:
- Custom commands not in the kata folder ✓
- Custom agents not prefixed with `kata-` ✓
- Custom hooks ✓
- Your CLAUDE.md files ✓

If you've modified any Kata files directly, back them up first.
```

Use AskUserQuestion:
- Question: "Proceed with update?"
- Options:
  - "Yes, update now"
  - "No, cancel"

**If user cancels:** STOP here.
</step>

<step name="run_update">
Run the update using the appropriate flag based on installation type:

**For local installation:**
```bash
npx @gannonh/kata
```

**For global installation:**
```bash
npx @gannonh/kata --global
```

Capture output. If install fails, show error and STOP.

Clear the update cache so statusline indicator disappears:

**For local installation:**
```bash
rm -f ./.claude/kata/cache/update-check.json
```

**For global installation:**
```bash
rm -f ~/.claude/kata/cache/update-check.json
```
</step>

<step name="display_result">
Format completion message (changelog was already shown in confirmation step):

```
╔═══════════════════════════════════════════════════════════╗
║  Kata Updated: v1.5.10 → v1.5.15                           ║
╚═══════════════════════════════════════════════════════════╝

⚠️  Restart Claude Code to pick up the new commands.

[View full changelog](https://github.com/gannonh/kata/blob/main/CHANGELOG.md)
```
</step>

</process>

<success_criteria>
- [ ] Installation type detected (local vs global)
- [ ] Correct paths used based on installation type
- [ ] Installed version read correctly
- [ ] Latest version checked via npm
- [ ] Update skipped if already current
- [ ] Changelog fetched and displayed BEFORE update
- [ ] Clean install warning shown with appropriate paths
- [ ] User confirmation obtained
- [ ] Update executed with correct flag (--global for global only)
- [ ] Restart reminder shown
</success_criteria>
