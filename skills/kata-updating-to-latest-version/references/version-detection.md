# Version Detection & Comparison

Reference for semantic version handling in Kata update workflows.

## Semantic Version Format

Kata follows semver: `MAJOR.MINOR.PATCH`

Example: `0.1.5`
- MAJOR: 0 (breaking changes)
- MINOR: 1 (new features, backward compatible)
- PATCH: 5 (bug fixes)

## Version Comparison Logic

### Bash Implementation

```bash
# Extract components
V1_MAJOR=$(echo "$VERSION1" | cut -d. -f1)
V1_MINOR=$(echo "$VERSION1" | cut -d. -f2)
V1_PATCH=$(echo "$VERSION1" | cut -d. -f3)

V2_MAJOR=$(echo "$VERSION2" | cut -d. -f1)
V2_MINOR=$(echo "$VERSION2" | cut -d. -f2)
V2_PATCH=$(echo "$VERSION2" | cut -d. -f3)

# Compare (returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
if [ "$V1_MAJOR" -lt "$V2_MAJOR" ]; then
  echo "-1"
elif [ "$V1_MAJOR" -gt "$V2_MAJOR" ]; then
  echo "1"
elif [ "$V1_MINOR" -lt "$V2_MINOR" ]; then
  echo "-1"
elif [ "$V1_MINOR" -gt "$V2_MINOR" ]; then
  echo "1"
elif [ "$V1_PATCH" -lt "$V2_PATCH" ]; then
  echo "-1"
elif [ "$V1_PATCH" -gt "$V2_PATCH" ]; then
  echo "1"
else
  echo "0"
fi
```

### Decision Table

| Comparison Result | Status          | User Message                   |
| ----------------- | --------------- | ------------------------------ |
| installed < latest| UPDATE_AVAILABLE| "Update available"             |
| installed = latest| UP_TO_DATE      | "You're running latest"        |
| installed > latest| AHEAD           | "Running development version"  |

## npm Registry API

### Get Latest Version

```bash
npm view @gannonh/kata version
```

**Success output:**
```
0.1.5
```

**Failure scenarios:**
- No internet: Command hangs or times out
- Package not found: `npm ERR! code E404`
- npm not installed: `command not found: npm`

**Error handling:**
```bash
LATEST=$(npm view @gannonh/kata version 2>/dev/null)
if [ -z "$LATEST" ]; then
  echo "Unable to check for updates"
  # Continue with installed version only
fi
```

### Get All Versions

```bash
npm view @gannonh/kata versions --json
```

Returns JSON array:
```json
["0.1.0", "0.1.1", "0.1.2", "0.1.3", "0.1.4", "0.1.5"]
```

Useful for showing version history or validating version ranges.

## CHANGELOG.md Parsing

### Version Header Format

Kata CHANGELOG uses markdown headers:

```markdown
## v0.1.5

### Added
- New feature X
- New feature Y

### Fixed
- Bug fix Z

## v0.1.4

### Added
- Previous feature
```

### Extraction Strategy

**Goal:** Extract all entries between `LATEST_VERSION` and `INSTALLED_VERSION`

**Algorithm:**
1. Find line containing `## v{LATEST_VERSION}`
2. Capture all lines until line containing `## v{INSTALLED_VERSION}`
3. Stop before the installed version header (exclude it)

**Bash implementation:**
```bash
INSTALLED="0.1.3"
LATEST="0.1.5"

awk "/## v$LATEST/,/## v$INSTALLED/" ~/.claude/kata/CHANGELOG.md | head -n -1
```

**Edge cases:**
- **Installed version not in changelog:** Extract from latest to first version found
- **Multiple releases between versions:** Include all intermediate versions
- **No changelog entries:** Display "No changelog entries found"

### Content Formatting

**Include:**
- Version headers (`## v1.2.3`)
- Section headers (`### Added`, `### Fixed`)
- List items
- Blank lines (preserve formatting)

**Exclude:**
- Top-level document title (`# Changelog`)
- Metadata comments
- Content after installed version

## Version File Locations

Kata VERSION file can be in:

1. **Global install:** `~/.claude/kata/VERSION`
2. **Local install:** `./.claude/kata/VERSION`

**Check order:**
1. Try global first (most common)
2. Fall back to local if global not found
3. Error if neither exists

**Content format:**
```
0.1.5
```

Single line, no prefix, no newline padding.

## Pre-release and Build Metadata

**Current scope:** Kata uses clean semver (no pre-release suffixes)

**Future support (if needed):**
- Pre-release: `1.0.0-alpha.1`
- Build metadata: `1.0.0+20130313144700`

**Comparison rules (semver spec):**
- `1.0.0-alpha < 1.0.0` (pre-release < release)
- Pre-release precedence: `alpha < beta < rc`
- Build metadata ignored in comparisons

Not currently needed, but documented for future reference.
