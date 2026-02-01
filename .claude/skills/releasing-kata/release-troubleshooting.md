# Release Troubleshooting

Common issues and solutions for the Kata release process.

## CI Workflow Failures

### Tests Fail in CI

**Symptom:** Tests pass locally but fail in CI

**Check:**
1. Run the exact test command CI uses: `npm test`
2. Check for environment-specific issues
3. Verify all test files are committed

```bash
# Run full test suite locally
npm test && npm run test:smoke
```

## Plugin Marketplace Issues

### Marketplace Not Updating

**Symptom:** Old version still shows after release

**Check:**
1. `MARKETPLACE_TOKEN` secret is set with `repo` scope
2. GitHub Release was published (not draft)
3. Check kata-marketplace repo for recent commits

```bash
# Verify workflow ran
gh run list --workflow=plugin-release.yml --limit 3

# Check marketplace repo directly
gh api repos/gannonh/kata-marketplace/commits --jq '.[0] | "\(.sha[0:7]) \(.commit.message)"'
```

### Plugin Workflow Didn't Trigger

**Symptom:** Version bumped but plugin-release.yml never ran

**Check:**
1. Workflow triggers on push to main — was PR merged?
2. Version in plugin.json differs from marketplace version

```bash
# Manually trigger the workflow
gh workflow run plugin-release.yml

# Check recent workflow runs
gh run list --workflow=plugin-release.yml --limit 3
```

### CDN Caching Delay

**Symptom:** `gh api` shows new version but raw.githubusercontent.com shows old

**Cause:** GitHub CDN caches raw content for 5-10 minutes

**Verify actual content (bypasses CDN):**
```bash
gh api repos/gannonh/kata-marketplace/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d | jq '.plugins[0].version'
```

## Version Mismatch Errors

### Package and Plugin Versions Don't Match

**Symptom:** Tests fail with version mismatch error

**Fix:** Ensure both files have identical versions:

```bash
# Check both versions
echo "package.json: $(jq -r '.version' package.json)"
echo "plugin.json:  $(jq -r '.version' .claude-plugin/plugin.json)"

# They must be identical
```

### VERSION File Shows Wrong Version

**Symptom:** Built VERSION file doesn't match package.json

**Cause:** Build wasn't run after version bump

**Fix:**
```bash
npm run build
cat dist/plugin/VERSION
```

## Path Transformation Issues

### Plugin Paths Not Resolving

**Symptom:** `@./kata/workflows/...` file not found in plugin mode

**Cause:** Path transformation in build.js not working correctly

**Verify:**
```bash
# Plugin should have @./kata/ paths (not @~/.claude/kata/)
grep "@./kata/" dist/plugin/skills/kata-execute-phase/SKILL.md

# Should return nothing
grep -r "@~/.claude/" dist/plugin/
```

## Build Issues

### Tests Fail with Glob Pattern

**Symptom:** CI can't find test files with `tests/**/*.test.js`

**Fix:** Use explicit paths in package.json:
```json
"test": "node --test ./tests/build.test.js"
```

### Build Artifacts Missing

**Symptom:** dist/ directory doesn't contain expected files

**Fix:**
```bash
# Clean and rebuild
rm -rf dist/
npm run build

# Verify structure
ls -la dist/plugin/
```

## Secrets Setup

If you need to set up secrets for a fresh repository:

### MARKETPLACE_TOKEN

1. Go to https://github.com/settings/tokens
2. Generate new token (classic) with `repo` scope
3. Go to https://github.com/gannonh/kata/settings/secrets/actions
4. Add secret named `MARKETPLACE_TOKEN`
