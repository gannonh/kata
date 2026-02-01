<purpose>

Generate changelog entries from conventional commits in Keep a Changelog format.

This reference provides reusable bash functions for:
1. Extracting commits by type since last release
2. Formatting commits into Keep a Changelog structure
3. Mapping commit types to changelog sections
4. Generating human-reviewable changelog entries

**Critical:** Changelog generation produces a SUGGESTION for human review. The generated entry should be presented for approval before writing to CHANGELOG.md.

</purpose>

<format>

## Keep a Changelog Format

Standard format for changelog entries (https://keepachangelog.com/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- feat: description (from feat commits)

### Fixed
- fix: description (from fix commits)

### Changed
- docs/refactor/perf: description (from other commits)
```

**Section order:** Added, Changed, Deprecated, Removed, Fixed, Security

**Guiding principles:**
- Changelogs are for humans, not machines
- Write in imperative mood ("Add feature" not "Added feature")
- Group by type of change, not by commit order

</format>

<commit_type_mapping>

## Commit Type Mapping

| Commit Type | Changelog Section | Notes                    |
| ----------- | ----------------- | ------------------------ |
| `feat`      | Added             | New features             |
| `fix`       | Fixed             | Bug fixes                |
| `docs`      | Changed           | Documentation changes    |
| `refactor`  | Changed           | Code restructuring       |
| `perf`      | Changed           | Performance improvements |
| `style`     | (omit)            | Formatting only          |
| `test`      | (omit)            | Test changes only        |
| `chore`     | (omit)            | Maintenance tasks        |
| `ci`        | (omit)            | CI/CD changes            |

**Breaking changes:** Noted with `BREAKING:` prefix regardless of commit type

</commit_type_mapping>

<functions>

## get_commits_by_type

Extract commits of a specific type since a reference point.

```bash
# Source: Kata's existing conventional commit usage
# Get commits categorized by type
get_commits_by_type() {
  local since="$1"
  local type="$2"

  # grep pattern: ^type or ^type(scope): where scope can be any text
  # Examples matched: "feat: add login", "feat(auth): add login", "fix(ui): button color"
  # Note: Scopes with special chars like "feat(api/v2):" are matched correctly
  # The `|| true` prevents exit code 1 when no matches (which would fail in scripts)
  if [ -n "$since" ]; then
    git log --oneline --format="%s" "$since"..HEAD | grep -E "^${type}(\(.+\))?:" || true
  else
    git log --oneline --format="%s" | grep -E "^${type}(\(.+\))?:" || true
  fi
}

# Usage
FEATURES=$(get_commits_by_type "v1.2.0" "feat")
FIXES=$(get_commits_by_type "v1.2.0" "fix")
DOCS=$(get_commits_by_type "v1.2.0" "docs")
REFACTOR=$(get_commits_by_type "v1.2.0" "refactor")
PERF=$(get_commits_by_type "v1.2.0" "perf")
```

**Parameters:**
- `since` — Git ref (tag, commit, branch) to start from. Empty for all commits.
- `type` — Commit type prefix (feat, fix, docs, etc.)

**Returns:** Newline-separated list of commit subjects matching the type

## generate_changelog_entry

Format commits into a Keep a Changelog entry.

```bash
# Source: Keep a Changelog format (keepachangelog.com)
generate_changelog_entry() {
  local version="$1"
  local date="$2"
  local features="$3"
  local fixes="$4"
  local changed="$5"

  echo "## [$version] - $date"
  echo ""

  if [ -n "$features" ]; then
    echo "### Added"
    echo "$features" | while read -r line; do
      # Strip "feat: " or "feat(scope): " prefix using sed
      # Pattern: ^feat followed by optional (scope) followed by ": "
      # \([^:]*\) captures the optional scope including parens
      # Result: "feat(auth): add login" → "add login"
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

  if [ -n "$changed" ]; then
    echo "### Changed"
    echo "$changed" | while read -r line; do
      # Strip various prefixes
      desc=$(echo "$line" | sed 's/^docs\([^:]*\): //' | sed 's/^refactor\([^:]*\): //' | sed 's/^perf\([^:]*\): //')
      echo "- $desc"
    done
    echo ""
  fi
}
```

**Parameters:**
- `version` — Version number (e.g., "1.3.0")
- `date` — Release date in YYYY-MM-DD format
- `features` — Newline-separated feat commits
- `fixes` — Newline-separated fix commits
- `changed` — Newline-separated docs/refactor/perf commits

**Returns:** Formatted changelog entry as string

</functions>

<review_gate>

## Review Gate Pattern

**Critical:** Changelog generation is a SUGGESTION, not an automatic write.

The generated changelog must be presented for human approval before writing to CHANGELOG.md.

**Workflow:**

```bash
# 1. Generate changelog entry
CHANGELOG_ENTRY=$(generate_changelog_entry "$VERSION" "$DATE" "$FEATURES" "$FIXES" "$CHANGED")

# 2. Present for review
echo "Generated changelog entry:"
echo "---"
echo "$CHANGELOG_ENTRY"
echo "---"

# 3. Wait for approval (skill uses AskUserQuestion)
# Options:
#   - "Approve and add to CHANGELOG.md"
#   - "Edit first" (user modifies, then confirms)
#   - "Skip changelog" (proceed without changelog update)

# 4. Only write after approval
if [ "$APPROVED" = "true" ]; then
  # Prepend to CHANGELOG.md after header
  # ... (see insertion pattern below)
fi
```

**Why human review:**
- Auto-generated entries may miss context
- Commit messages may need clarification
- Breaking changes need explicit documentation
- Marketing-relevant features may need highlighting

</review_gate>

<insertion>

## CHANGELOG.md Insertion Pattern

Insert new entry after the header, before existing entries.

```bash
insert_changelog_entry() {
  local entry="$1"
  local changelog="CHANGELOG.md"

  # Create if doesn't exist
  if [ ! -f "$changelog" ]; then
    cat > "$changelog" <<'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF
  fi

  # Insert after header (after first blank line following header)
  # Using awk to find insertion point
  #
  # Expected CHANGELOG.md format:
  #   # Changelog
  #   <blank line>     ← insertion point (entry goes after this)
  #   ## [1.2.0] - ...
  #
  # How it works:
  # 1. Print "# Changelog" header unchanged
  # 2. On first blank line after header, print it, then print new entry
  # 3. Print all remaining lines unchanged
  #
  # Edge case: If no blank line exists after header, entry is NOT inserted.
  # The ensure_changelog_header function above creates the correct format,
  # so this shouldn't happen in normal usage.
  awk -v entry="$entry" '
    /^# Changelog/ { print; next }
    /^$/ && !inserted { print; print entry; inserted=1; next }
    { print }
  ' "$changelog" > "$changelog.tmp"
  mv "$changelog.tmp" "$changelog"
}
```

</insertion>

<pitfalls>

## Common Pitfalls

### Pitfall 3: Changelog Overwrites

**What goes wrong:** Generated changelog replaces manual curation

**Why it happens:** Auto-generation without review

**How to avoid:**
- Generate as suggestion, require human approval before write
- Use insertion pattern (prepend, don't replace)
- Keep backup of existing CHANGELOG.md

**Warning signs:** Loss of carefully written release notes

### Other Pitfalls

**Empty sections:** Don't include sections with no items (Added, Fixed, etc.)

**Scope noise:** Strip scope from commit prefix for cleaner reading

**Missing context:** Commit messages may be cryptic; human review adds context

</pitfalls>

<integration>

## Integration with complete-milestone

This reference is used by the `complete-milestone` skill during the release flow:

1. **Extract commits:** Use `get_commits_by_type` to categorize changes
2. **Generate entry:** Use `generate_changelog_entry` to format
3. **Review gate:** Present for human approval (AskUserQuestion)
4. **Insert:** Prepend approved entry to CHANGELOG.md

**Workflow:**
```
get_commits_by_type → generate_changelog_entry → (human review) → insert_changelog_entry
```

**Skill integration pattern:**
```
Use AskUserQuestion:
- header: "Changelog Review"
- question: "Review and approve this changelog entry?"
- options:
  - "Approve" — Write to CHANGELOG.md
  - "Edit first" — Open for editing, then confirm
  - "Skip" — Proceed without changelog
```

</integration>
