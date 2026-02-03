<purpose>

Detect semantic version bump type from conventional commits since the last release tag.

This reference provides reusable bash functions for:
1. Extracting commits since last release
2. Categorizing commits by type (feat, fix, breaking)
3. Determining version bump type (major, minor, patch, none)
4. Calculating next version number
5. Updating version files atomically

</purpose>

<commit_parsing>

## Pattern: Conventional Commit Parsing

Extract commits since last release tag, categorize by type.

```bash
# Get last release tag
# Note: git describe finds the most recent tag reachable from HEAD.
# On diverged branches, this may not be the "latest" tag chronologically.
# For release workflows, ensure you're on the main branch.
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Get commits since last tag (or all commits if no tag)
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline --format="%s" "$LAST_TAG"..HEAD)
else
  COMMITS=$(git log --oneline --format="%s")
fi

# Filter by type using Conventional Commits patterns:
# - Breaking: "type(scope)!:" suffix OR "BREAKING CHANGE:" in footer
# - Features: "feat:" or "feat(scope):"
# - Fixes: "fix:" or "fix(scope):"
# The `|| true` prevents grep from returning exit code 1 when no matches found.
BREAKING=$(echo "$COMMITS" | grep -E "^[a-z]+(\(.+\))?!:|BREAKING CHANGE:" || true)
FEATURES=$(echo "$COMMITS" | grep -E "^feat(\(.+\))?:" || true)
FIXES=$(echo "$COMMITS" | grep -E "^fix(\(.+\))?:" || true)
```

</commit_parsing>

<functions>

## detect_version_bump

Determine version bump type from commit categorization.

```bash
# Version bump detection algorithm
# Source: Conventional Commits specification
# https://www.conventionalcommits.org/en/v1.0.0/
detect_version_bump() {
  local breaking="$1"
  local features="$2"
  local fixes="$3"

  if [ -n "$breaking" ]; then
    echo "major"
  elif [ -n "$features" ]; then
    echo "minor"
  elif [ -n "$fixes" ]; then
    echo "patch"
  else
    echo "none"  # Only docs, chore, etc.
  fi
}
```

**Return values:**
- `major` — Breaking changes detected (commit with `!` suffix or `BREAKING CHANGE:` footer)
- `minor` — New features detected (`feat:` commits)
- `patch` — Bug fixes detected (`fix:` commits)
- `none` — Only non-release commits (docs, chore, refactor, test, etc.)

## calculate_next_version

Calculate next version number from current version and bump type.

```bash
# Source: Semantic Versioning 2.0.0
# https://semver.org/
calculate_next_version() {
  local current="$1"
  local bump_type="$2"

  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"

  case "$bump_type" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) echo "$current" ;;
  esac
}
```

**Usage:**
```bash
calculate_next_version "1.2.3" "minor"  # Returns: 1.3.0
calculate_next_version "1.2.3" "major"  # Returns: 2.0.0
calculate_next_version "1.2.3" "patch"  # Returns: 1.2.4
```

## update_versions

Update version files atomically (package.json and plugin.json).

```bash
# Source: Kata's existing releasing-kata skill
update_versions() {
  local version="$1"

  # Check jq is available
  if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Install via: brew install jq (macOS) or apt-get install jq (Linux)"
    return 1
  fi

  # Update package.json
  jq --arg v "$version" '.version = $v' package.json > package.json.tmp
  mv package.json.tmp package.json

  # Update plugin.json
  jq --arg v "$version" '.version = $v' .claude-plugin/plugin.json > plugin.json.tmp
  mv plugin.json.tmp .claude-plugin/plugin.json
}
```

**Requires:** `jq` for JSON manipulation (reliable, handles edge cases). Most systems have jq installed; if missing, the function provides install instructions.

**Atomic update:** Uses tmp file + mv pattern to prevent partial writes

</functions>

<dry_run_mode>

## Dry Run Mode

Validate release without executing changes.

```bash
DRY_RUN=${DRY_RUN:-false}

if [ "$DRY_RUN" = "true" ]; then
  echo "DRY RUN: Would create release v$VERSION"
  echo "DRY RUN: Changelog entry:"
  echo "$CHANGELOG_ENTRY"
  echo "DRY RUN: Files to update:"
  echo "  - package.json"
  echo "  - .claude-plugin/plugin.json"
  echo "  - CHANGELOG.md"
else
  # Execute actual release
  update_versions "$VERSION"
fi
```

**Usage:**
```bash
DRY_RUN=true ./release.sh    # Preview only
DRY_RUN=false ./release.sh   # Execute release
```

Dry run mode shows:
- Proposed version number
- Generated changelog entry
- Files that would be modified
- Git commands that would run

</dry_run_mode>

<pitfalls>

## Common Pitfalls

### Pitfall 1: Version Mismatch

**What goes wrong:** package.json and plugin.json have different versions

**Why it happens:** Manual version bumping in multiple files

**How to avoid:** Use `update_versions` function to update both files atomically

**Warning signs:** Test failures, marketplace showing wrong version

### Pitfall 2: Missing Breaking Change Detection

**What goes wrong:** Major changes released as minor/patch

**Why it happens:** Missing `!` suffix or `BREAKING CHANGE:` footer in commits

**How to avoid:**
- Train commit discipline: breaking changes MUST use `feat!:` or `fix!:` syntax
- Add explicit confirmation prompt: "Does this include breaking changes?"

**Warning signs:** Users report unexpected breaking changes after minor update

### Pitfall 3: Empty Release

**What goes wrong:** Release created with no meaningful changes

**Why it happens:** Only docs/chore commits since last release

**How to avoid:**
- Check `detect_version_bump` returns "none"
- Prompt for confirmation before proceeding
- Consider if release is truly needed

**Warning signs:** Patch release with empty changelog sections

</pitfalls>

<integration>

## Integration with complete-milestone

This reference is used by the `complete-milestone` skill during the release flow:

1. **Pre-flight check:** Detect version bump type from commits
2. **Version calculation:** Calculate next version from current + bump type
3. **Dry run:** Preview changes before committing
4. **Execution:** Update version files atomically

**Workflow:**
```
detect_version_bump → calculate_next_version → (dry run preview) → update_versions
```

</integration>
