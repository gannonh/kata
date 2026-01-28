# Phase 1: Release Automation - Research

**Researched:** 2026-01-28
**Domain:** Conventional commits, semantic versioning, GitHub Release automation
**Confidence:** HIGH

## Summary

This phase automates the release workflow that currently exists as a manual process in the `releasing-kata` skill. The goal is to integrate changelog generation, version detection, and release triggering into the milestone completion flow (`completing-milestones` skill).

The standard approach uses:
1. **Conventional commits parsing** — Kata already uses conventional commits (feat, fix, docs, chore, etc.)
2. **Git log analysis** — No external libraries needed; git log with grep provides commit filtering
3. **GitHub CLI (`gh`)** — Already used extensively for GitHub integration; `gh release create` handles releases
4. **Shell scripting** — Keep release logic in skill workflows, not external tools

**Primary recommendation:** Build release automation directly into the `completing-milestones` skill workflow using shell scripts and `gh` CLI. No external dependencies required — leverage Kata's existing conventional commit discipline and GitHub integration.

## Standard Stack

The established approach for this domain:

### Core (Already Available)
| Tool | Version | Purpose | Why Standard |
| ---- | ------- | ------- | ------------ |
| `git log` | Any | Commit history extraction | Universal, no dependencies |
| `gh release create` | 2.x+ | GitHub Release creation | Official GitHub CLI, already installed in CI |
| Shell (bash) | Any | Script logic | Available everywhere, CI-compatible |

### Not Recommended for Kata
| Tool | Why Not |
| ---- | ------- |
| semantic-release | Overkill for single-plugin project; requires npm dependencies; designed for CI-only |
| conventional-changelog | Requires Node.js dependencies; Kata aims for minimal deps |
| git-cliff | Rust binary; adds installation complexity |
| standard-version | Deprecated (see commit-and-tag-version); requires npm |

**Rationale:** Kata is a single-plugin project with a human-in-the-loop release process. External tools add complexity without proportional benefit. Shell scripts + `gh` CLI provide full control with zero dependencies.

**No new dependencies needed.** The release automation uses:
- Git (already required)
- GitHub CLI `gh` (already required for GitHub integration)
- Bash/shell (universal)

## Architecture Patterns

### Recommended Approach: Skill-Embedded Release Logic

Integrate release automation into the existing `completing-milestones` skill workflow. Release becomes an optional step in milestone completion, not a separate process.

```
completing-milestones/
├── SKILL.md                          # Existing skill (add release steps)
├── references/
│   ├── milestone-complete.md         # Existing (add release workflow)
│   ├── milestone-archive-template.md # Existing
│   ├── changelog-generator.md        # NEW: Changelog generation logic
│   └── version-detector.md           # NEW: Version bump detection logic
└── scripts/
    └── (optional bash scripts if complex)
```

### Pattern 1: Conventional Commit Parsing

**What:** Extract commits since last release tag, categorize by type
**When to use:** Changelog generation, version detection

```bash
# Get last release tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

# Get commits since last tag (or all commits if no tag)
if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline --format="%s" "$LAST_TAG"..HEAD)
else
  COMMITS=$(git log --oneline --format="%s")
fi

# Filter by type
BREAKING=$(echo "$COMMITS" | grep -E "^[a-z]+(\(.+\))?!:|BREAKING CHANGE:" || true)
FEATURES=$(echo "$COMMITS" | grep -E "^feat(\(.+\))?:" || true)
FIXES=$(echo "$COMMITS" | grep -E "^fix(\(.+\))?:" || true)
```

### Pattern 2: Semantic Version Detection

**What:** Determine version bump type from commit types
**When to use:** REL-02 requirement

```bash
# Version bump detection algorithm
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

### Pattern 3: Changelog Entry Generation

**What:** Format commits into Keep a Changelog structure
**When to use:** REL-01 requirement

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- feat: description (from feat commits)

### Fixed
- fix: description (from fix commits)

### Changed
- docs/refactor/perf: description (from other commits)
```

### Pattern 4: Dry Run Mode

**What:** Validate release without executing
**When to use:** REL-04 requirement

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
fi
```

### Anti-Patterns to Avoid

- **External changelog tools:** Adds dependencies for marginal benefit
- **Fully automated releases:** Human review gate is important for quality
- **CI-only release logic:** Kata releases are human-triggered, not commit-triggered
- **Separate release skill:** Release is part of milestone completion, not standalone

## Don't Hand-Roll

Problems that have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| GitHub Release API | Custom HTTP calls | `gh release create` | Official, handles auth, errors |
| Commit parsing regex | Complex regex engine | grep with patterns | Simple, maintainable |
| Version file updates | Custom parser | jq for JSON | Reliable JSON manipulation |

**Key insight:** The GitHub CLI (`gh`) handles all GitHub interactions. Shell scripting handles commit parsing. No additional tools needed.

## Common Pitfalls

### Pitfall 1: Version Mismatch
**What goes wrong:** package.json and plugin.json have different versions
**Why it happens:** Manual version bumping in multiple files
**How to avoid:** Single script updates both files atomically
**Warning signs:** Test failures, marketplace showing wrong version

### Pitfall 2: Missing Tag Check
**What goes wrong:** `gh release create` creates duplicate tags or fails silently
**Why it happens:** Tag already exists from previous attempt
**How to avoid:** Check `gh release view vX.Y.Z` before creating
**Warning signs:** Release workflow exits with error

### Pitfall 3: Changelog Overwrites
**What goes wrong:** Generated changelog replaces manual curation
**Why it happens:** Auto-generation without review
**How to avoid:** Generate as suggestion, require human approval before write
**Warning signs:** Loss of carefully written release notes

### Pitfall 4: Empty Release
**What goes wrong:** Release created with no meaningful changes
**Why it happens:** Only docs/chore commits since last release
**How to avoid:** Detect "none" version bump and prompt for confirmation
**Warning signs:** Patch release with empty changelog sections

### Pitfall 5: Breaking Change Detection
**What goes wrong:** Major changes released as minor/patch
**Why it happens:** Missing `!` suffix or `BREAKING CHANGE:` footer in commits
**How to avoid:** Explicit prompt: "Does this include breaking changes?"
**Warning signs:** Users report unexpected breaking changes

## Code Examples

Verified patterns from existing Kata infrastructure and official documentation:

### Commit Type Extraction (from existing git log)
```bash
# Source: Kata's existing conventional commit usage
# Get commits categorized by type
get_commits_by_type() {
  local since="$1"
  local type="$2"

  if [ -n "$since" ]; then
    git log --oneline --format="%s" "$since"..HEAD | grep -E "^${type}(\(.+\))?:" || true
  else
    git log --oneline --format="%s" | grep -E "^${type}(\(.+\))?:" || true
  fi
}

# Usage
FEATURES=$(get_commits_by_type "v1.2.0" "feat")
FIXES=$(get_commits_by_type "v1.2.0" "fix")
```

### Version Bump Calculation
```bash
# Source: Conventional Commits specification
# https://www.conventionalcommits.org/en/v1.0.0/
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

### GitHub Release Creation
```bash
# Source: https://cli.github.com/manual/gh_release_create
create_release() {
  local version="$1"
  local notes="$2"

  # Check if release already exists
  if gh release view "v$version" &>/dev/null; then
    echo "Release v$version already exists"
    return 1
  fi

  # Create release with notes
  gh release create "v$version" \
    --title "v$version" \
    --notes "$notes" \
    --target main
}
```

### Version File Updates
```bash
# Source: Kata's existing releasing-kata skill
update_versions() {
  local version="$1"

  # Update package.json
  jq --arg v "$version" '.version = $v' package.json > package.json.tmp
  mv package.json.tmp package.json

  # Update plugin.json
  jq --arg v "$version" '.version = $v' .claude-plugin/plugin.json > plugin.json.tmp
  mv plugin.json.tmp .claude-plugin/plugin.json
}
```

### Changelog Generation
```bash
# Source: Keep a Changelog format (keepachangelog.com)
generate_changelog_entry() {
  local version="$1"
  local date="$2"
  local features="$3"
  local fixes="$4"
  local other="$5"

  echo "## [$version] - $date"
  echo ""

  if [ -n "$features" ]; then
    echo "### Added"
    echo "$features" | while read -r line; do
      # Strip "feat: " or "feat(scope): " prefix
      desc=$(echo "$line" | sed 's/^feat\([^:]*\): //')
      echo "- $desc"
    done
    echo ""
  fi

  if [ -n "$fixes" ]; then
    echo "### Fixed"
    echo "$fixes" | while read -r line; do
      desc=$(echo "$line" | sed 's/^fix\([^:]*\): //')
      echo "- $desc"
    done
    echo ""
  fi

  # ... similar for other categories
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| standard-version | commit-and-tag-version | 2022 | standard-version deprecated |
| Complex release tools | GitHub CLI native | 2020+ | gh release create simplifies automation |
| CI-only releases | Human-triggered with automation assist | N/A | Kata preference |

**Deprecated/outdated:**
- standard-version: Deprecated, use commit-and-tag-version if you need npm tool
- manual changelog writing: Can be automated from commits

## Open Questions

Things that couldn't be fully resolved:

1. **Changelog curation quality**
   - What we know: Auto-generated changelogs are good starting points
   - What's unclear: How much manual editing is typical for Kata releases?
   - Recommendation: Generate as suggestion, present for approval before writing

2. **Pre-release versions (alpha, beta)**
   - What we know: Conventional commits doesn't specify pre-release handling
   - What's unclear: Will Kata use pre-release versions?
   - Recommendation: Support simple major.minor.patch initially, add pre-release later if needed

## Sources

### Primary (HIGH confidence)
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) - Specification for commit message format
- [gh release create manual](https://cli.github.com/manual/gh_release_create) - Official GitHub CLI documentation
- Kata's existing `releasing-kata` skill - Current release workflow
- Kata's `completing-milestones` skill - Integration target

### Secondary (MEDIUM confidence)
- [semantic-release](https://github.com/semantic-release/semantic-release) - Inspiration for version detection algorithm
- [Git Semantic Version Action](https://github.com/PaulHatch/semantic-version) - Reference implementation

### Tertiary (LOW confidence)
- WebSearch results on changelog automation - General patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing tools (git, gh), no new dependencies
- Architecture: HIGH - Builds on existing skill structure
- Pitfalls: HIGH - Based on Kata's own release history (v1.0.1-v1.0.8 patch series)
- Code examples: HIGH - Verified against official documentation and existing Kata code

**Research date:** 2026-01-28
**Valid until:** 60 days (stable domain, minimal change expected)
