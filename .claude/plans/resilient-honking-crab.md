# Plan: Update Release Process and Ship v1.1.0

## Problem Statement

The releasing-kata skill is outdated. It was built for dual-channel distribution (NPM + Plugin), but Phase 7 deprecated NPX. The current release workflow has these issues:

1. **Skill references deleted workflows** — publish.yml was deleted, but skill still describes NPM publish flow
2. **NPM publish is now deprecation-only** — bin/install.js just prints a message, no actual installation
3. **Release workflow is plugin-centric** — plugin-release.yml handles everything on push to main
4. **Milestone completion ran incorrect workflow** — I committed directly to main instead of creating a release PR

## Current State

- **package.json version**: 1.1.15 (incremental patches during development)
- **plugin.json version**: 1.1.15 (matches)
- **CHANGELOG.md**: Has v1.1.0 entry (just added)
- **Workflows**: Only plugin-release.yml remains (triggers on push to main)
- **bin/install.js**: 17-line deprecation stub

## What the Release Process Should Be (Plugin-Only)

### Updated Flow

```
1. Run tests locally
2. Bump version in package.json AND plugin.json to milestone version (e.g., 1.1.0)
3. Update CHANGELOG.md (already done)
4. Create release branch and PR
5. Merge PR to main
6. CI automatically: tests → build → push plugin to marketplace
7. Manually: Create GitHub Release with tag
8. Optionally: npm publish (deprecation package only)
```

### Key Changes from Old Process

| Old (Dual-Channel) | New (Plugin-Only) |
|-------------------|-------------------|
| NPM + Plugin | Plugin only |
| publish.yml triggers on version change | plugin-release.yml triggers on push to main |
| NPM publish is real installation | NPM publish is deprecation message |
| GitHub Release auto-created | GitHub Release manually created |

## Plan

### Task 1: Update releasing-kata Skill

**File**: `.claude/skills/releasing-kata/SKILL.md`

**Changes**:
- Remove references to NPM distribution as primary channel
- Update flow to reflect plugin-only workflow
- Mark NPM publish as optional (deprecation stub only)
- Update acceptance criteria
- Remove "Verify NPX install" steps
- Update troubleshooting references

### Task 2: Update release-troubleshooting.md

**File**: `.claude/skills/releasing-kata/release-troubleshooting.md`

**Changes**:
- Remove NPM-specific troubleshooting
- Update to plugin-centric issues
- Keep marketplace troubleshooting

### Task 3: Execute v1.1.0 Release

**Steps**:
1. Bump version to 1.1.0 in package.json and plugin.json (currently 1.1.15)
2. Create release branch: `release/v1.1.0`
3. Commit version bump
4. Create PR with release notes
5. Merge PR to main
6. Verify plugin-release.yml runs successfully
7. Create GitHub Release with tag v1.1.0
8. (Optional) npm publish for deprecation message

## Files to Modify

1. `.claude/skills/releasing-kata/SKILL.md` — Main skill update
2. `.claude/skills/releasing-kata/release-troubleshooting.md` — Troubleshooting update
3. `package.json` — Version bump to 1.1.0
4. `.claude-plugin/plugin.json` — Version bump to 1.1.0

## Verification

1. **Skill accuracy**: Read updated skill, verify it matches actual workflow
2. **Version sync**: Confirm package.json and plugin.json both say 1.1.0
3. **PR creation**: Release PR created with proper title and body
4. **CI success**: plugin-release.yml completes successfully after merge
5. **Marketplace update**: `gh api` shows v1.1.0 in marketplace
6. **GitHub Release**: Tag v1.1.0 exists with release notes
7. **Plugin install test**: `/plugin install kata@gannonh-kata-marketplace` works

## Questions for User

None — the path forward is clear:
1. Update the skill to match reality (plugin-only)
2. Execute the release using the corrected process
