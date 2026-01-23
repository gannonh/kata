# Handoff: Build System for Dual Distribution

## Session Summary

Implemented build system for dual distribution (NPM + Plugin). Currently testing plugin distribution locally and finding issues.

## What Was Completed

### Files Created
- `scripts/build.js` - Main build script with path transformation
- `.github/workflows/plugin-release.yml` - CI for plugin releases
- `docs/DISTRIBUTION.md` - Full documentation
- `.gitignore` - Added `dist/`

### Files Modified
- `package.json` - Added build scripts (`build`, `build:plugin`, `build:npm`)
- `.github/workflows/publish.yml` - Now builds from `dist/npm/`

### External Changes
- Pushed built plugin to `gannonh/kata-marketplace` repo
- Updated `marketplace.json` to use `"source": "./plugins/kata"` (local source)
- `MARKETPLACE_TOKEN` secret added to kata repo

## Test Results

### NPM Distribution - PASSED ✓
```bash
npm run build:npm
cd dist/npm && npm link
cd /tmp/test-npm-install && npx kata --local
# All files installed correctly
# Paths transformed to ./.claude/kata/... (correct for local)
```

### Plugin Distribution - IN PROGRESS (ISSUES FOUND)
```bash
npm run build:plugin
# Paths transformed to @./kata/... (verified)
# No @~/.claude/ references remain (verified)

# Testing with:
claude --plugin-dir /Users/gannonhall/dev/oss/kata/dist/plugin
```

## Issues Found

### Issue 1: VERSION path hardcoded to `~/.claude/kata/VERSION`

**Symptom:**
```
/kata:whats-new
Bash(cat ~/.claude/kata/VERSION 2>/dev/null)
Error: Exit code 1
Installed version: Unknown
```

**Root cause:** Skills reference `~/.claude/kata/VERSION` but in plugin context, VERSION is at `./kata/VERSION` relative to plugin root.

**Files affected:**
- `skills/kata-showing-whats-new/SKILL.md`
- `skills/kata-updating/SKILL.md`

### Issue 2: Update guidance is NPM-specific

**Symptom:** When version unknown, skill suggests:
```
To fix: npx @gannonh/kata --global
```

**Problem:** For plugin users, this is wrong. They should use `/plugin update kata@kata-marketplace`.

**Solution needed:**
1. Detect if running as plugin vs NPM install
2. For plugins: suggest `/plugin update`
3. For NPM: suggest `npx @gannonh/kata`
4. Consider removing `/kata:update` command entirely for plugins (Claude Code handles plugin updates)

### Issue 3: /kata:update should be excluded from plugin distribution

**Symptom:**
```
/kata:update
Bash(cat ~/.claude/kata/VERSION 2>/dev/null)
Error: Exit code 1
Bash(npm view @gannonh/kata version 2>/dev/null)
0.1.8
Installed version: Unknown (no VERSION file)
```

Same VERSION path issue, but bigger problem: **plugins have their own update mechanism**.

**Solution:**
1. Exclude `/kata:update` command from plugin build entirely
2. Exclude `skills/kata-updating/` from plugin build
3. Plugin users should use `/plugin update kata@kata-marketplace`

**Files to exclude in plugin build:**
- `commands/kata/update.md`
- `skills/kata-updating/`

### Issue 4: Skills need plugin-aware paths

The build system transforms `@~/.claude/kata/` → `@./kata/` but hardcoded bash commands like `cat ~/.claude/kata/VERSION` are NOT transformed.

**Options:**
1. Transform all `~/.claude/kata/` references (including in bash) during build
2. Use environment variable like `$KATA_ROOT`
3. Use `$CLAUDE_PLUGIN_ROOT` (available in plugin context)

## Known Issue Areas to Check

1. **Path resolution** - Does `@./kata/...` resolve correctly from plugin context?
2. **Plugin manifest** - Is `.claude-plugin/plugin.json` correct?
3. **Hooks** - Are hooks loading from plugin directory?
4. **Skills** - Are skills being discovered?
5. **Commands** - Do `/kata:*` commands appear?

## Commands for Testing

```bash
# Rebuild plugin
npm run build:plugin

# Test locally
claude --plugin-dir /Users/gannonhall/dev/oss/kata/dist/plugin

# In Claude Code:
/kata:help
/help  # Check if kata commands listed
```

## What's Left

1. **Fix plugin distribution issues** (currently blocked)
2. Test plugin from marketplace (`/plugin install kata@kata-marketplace`)
3. Test NPM from registry (after version bump and publish)
4. Create SUMMARY.md for this plan

## Key Files

| File | Purpose |
|------|---------|
| `scripts/build.js` | Build script - modify if path transform is wrong |
| `dist/plugin/` | Built plugin output |
| `dist/npm/` | Built NPM output |
| `docs/DISTRIBUTION.md` | Full documentation |

## Path Transformation Logic

In `scripts/build.js`:
```javascript
function transformPluginPaths(content) {
  return content.replace(/@~\/\.claude\/kata\//g, '@./kata/');
}
```

This transforms `@~/.claude/kata/workflows/...` → `@./kata/workflows/...`

**LIMITATION:** Only transforms `@~/.claude/kata/` references. Does NOT transform:
- Bash commands: `cat ~/.claude/kata/VERSION`
- Other hardcoded paths in skill content

**Fix needed:** Either:
1. Expand regex to transform all `~/.claude/kata/` patterns
2. Or use `$CLAUDE_PLUGIN_ROOT` variable in skills (available in plugin context)

## Repos

- **kata**: https://github.com/gannonh/kata (source)
- **kata-marketplace**: https://github.com/gannonh/kata-marketplace (plugin distribution)

## Resume Command

```
Resume from .planning/phases/02-marketplace-distribution/HANDOFF.md

Issues found with plugin distribution:
1. VERSION path hardcoded to ~/.claude/kata/VERSION (doesn't work in plugin context)
2. Update suggestions are NPM-specific, not plugin-aware
3. /kata:update command should be EXCLUDED from plugin (plugins use /plugin update)
4. Build system only transforms @~/.claude/kata/ refs, not bash commands

Next steps:
1. Modify scripts/build.js to EXCLUDE from plugin build:
   - commands/kata/update.md
   - skills/kata-updating/
2. Fix path transformation to include bash commands OR use $CLAUDE_PLUGIN_ROOT
3. Make whats-new skill plugin-aware (show plugin update instructions)
4. Rebuild plugin and re-test
5. Push fixed plugin to kata-marketplace
```
