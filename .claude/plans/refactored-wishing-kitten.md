# Plan: Update Release Process and Ship Current Release

## Scope

Get the current release out the door by:
1. Updating CI to create GitHub Releases automatically
2. Updating `releasing-kata` skill to reflect current plugin-only distribution
3. Running the updated release process

**Out of scope (future milestone):** Integrating milestone completion with release management.

---

## Current State Analysis

### CI (`plugin-release.yml`)
- Triggers on push to main ✓
- Compares plugin.json version vs marketplace version ✓
- Publishes to marketplace if version changed ✓
- **Missing:** Does NOT create GitHub Releases or tags
- **Issue:** `permissions: contents: read` — needs `write` for release creation

### `releasing-kata` Skill — Outdated References
| Line | Issue |
|------|-------|
| 8 | "dual-channel distribution (NPM + Plugin)" — NPM deprecated |
| 18 | Claims CI "publish NPM → create GitHub Release" — incorrect |
| 143-147 | References `publish.yml` — no longer exists |
| 158-163 | NPM smoke tests — no longer relevant |
| 174-179 | "Verify NPM package published" — doesn't happen |
| 231-245 | Acceptance criteria includes NPM verification |

### `release-troubleshooting.md` — Outdated Sections
| Lines | Issue |
|-------|-------|
| 7-22 | "NPM Publish Fails" section — NPM no longer used |
| 57-71 | References `publish.yml` and workflow_run trigger |
| 159-165 | NPM_TOKEN setup instructions — no longer needed |

---

## Critical Files

| File | Change |
|------|--------|
| `.github/workflows/plugin-release.yml` | Add GitHub Release creation, update permissions |
| `.claude/skills/releasing-kata/SKILL.md` | Remove NPM references, update CI description |
| `.claude/skills/releasing-kata/release-troubleshooting.md` | Remove NPM troubleshooting sections |
| `package.json` | Update version 1.1.15 → 1.2.0 |
| `.claude-plugin/plugin.json` | Update version 1.1.15 → 1.2.0 |
| `CHANGELOG.md` | Add [1.2.0] entry for this release |
| `README.md` | Update version references from v1.1.0 → v1.2.0 |

---

## Task 0: Fix Version Numbers for v1.2.0 Release

The current version is 1.1.15 but this release should be 1.2.0 (minor bump for new features).

### Update package.json and plugin.json
```json
"version": "1.2.0"
```

Both files:
- `package.json` (line ~3)
- `.claude-plugin/plugin.json` (line 3)

### Add CHANGELOG.md entry
Add new section after `## [Unreleased]`:
```markdown
## [1.2.0] - 2026-01-27 — Release Process Integration

### Added
- Automated GitHub Release creation in CI
- [other accomplishments from this milestone]

### Changed
- Updated release skill to reflect plugin-only distribution
- Removed deprecated NPM publishing references

### Fixed
- CI now creates GitHub Releases with tags automatically
```

### Update README.md version references
Change `v1.1.0` → `v1.2.0` in:
- Feature announcement line (currently "**v1.1.0** — GitHub-integrated workflows")
- Any other version-specific references

---

## Task 1: Update CI to Create GitHub Releases

**File:** `.github/workflows/plugin-release.yml`

### Change 1: Update permissions (line 17-18)
```yaml
# Before
permissions:
  contents: read

# After
permissions:
  contents: write
```

### Change 2: Add GitHub Release step after "Check if should publish" (line 60), before "Run tests"
```yaml
- name: Create GitHub Release
  if: steps.check.outputs.should_publish == 'true'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    VERSION="${{ steps.version.outputs.plugin_version }}"

    # Skip if release already exists
    if gh release view "v$VERSION" &>/dev/null; then
      echo "Release v$VERSION already exists, skipping"
      exit 0
    fi

    # Extract changelog for this version
    CHANGELOG=$(awk "/^## \[${VERSION}\]/{found=1; next} /^## \[/{if(found) exit} found{print}" CHANGELOG.md)

    # Create release with tag
    gh release create "v$VERSION" \
      --title "v$VERSION" \
      --notes "$CHANGELOG" \
      --target main

    echo "✓ Created GitHub Release v$VERSION"
```

---

## Task 2: Update releasing-kata Skill

**File:** `.claude/skills/releasing-kata/SKILL.md`

### Specific edits:

1. **Line 3 (description):** Remove "publishing to NPM"
   - Before: `"...creating release PRs, or publishing to NPM and the plugin marketplace"`
   - After: `"...creating release PRs, or publishing to the plugin marketplace"`

2. **Line 8:** Change distribution description
   - Before: `"Guide the release process for Kata's dual-channel distribution (NPM + Plugin marketplace)."`
   - After: `"Guide the release process for Kata's plugin marketplace distribution."`

3. **Line 18:** Fix CI description
   - Before: `"6. CI automatically: tests → build → publish NPM → create GitHub Release → push to marketplace"`
   - After: `"6. CI automatically: tests → build → create GitHub Release → push to marketplace"`

4. **Lines 143-147:** Update CI Pipeline section
   - Before: References `publish.yml` triggering and NPM publishing
   - After: Describe `plugin-release.yml` creating GitHub Release + marketplace push

5. **Lines 153-163:** Remove NPM smoke test section (8a)
   - Delete the entire "Automated Smoke Tests" subsection about NPM

6. **Lines 172-179:** Remove "8b. Verify NPM and GitHub Release" NPM parts
   - Remove: `npm view @gannonh/kata version` check
   - Keep: `gh release view vX.Y.Z` check

7. **Lines 231-245:** Update Acceptance Criteria
   - Remove: `NPM shows new version` criterion
   - Remove: `Smoke tests pass against published version` criterion (NPM-specific)

---

## Task 3: Update Troubleshooting Guide

**File:** `.claude/skills/releasing-kata/release-troubleshooting.md`

### Specific edits:

1. **Lines 7-22:** Delete entire "NPM Publish Fails" section

2. **Lines 57-71:** Update "Plugin Workflow Didn't Trigger" section
   - Remove references to `workflow_run` trigger and `publish.yml`
   - Update to reflect that `plugin-release.yml` triggers on push to main

3. **Lines 159-165:** Delete "NPM_TOKEN" setup instructions

---

## Verification

After PR merges to main:

1. **CI should automatically:**
   - Detect version change (1.1.15 → 1.2.0)
   - Create GitHub Release with tag `v1.2.0`
   - Extract changelog notes for v1.2.0
   - Publish to marketplace

2. **Verify:**
   ```bash
   # GitHub Release exists with tag
   gh release view v1.2.0

   # Marketplace updated to 1.2.0
   gh api repos/gannonh/kata-marketplace/contents/.claude-plugin/marketplace.json \
     --jq '.content' | base64 -d | jq '.plugins[0].version'

   # CI workflow succeeded
   gh run list --workflow=plugin-release.yml --limit 1
   ```

---

## Sequence

1. **Task 0** — Fix version numbers (1.1.15 → 1.2.0 in package.json, plugin.json, CHANGELOG, README)
2. **Task 1** — CI changes (enables automated GitHub releases)
3. **Task 2** — Skill updates (documentation accuracy)
4. **Task 3** — Troubleshooting updates (remove NPM content)
5. **Commit all changes** — Create PR for release process updates + version bump
6. **Merge PR** — This triggers CI to create GitHub Release v1.2.0 and publish to marketplace

---

## Future Work (Next Milestone)

Integrate milestone completion with release management:
- Version bump and changelog generation in completing-milestones
- Single unified workflow for "complete milestone = do release"
