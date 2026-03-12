---
name: releasing-kata
description: Use this skill when releasing Kata Desktop or Kata CLI, bumping versions, updating changelogs, or creating release PRs. Triggers include "release", "bump version", "publish", "create release PR", "ship it", "cut a release".
---

# Releasing Kata

Kata has two independently versioned release targets:

| Target | Package | Version Source | Tag Format | CI Workflow |
|--------|---------|---------------|------------|-------------|
| **Desktop** | `@kata-sh/desktop` | `apps/electron/package.json` only | `desktop-v0.6.1` | `desktop-release.yml` |
| **CLI** | `@kata-sh/cli` | `apps/cli/package.json` only | `cli-v0.1.0` | `cli-release.yml` |

**Root `package.json` version is `0.0.0` — it is not used for releases.** Each app owns its own version.

**Ask the user which target they're releasing** if not clear from context.

---

## Desktop Release

The Electron desktop app. Builds for macOS (arm64 + x64), Windows, and Linux.

### Release Flow

```
1. Pre-release checks
2. Bump version in package.json AND apps/electron/package.json (must match)
3. Update CHANGELOG.md
4. Create release branch and PR
5. Merge PR to main
6. CI: detects version → builds all platforms → code signs/notarizes macOS → creates GitHub Release
```

### Pre-Release Verification

```bash
# Must be on main with clean working directory
git branch --show-current  # → main
git status                 # → clean

# Run checks
bun test
bun run electron:build

# Optional: local production build
cd apps/electron && bun run dist:mac
```

### Version Bump

Only `apps/electron/package.json`:

```bash
# Update apps/electron/package.json → version
# Do NOT touch root package.json
```

### Create Release PR

```bash
git checkout -b release/desktop-vX.Y.Z
git add apps/electron/package.json CHANGELOG.md
git commit -m "chore(release): bump desktop to X.Y.Z"
git push -u origin release/desktop-vX.Y.Z
gh pr create --title "Desktop vX.Y.Z" --body "Desktop release vX.Y.Z"
```

### After Merge

CI triggers `desktop-release.yml`:
1. Detects version change (compares `apps/electron/package.json` to existing `desktop-v*` tags)
2. Builds for all platforms
3. Code signs and notarizes macOS builds
4. Creates GitHub Release with artifacts

Expected artifacts:
- `Kata-Desktop-arm64.dmg` / `Kata-Desktop-arm64.zip` (macOS Apple Silicon)
- `Kata-Desktop-x64.dmg` / `Kata-Desktop-x64.zip` (macOS Intel)
- `Kata-Desktop-x64.exe` (Windows)
- `Kata-Desktop-x64.AppImage` (Linux)

### Verify

```bash
gh release view desktop-vX.Y.Z
gh release view desktop-vX.Y.Z --json assets --jq '.assets[].name'
```

---

## CLI Release

The terminal coding agent, published to npm as `@kata-sh/cli`.

### Release Flow

```
1. Pre-release checks
2. Bump version in apps/cli/package.json
3. Update apps/cli/CHANGELOG.md (if it exists)
4. Commit and push to main
5. CI: detects version → tests → publishes to npm → creates git tag + GitHub Release
```

### Pre-Release Verification

```bash
cd apps/cli
npx tsc        # TypeScript check
npm test       # Run tests
```

### Version Bump

Only one file:

```bash
# apps/cli/package.json → version
```

The CLI version is **independent** of the desktop version. They do not need to match.

### Publish

```bash
git add apps/cli/package.json
git commit -m "chore(release): bump cli to X.Y.Z"
git push
```

CI triggers `cli-release.yml` (on push to main with changes in `apps/cli/`):
1. Checks if `cli-v*` tag exists for the version
2. Runs TypeScript check and tests
3. Builds and publishes to npm (`npm publish --access public`)
4. Creates git tag `cli-vX.Y.Z` and GitHub Release

### Verify

```bash
gh release view cli-vX.Y.Z
npm view @kata-sh/cli version
```

---

## Version Semantics

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, small improvements | 0.4.9 → 0.4.10 |
| `minor` | New features, backward compatible | 0.4.9 → 0.5.0 |
| `major` | Breaking changes | 0.4.9 → 1.0.0 |

## Troubleshooting

- **Desktop CI fails**: Check `gh run list --workflow=desktop-release.yml --limit 3`
- **CLI publish fails**: Ensure `NPM_TOKEN` secret is set, and `private: false` in `apps/cli/package.json`
- **macOS notarization fails**: Verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets
- **Version not detected**: CI compares package.json version against existing git tags. If tag already exists, it skips.

## Acceptance Criteria

**Desktop:**
- [ ] `apps/electron/package.json` version bumped
- [ ] CHANGELOG.md updated
- [ ] GitHub Release created with tag `desktop-vX.Y.Z` and all platform artifacts

**CLI:**
- [ ] `apps/cli/package.json` version bumped
- [ ] Published to npm (`npm view @kata-sh/cli version`)
- [ ] Git tag `cli-vX.Y.Z` created
