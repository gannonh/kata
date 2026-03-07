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

## detect_version_files

Detect which files in the project contain version strings that need bumping.

```bash
# Detect version files present in the project root
# Check common version file locations across ecosystems
detect_version_files() {
  local files=""

  # Node.js / JavaScript
  [ -f "package.json" ] && files="$files package.json"

  # Python
  [ -f "pyproject.toml" ] && files="$files pyproject.toml"
  [ -f "setup.py" ] && files="$files setup.py"
  [ -f "setup.cfg" ] && files="$files setup.cfg"

  # Ruby
  [ -f "*.gemspec" ] && files="$files $(ls *.gemspec 2>/dev/null)"
  [ -f "lib/*/version.rb" ] && files="$files $(ls lib/*/version.rb 2>/dev/null)"

  # Rust
  [ -f "Cargo.toml" ] && files="$files Cargo.toml"

  # Go
  [ -f "version.go" ] && files="$files version.go"

  # iOS / macOS
  [ -f "*.xcodeproj/project.pbxproj" ] && files="$files xcodeproj"

  # Claude Code plugin
  [ -f ".claude-plugin/plugin.json" ] && files="$files .claude-plugin/plugin.json"

  # Generic
  [ -f "VERSION" ] && files="$files VERSION"
  [ -f "version.txt" ] && files="$files version.txt"

  echo "$files"
}
```

## get_current_version

Read the current version from detected project files.

```bash
# Read version from the first detected version file
get_current_version() {
  # Try common version sources in priority order
  if [ -f "package.json" ]; then
    node -p "require('./package.json').version" 2>/dev/null && return
  fi
  if [ -f "pyproject.toml" ]; then
    grep -m1 'version' pyproject.toml | sed 's/.*= *"\(.*\)"/\1/' 2>/dev/null && return
  fi
  if [ -f "Cargo.toml" ]; then
    grep -m1 '^version' Cargo.toml | sed 's/.*= *"\(.*\)"/\1/' 2>/dev/null && return
  fi
  if [ -f "VERSION" ]; then
    cat VERSION 2>/dev/null && return
  fi
  # Fallback: extract from last git tag
  git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' && return
  echo "0.0.0"
}
```

## update_versions

Update all detected version files to the new version.

```bash
update_versions() {
  local version="$1"
  local files=$(detect_version_files)

  for file in $files; do
    case "$file" in
      package.json|.claude-plugin/plugin.json|*/plugin.json)
        if command -v jq &>/dev/null; then
          jq --arg v "$version" '.version = $v' "$file" > "$file.tmp"
          mv "$file.tmp" "$file"
        fi
        ;;
      pyproject.toml)
        sed -i.bak "s/^version = \".*\"/version = \"$version\"/" "$file" && rm -f "$file.bak"
        ;;
      Cargo.toml)
        sed -i.bak "s/^version = \".*\"/version = \"$version\"/" "$file" && rm -f "$file.bak"
        ;;
      setup.cfg)
        sed -i.bak "s/^version = .*/version = $version/" "$file" && rm -f "$file.bak"
        ;;
      VERSION|version.txt)
        echo "$version" > "$file"
        ;;
      *)
        echo "Note: Manual version update may be needed for $file"
        ;;
    esac
    echo "Updated $file → $version"
  done
}
```

**Atomic update:** Uses tmp file + mv pattern for JSON files to prevent partial writes

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
  echo "DRY RUN: Version files detected:"
  detect_version_files
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

**What goes wrong:** Multiple version files have different versions

**Why it happens:** Manual version bumping across files

**How to avoid:** Use `update_versions` function to update all detected files atomically

**Warning signs:** Test failures, published artifact showing wrong version

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
