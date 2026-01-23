# Kata Distribution System

Kata has two distribution channels: **NPM** (for `npx` installation) and **Plugin** (for Claude Code marketplace).

## Repositories

| Repository | URL | Purpose |
|------------|-----|---------|
| **kata** | https://github.com/gannonh/kata | Source code, NPM package |
| **kata-marketplace** | https://github.com/gannonh/kata-marketplace | Plugin distribution for Claude Code |

## How It Works

### Build System

The build script (`scripts/build.js`) creates two distributions from the source:

```
kata/                          # Source repo
├── scripts/build.js           # Build script
├── dist/
│   ├── plugin/                # Plugin distribution (transformed paths)
│   └── npm/                   # NPM distribution (original paths)
```

**Key difference:** Plugin distribution transforms `@~/.claude/kata/` → `@./kata/` in all markdown files. This is because plugins run from the marketplace directory, not `~/.claude/`.

### NPM Distribution

**Flow:**
1. Developer bumps version in `package.json`
2. Push to `main` branch
3. GitHub Actions (`publish.yml`) detects version change
4. Runs `npm run build:npm` → creates `dist/npm/`
5. Publishes `dist/npm/` to NPM registry

**User installation:**
```bash
npx @gannonh/kata --global   # Install to ~/.claude/
npx @gannonh/kata --local    # Install to ./.claude/
```

### Plugin Distribution

**Flow:**
1. Developer creates GitHub Release (e.g., v0.1.9)
2. GitHub Actions (`plugin-release.yml`) triggers
3. Runs `npm run build:plugin` → creates `dist/plugin/`
4. Pushes `dist/plugin/` contents to `kata-marketplace/plugins/kata/`
5. Updates version in `kata-marketplace/.claude-plugin/marketplace.json`

**User installation:**
```
/plugin marketplace add gannonh/kata-marketplace
/plugin install kata@kata-marketplace
```

## Testing Each Distribution

### Test NPM Distribution Locally

```bash
# 1. Build the NPM distribution
cd /path/to/kata
npm run build:npm

# 2. Link it locally
cd dist/npm
npm link

# 3. Test installation in a new directory
mkdir /tmp/test-npm-install
cd /tmp/test-npm-install
npx kata --local

# 4. Verify installation
ls -la .claude/
# Should see: kata/, agents/, skills/, commands/, hooks/

# 5. Check paths are correct (should have ~/.claude/ references)
grep "@~/.claude/" .claude/skills/kata-executing-phases/SKILL.md
# Should show: @~/.claude/kata/workflows/phase-execute.md

# 6. Cleanup
npm unlink -g @gannonh/kata
rm -rf /tmp/test-npm-install
```

### Test Plugin Distribution Locally

```bash
# 1. Build the plugin distribution
cd /path/to/kata
npm run build:plugin

# 2. Verify paths are transformed
grep "@./kata/" dist/plugin/skills/kata-executing-phases/SKILL.md
# Should show: @./kata/workflows/phase-execute.md

# 3. Verify no old paths remain
grep -r "@~/.claude/" dist/plugin/
# Should return nothing

# 4. Test with Claude Code using --plugin-dir
claude --plugin-dir ./dist/plugin

# 5. In Claude Code, verify commands work
/kata:help
```

### Test Plugin from Marketplace (Production)

In a **fresh Claude Code session** (not in the kata repo):

```
# 1. Add the marketplace
/plugin marketplace add gannonh/kata-marketplace

# 2. Install Kata
/plugin install kata@kata-marketplace

# 3. Verify installation
/plugin list
# Should show: kata@kata-marketplace (version 0.1.9)

# 4. Test commands
/kata:help

# 5. Test a skill (natural language)
"What kata commands are available?"
```

### Test NPM from Registry (Production)

```bash
# In a new directory (not the kata repo)
mkdir /tmp/test-kata
cd /tmp/test-kata

# Install from NPM
npx @gannonh/kata --local

# Start Claude Code and verify
claude
/kata:help
```

## Build Commands

```bash
# Build both distributions
npm run build

# Build plugin only
npm run build:plugin

# Build NPM only
npm run build:npm
```

## CI/CD Workflows

### `.github/workflows/publish.yml` (NPM)

**Triggers:** Push to `main` with version change in `package.json`

**Steps:**
1. Checkout code
2. Build hooks (`npm run build:hooks`)
3. Build NPM distribution (`node scripts/build.js npm`)
4. Publish from `dist/npm/` to NPM
5. Create GitHub Release

### `.github/workflows/plugin-release.yml` (Plugin)

**Triggers:** GitHub Release published

**Steps:**
1. Checkout kata repo
2. Build hooks
3. Build plugin distribution (`node scripts/build.js plugin`)
4. Checkout kata-marketplace repo
5. Copy `dist/plugin/*` to `kata-marketplace/plugins/kata/`
6. Update version in `marketplace.json`
7. Commit and push to kata-marketplace

**Required secret:** `MARKETPLACE_TOKEN` - GitHub PAT with write access to kata-marketplace

## Setting Up MARKETPLACE_TOKEN

1. Go to https://github.com/settings/tokens
2. Generate new token (classic) with `repo` scope
3. Go to https://github.com/gannonh/kata/settings/secrets/actions
4. Add secret named `MARKETPLACE_TOKEN` with the token value

## Directory Structure After Build

### `dist/plugin/` (for marketplace)

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
└── VERSION                   # Current version
```

### `dist/npm/` (for npx)

```
dist/npm/
├── bin/
│   └── install.js           # npx entry point
├── agents/
├── commands/kata/
├── hooks/
├── kata/
│   └── VERSION              # Version file
├── skills/
├── package.json
└── CHANGELOG.md
```

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

### GitHub raw content shows old file

**Cause:** CDN caching (5-10 minute delay)

**Verify actual content:**
```bash
gh api repos/gannonh/kata-marketplace/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d
```

## Version Alignment

Keep versions in sync across:

| File | Location |
|------|----------|
| `package.json` | `kata/package.json` → `"version": "X.Y.Z"` |
| `plugin.json` | `kata/.claude-plugin/plugin.json` → `"version": "X.Y.Z"` |
| `marketplace.json` | `kata-marketplace/.claude-plugin/marketplace.json` → `"version": "X.Y.Z"` |

The build system generates `VERSION` files from `package.json`. The CI updates `marketplace.json` automatically on release.
