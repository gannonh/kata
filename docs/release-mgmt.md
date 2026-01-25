# Release Management

This document covers the complete release process for Kata, including CI/CD workflows, distribution channels, testing procedures, and troubleshooting.

## Overview

Kata has two distribution channels:

| Channel | Repository | Installation |
|---------|-----------|--------------|
| **NPM** | [gannonh/kata](https://github.com/gannonh/kata) | `npx @gannonh/kata` |
| **Plugin** | [gannonh/kata-marketplace](https://github.com/gannonh/kata-marketplace) | `/plugin install kata@gannonh-kata-marketplace` |

## Release Flow

```
Merge PR to main
       ↓
publish.yml triggers (version change detected)
       ↓
Run tests → Build → Publish to NPM → Create GitHub Release (v1.0.1)
       ↓
plugin-release.yml triggers (workflow_run)
       ↓
Build plugin → Push to kata-marketplace
       ↓
Both distributions live
```

## Version Alignment

Keep versions in sync across:

| File | Location |
|------|----------|
| `package.json` | `kata/package.json` → `"version": "X.Y.Z"` |
| `plugin.json` | `kata/.claude-plugin/plugin.json` → `"version": "X.Y.Z"` |
| `marketplace.json` | `kata-marketplace/.claude-plugin/marketplace.json` → `"version": "X.Y.Z"` (auto-updated by CI) |

The build system generates `VERSION` files from `package.json`. The CI updates `marketplace.json` automatically on release.

---

## Creating a Release

### 1. Bump Version

Update both files:

```bash
# package.json
npm version patch  # or minor/major

# plugin.json - manually match the version
```

### 2. Update CHANGELOG

Add entry to `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [1.0.2] - 2026-01-24

### Added
- New feature description

### Fixed
- Bug fix description
```

### 3. Create PR and Merge

```bash
git checkout -b release/v1.0.2
git add package.json .claude-plugin/plugin.json CHANGELOG.md
git commit -m "chore: bump version to 1.0.2"
git push -u origin release/v1.0.2
gh pr create --title "Release v1.0.2"
gh pr merge --merge --delete-branch
```

### 4. Monitor CI

```bash
gh run list --limit 5
gh run watch <run-id>
```

---

## CI/CD Workflows

### `.github/workflows/publish.yml` (NPM)

**Triggers:** Push to `main` with version change in `package.json`

**Steps:**
1. Checkout code
2. Get package version, compare to NPM registry
3. If version changed:
   - Run tests (`npm test`)
   - Build hooks (`npm run build:hooks`)
   - Build NPM distribution (`node scripts/build.js npm`)
   - Validate build artifacts
   - Publish from `dist/npm/` to NPM
   - Create GitHub Release (tagged `vX.Y.Z`)

### `.github/workflows/plugin-release.yml` (Plugin)

**Triggers:** `workflow_run` completion of `publish.yml`

**Steps:**
1. Check if release exists for current version
2. If release exists:
   - Run tests
   - Build hooks
   - Build plugin distribution (`node scripts/build.js plugin`)
   - Validate plugin build
   - Checkout kata-marketplace repo
   - Copy `dist/plugin/*` to `kata-marketplace/plugins/kata/`
   - Update version in `marketplace.json`
   - Commit and push to kata-marketplace

**Required secrets:**
- `NPM_TOKEN` - NPM publish token
- `MARKETPLACE_TOKEN` - GitHub PAT with write access to kata-marketplace

---

## Build System

The build script (`scripts/build.js`) creates two distributions from the source:

```
kata/                          # Source repo
├── scripts/build.js           # Build script
├── dist/
│   ├── plugin/                # Plugin distribution (transformed paths)
│   └── npm/                   # NPM distribution (original paths)
```

**Key difference:** Plugin distribution transforms `@~/.claude/kata/` → `@./kata/` in all markdown files. This is because plugins run from the marketplace directory, not `~/.claude/`.

### Build Commands

```bash
npm run build          # Build both distributions
npm run build:plugin   # Build plugin only
npm run build:npm      # Build NPM only
npm run build:hooks    # Build hooks only (CJS → ESM)
```

### Directory Structure After Build

**`dist/plugin/` (for marketplace):**
```
dist/plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── agents/                   # Subagent definitions
├── commands/kata/            # Slash commands
├── hooks/                    # Hook scripts
├── kata/                     # Workflows, templates, references
├── skills/                   # Skill definitions
├── CHANGELOG.md
└── VERSION
```

**`dist/npm/` (for npx):**
```
dist/npm/
├── bin/
│   └── install.js           # npx entry point
├── agents/
├── commands/kata/
├── hooks/
├── kata/
│   └── VERSION
├── skills/
├── package.json
└── CHANGELOG.md
```

---

## Testing

### Automated Tests

```bash
# Build validation tests (runs in CI)
npm test

# Smoke tests (post-release)
npm run test:smoke

# Smoke tests with specific version
KATA_VERSION=1.0.1 npm run test:smoke

# Smoke tests with Claude CLI integration
TEST_CLI=1 npm run test:smoke
```

### Local Build Testing

**Test NPM distribution:**
```bash
npm run build:npm
cd dist/npm && npm link
mkdir /tmp/test-npm && cd /tmp/test-npm
npx kata --local
ls -la .claude/  # Verify: kata/, agents/, skills/, commands/, hooks/
grep "@~/.claude/" .claude/skills/kata-executing-phases/SKILL.md  # Should match
npm unlink -g @gannonh/kata
```

**Test plugin distribution:**
```bash
npm run build:plugin
grep "@./kata/" dist/plugin/skills/kata-executing-phases/SKILL.md  # Should match
grep -r "@~/.claude/" dist/plugin/  # Should return nothing
claude --plugin-dir ./dist/plugin
/kata:providing-help
```

### Post-Release Smoke Tests

#### NPX Install Smoke Test

```bash
cd ~/dev/oss/kata-burner

# Create fresh test directory
mkdir kata-npx-test && cd kata-npx-test

# Test NPX install
npx @gannonh/kata@1.0.1 --local

# Verify files installed
ls -la .claude/
# Expected: kata/, agents/, skills/, commands/, hooks/

# Verify version
cat .claude/kata/VERSION
# Expected: 1.0.1

# Start Claude Code
claude

# In Claude Code, verify commands work
/kata:providing-help
/kata:showing-whats-new

# Cleanup
cd .. && rm -rf kata-npx-test
```

#### Plugin Install Smoke Test

```bash
cd ~/dev/oss/kata-burner

# Create fresh test directory
mkdir kata-plugin-test && cd kata-plugin-test

# Start Claude Code
claude

# In Claude Code:
/plugin marketplace add gannonh/kata-marketplace
/plugin install kata@gannonh-kata-marketplace

# Verify plugin loaded
/kata:providing-help
/kata:showing-whats-new

# Verify version matches release
# Check statusline shows plugin update method (not npx)

# Cleanup
cd .. && rm -rf kata-plugin-test
```

### Verification Checklist

- [ ] NPX: `npx @gannonh/kata@X.Y.Z` installs without errors
- [ ] NPX: `/kata:providing-help` shows all commands
- [ ] NPX: VERSION file shows correct version
- [ ] Plugin: Marketplace add succeeds
- [ ] Plugin: Plugin install succeeds
- [ ] Plugin: `/kata:providing-help` shows all commands
- [ ] Plugin: No `~/.claude/` path errors in plugin mode
- [ ] Both: `/kata:showing-whats-new` shows release changelog

---

## Troubleshooting

### Plugin paths not resolving

**Symptom:** `@./kata/workflows/...` file not found

**Cause:** Path transformation didn't run or plugin installed from wrong source

**Fix:** Rebuild with `npm run build:plugin` and verify paths:
```bash
grep -r "@~/.claude/" dist/plugin/  # Should return nothing
grep "@./kata/" dist/plugin/skills/kata-executing-phases/SKILL.md  # Should match
```

### NPM publish fails

**Symptom:** CI fails at publish step

**Check:**
1. `NPM_TOKEN` secret is set in GitHub repo
2. Version in `package.json` is higher than published version
3. `dist/npm/package.json` exists after build

### Plugin marketplace not updating

**Symptom:** Old version still shows after release

**Check:**
1. `MARKETPLACE_TOKEN` secret is set
2. GitHub Release was published (not draft)
3. Check kata-marketplace repo for recent commits
4. Verify `workflow_run` trigger fired: `gh run list --workflow=plugin-release.yml`

### Plugin workflow didn't trigger

**Symptom:** NPM published but plugin-release.yml never ran

**Cause:** GitHub doesn't trigger workflows on releases created by workflows using `GITHUB_TOKEN`

**Solution:** The workflow uses `workflow_run` trigger instead of `release` trigger. If it still fails:
```bash
# Manually trigger (if workflow allows)
gh workflow run plugin-release.yml
```

### GitHub raw content shows old file

**Cause:** CDN caching (5-10 minute delay)

**Verify actual content:**
```bash
gh api repos/gannonh/kata-marketplace/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d
```

### Tests fail with glob pattern

**Symptom:** CI can't find test files with `tests/**/*.test.js`

**Fix:** Use explicit paths in package.json:
```json
"test": "node --test ./tests/build.test.js ./tests/smoke.test.js"
```

---

## Setting Up Secrets

### NPM_TOKEN

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Generate new Automation token
3. Go to https://github.com/gannonh/kata/settings/secrets/actions
4. Add secret named `NPM_TOKEN`

### MARKETPLACE_TOKEN

1. Go to https://github.com/settings/tokens
2. Generate new token (classic) with `repo` scope
3. Go to https://github.com/gannonh/kata/settings/secrets/actions
4. Add secret named `MARKETPLACE_TOKEN`
