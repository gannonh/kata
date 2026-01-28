# Phase 01 Plan 02: Release Workflow Integration Summary

## Overview

Release workflow integrated into completing-milestones skill, enabling users to trigger version detection, changelog generation, and GitHub Release creation from milestone completion.

**One-liner:** Release workflow with version detection, changelog generation, dry-run preview, and GitHub Release creation via completing-milestones skill.

## Frontmatter

```yaml
phase: 01-release-automation
plan: 02
subsystem: skills/completing-milestones
tags: [release, changelog, version-detection, github-release]

requires:
  - 01-01 (version-detector.md, changelog-generator.md reference files)
provides:
  - Release workflow integration in completing-milestones skill
  - User-facing release option during milestone completion
affects:
  - Users completing milestones can now opt into release workflow

tech-stack:
  added: []
  patterns:
    - "@-reference progressive disclosure for release functions"
    - "AskUserQuestion for release workflow gate"
    - "Dry-run preview before applying changes"

key-files:
  created: []
  modified:
    - skills/completing-milestones/SKILL.md
    - skills/completing-milestones/references/milestone-complete.md

decisions:
  - "Release workflow offered as step 0.5 (after pre-flight, before audit check)"
  - "Uses @-references to version-detector.md and changelog-generator.md (no inline duplication)"
  - "REL-03 satisfied by existing plugin-release.yml (no changes needed)"

metrics:
  duration: 2 min
  completed: 2026-01-28
```

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Update SKILL.md with release integration | e9fd810 | skills/completing-milestones/SKILL.md |
| 2 | Add release_workflow step to milestone-complete.md | 38b5ab0 | skills/completing-milestones/references/milestone-complete.md |
| 3 | Verify CI publish trigger exists (REL-03) | (verification only) | .github/workflows/plugin-release.yml |

## Changes Made

### Task 1: SKILL.md Release Integration

**Files modified:** `skills/completing-milestones/SKILL.md`

1. **Added release references to execution_context:**
   - `@./references/version-detector.md (version detection functions)`
   - `@./references/changelog-generator.md (changelog generation functions)`

2. **Updated description with release triggers:**
   - Added: "release version", "create release", "ship milestone"

3. **Added step 0.5 (release workflow gate):**
   - AskUserQuestion with options: "Yes, run release workflow", "Yes, dry-run first", "No, just archive"
   - Routes to release_workflow step in milestone-complete.md if selected

4. **Updated success_criteria:**
   - CHANGELOG.md updated (if release)
   - Version bumped in package.json and plugin.json (if release)
   - GitHub Release created or instructions provided

### Task 2: release_workflow Step in milestone-complete.md

**Files modified:** `skills/completing-milestones/references/milestone-complete.md`

Added `<step name="release_workflow">` with:

1. **Version detection (REL-02):**
   - Uses @./version-detector.md reference
   - detect_version_bump from conventional commits
   - calculate_next_version for semver bump

2. **Changelog generation (REL-01):**
   - Uses @./changelog-generator.md reference
   - get_commits_by_type for categorization
   - generate_changelog_entry in Keep a Changelog format

3. **Dry-run preview (REL-04):**
   - Shows current version, bump type, next version
   - Displays generated changelog entry
   - Lists files to update
   - Stops with "DRY RUN COMPLETE" if dry-run mode

4. **User confirmation:**
   - AskUserQuestion: "Yes, update files", "Edit changelog first", "Cancel"

5. **Apply changes:**
   - update_versions for package.json and plugin.json
   - Prepend changelog entry to CHANGELOG.md

6. **GitHub Release (REL-03):**
   - If pr_workflow=true: Show instructions for post-merge release
   - If pr_workflow=false: Create release directly via `gh release create`
   - Note about existing plugin-release.yml auto-publish

7. **Updated git_commit_milestone:**
   - Stage release files (package.json, plugin.json, CHANGELOG.md) when RELEASE_RAN=true
   - Different commit messages for release vs archive-only

### Task 3: REL-03 Verification

**Files verified:** `.github/workflows/plugin-release.yml`

Existing CI workflow already satisfies REL-03:
- Triggers on push to main
- Reads version from .claude-plugin/plugin.json
- Creates GitHub Release if version changed
- Publishes to kata-marketplace repository

No changes needed. Note added to release_workflow step documenting this.

## Requirements Satisfied

| Requirement | Status | Implementation |
| ----------- | ------ | -------------- |
| REL-01 | Satisfied | Changelog generation via @./changelog-generator.md reference |
| REL-02 | Satisfied | Version detection via @./version-detector.md reference |
| REL-03 | Satisfied | Existing plugin-release.yml handles CI publish |
| REL-04 | Satisfied | Dry-run mode shows preview without applying changes |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

```
OK: SKILL.md has version-detector ref
OK: SKILL.md has changelog-generator ref
OK: release_workflow step added
OK: version-detector @-reference
OK: changelog-generator @-reference
OK: gh release command
OK: dry run mode
REL-01: Changelog generation - OK
REL-02: Version detection - OK
REL-03: CI publish - OK (existing workflow)
REL-04: Dry run - OK
```

## Next Phase Readiness

Phase 1 (Release Automation) is now complete with both plans executed:
- Plan 01: Created version-detector.md and changelog-generator.md reference files
- Plan 02: Integrated release workflow into completing-milestones skill

All four requirements (REL-01 through REL-04) are satisfied. Users can now:
1. Complete a milestone with `/kata:complete-milestone`
2. Opt into release workflow when prompted
3. Preview changes with dry-run before committing
4. Have version files updated and changelog generated automatically
5. Create GitHub Release (directly or after PR merge)
6. CI auto-publishes to marketplace after GitHub Release

Ready to proceed to Phase 2 (Workflow Documentation).
