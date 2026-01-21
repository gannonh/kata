---
name: kata-updating-to-latest-version
description: Use this skill for updating Kata to the latest version, checking current version, viewing changelog, or seeing what's new in recent releases. Triggers include "update kata", "upgrade kata", "update to latest", "check for updates", "kata updates", "new version", "latest version", "whats new", "what's new", "what's new in kata", "recent changes", "show changelog", "view changelog", "kata changelog", "version", "kata version", "current version", "check version", "which version".
user-invocable: false
---

# Update & Version Management Orchestrator

Handles version checking, updates, and changelog display for the Kata framework.

## When to Use

- User wants to update Kata to latest version ("update kata", "upgrade kata")
- User wants to check current version ("kata version", "which version")
- User wants to see what's new ("whats new", "recent changes", "changelog")
- User wants to check for updates ("check for updates", "new version")

## Workflow Overview

```
1. Parse user intent (UPDATE vs WHATS-NEW vs VERSION-CHECK)
2. Detect installed version
3. Check npm registry for latest version
4. Execute appropriate action:
   - UPDATE: Display npx command to update
   - WHATS-NEW: Show changelog since installed version
   - VERSION-CHECK: Display current and latest versions
```

## Execution Flow

### Step 1: Determine Intent

Parse user request to identify intent:

| Trigger Keywords                                    | Intent        |
| --------------------------------------------------- | ------------- |
| "update", "upgrade", "update to latest"             | UPDATE        |
| "whats new", "what's new", "recent changes"         | WHATS-NEW     |
| "changelog", "show changelog", "view changelog"     | WHATS-NEW     |
| "version", "current version", "which version"       | VERSION-CHECK |
| "check for updates", "new version", "latest version"| VERSION-CHECK |

### Step 2: Read Installed Version

Check the installed version from the Kata VERSION file:

```bash
cat ~/.claude/kata/VERSION 2>/dev/null
```

**If file not found:**
```bash
cat ./.claude/kata/VERSION 2>/dev/null
```

**If both fail:**
```
Unable to determine installed version.
Kata may not be installed or VERSION file is missing.

Install or reinstall:
npx @gannonh/kata
```
Exit skill.

Store the version as `INSTALLED_VERSION`.

### Step 3: Check Latest Version from npm

Query npm registry for latest published version:

```bash
npm view @gannonh/kata version 2>/dev/null
```

**If command fails:**
```
Unable to check npm registry for latest version.
Please check your internet connection.
```
Continue with installed version only (limited functionality).

Store the version as `LATEST_VERSION`.

See `./references/version-detection.md` for version comparison logic.

### Step 4: Compare Versions

Compare `INSTALLED_VERSION` with `LATEST_VERSION` using semver logic:

```bash
# Extract major.minor.patch
INSTALLED_MAJOR=$(echo "$INSTALLED_VERSION" | cut -d. -f1)
INSTALLED_MINOR=$(echo "$INSTALLED_VERSION" | cut -d. -f2)
INSTALLED_PATCH=$(echo "$INSTALLED_VERSION" | cut -d. -f3)

LATEST_MAJOR=$(echo "$LATEST_VERSION" | cut -d. -f1)
LATEST_MINOR=$(echo "$LATEST_VERSION" | cut -d. -f2)
LATEST_PATCH=$(echo "$LATEST_VERSION" | cut -d. -f3)
```

Determine update status:
- **UP_TO_DATE:** versions match exactly
- **UPDATE_AVAILABLE:** latest > installed
- **AHEAD:** installed > latest (dev/unreleased)

### Step 5: Route to Action

Based on intent and update status, execute the appropriate workflow:

---

## UPDATE Intent Workflow

Display update instructions based on update status.

### If UP_TO_DATE

Output this markdown directly (not as a code block):

KATA > VERSION STATUS

**You're running the latest version**

- Installed: v{INSTALLED_VERSION}
- Latest: v{LATEST_VERSION}

No update needed.

### If UPDATE_AVAILABLE

Output this markdown directly (not as a code block):

KATA > UPDATE AVAILABLE

**New version available**

- Installed: v{INSTALLED_VERSION}
- Latest: v{LATEST_VERSION}

**To update:**

```bash
npx @gannonh/kata
```

This will reinstall Kata with the latest version.

**To see what's new:**
"whats new in kata" or `/kata:whats-new`

### If AHEAD

Output this markdown directly (not as a code block):

KATA > VERSION STATUS

**You're running a development version**

- Installed: v{INSTALLED_VERSION}
- Latest published: v{LATEST_VERSION}

You may be running unreleased changes.

---

## WHATS-NEW Intent Workflow

Display changelog entries since the installed version.

### Step WN-1: Read CHANGELOG.md

Read the Kata changelog:

```bash
cat ~/.claude/kata/CHANGELOG.md 2>/dev/null
```

**If file not found:**
```bash
cat ./.claude/kata/CHANGELOG.md 2>/dev/null
```

**If both fail:**
```
CHANGELOG.md not found.
Unable to show recent changes.
```
Exit skill.

### Step WN-2: Extract Relevant Entries

Parse changelog to find all version headers between `INSTALLED_VERSION` and `LATEST_VERSION`.

**Version header format:**
```
## v1.2.3
```

**Extraction logic:**
1. Find the line with `## v{LATEST_VERSION}`
2. Extract all content until (but not including) `## v{INSTALLED_VERSION}`
3. If installed version not found in changelog, extract all entries from latest down to first older version

See `./references/version-detection.md` for parsing details.

### Step WN-3: Display Changelog

Output this markdown directly (not as a code block):

KATA > WHAT'S NEW

**Changes since v{INSTALLED_VERSION}**

{extracted changelog content}

---

**Current status:**
- Installed: v{INSTALLED_VERSION}
- Latest: v{LATEST_VERSION}

**To update:**
"update kata" or `/kata:update`

### If No New Changes

If `INSTALLED_VERSION == LATEST_VERSION`:

Output this markdown directly (not as a code block):

KATA > WHAT'S NEW

**You're up to date**

No changes since v{INSTALLED_VERSION}.

---

## VERSION-CHECK Intent Workflow

Display current version information.

Output this markdown directly (not as a code block):

KATA > VERSION INFO

**Installed version:** v{INSTALLED_VERSION}
**Latest version:** v{LATEST_VERSION}

{if UPDATE_AVAILABLE}
**Status:** Update available

To update: "update kata" or `/kata:update`
To see changes: "whats new in kata"
{endif}

{if UP_TO_DATE}
**Status:** Up to date ✓
{endif}

{if AHEAD}
**Status:** Running development version
{endif}

---

## Key References

- **Version detection and semver comparison:** See `./references/version-detection.md`
- **CHANGELOG parsing logic:** See `./references/version-detection.md`

## Quality Standards

This skill must:

- [ ] Correctly parse semantic version numbers (major.minor.patch)
- [ ] Handle missing VERSION or CHANGELOG files gracefully
- [ ] Provide clear next steps for each scenario
- [ ] Support both global (~/.claude/) and local (./.claude/) installs
- [ ] Extract changelog entries accurately without duplication
