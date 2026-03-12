---
name: releasing-kata
description: Use this skill when releasing Kata Desktop or Kata CLI, bumping versions, updating changelogs, or creating release PRs. Triggers include "release", "bump version", "publish", "create release PR", "ship it", "cut a release".
---

# Releasing Kata

Kata has two independently versioned release targets. **Ask the user which target they're releasing** if not clear from context.

| Target | Package | Version Source | Changelog | Tag Format | CI Workflow |
|--------|---------|---------------|-----------|------------|-------------|
| **Desktop** | `@kata-sh/desktop` | `apps/electron/package.json` | `apps/electron/CHANGELOG.md` | `desktop-v0.6.1` | `desktop-release.yml` |
| **CLI** | `@kata-sh/cli` | `apps/cli/package.json` | `apps/cli/CHANGELOG.md` | `cli-v0.1.0` | `cli-release.yml` |

Root `package.json` version is `0.0.0` — never touch it. Each app owns its own version. Desktop and CLI versions are independent and do not need to match.

## Version Semantics

| Type | When | Example |
|------|------|---------|
| `patch` | Bug fixes, small improvements | 0.4.9 → 0.4.10 |
| `minor` | New features, backward compatible | 0.4.9 → 0.5.0 |
| `major` | Breaking changes | 0.4.9 → 1.0.0 |

---

## Desktop Release

The Electron desktop app. Builds for macOS (arm64 + x64), Windows, and Linux.

### Steps

1. **Verify clean state on main**
   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Run pre-release checks**
   ```bash
   bun test
   bun run electron:build
   # Optional: local production build
   cd apps/electron && bun run dist:mac
   ```

3. **Bump version** in `apps/electron/package.json` only

4. **Update `apps/electron/CHANGELOG.md`** with the new version's changes

5. **Create release branch and PR**
   ```bash
   git checkout -b release/desktop-vX.Y.Z
   git add apps/electron/package.json apps/electron/CHANGELOG.md
   git commit -m "chore(release): bump desktop to X.Y.Z"
   git push -u origin release/desktop-vX.Y.Z
   gh pr create --title "Desktop vX.Y.Z" --body "Desktop release vX.Y.Z"
   ```

6. **Merge PR to main** — CI takes over from here

7. **Verify the release**
   ```bash
   gh release view desktop-vX.Y.Z
   gh release view desktop-vX.Y.Z --json assets --jq '.assets[].name'
   ```

### What CI does after merge

`desktop-release.yml` triggers on push to main:
1. Compares `apps/electron/package.json` version against existing `desktop-v*` tags — skips if tag exists
2. Builds for all platforms (macOS arm64/x64, Windows x64, Linux x64)
3. Code signs and notarizes macOS builds
4. Creates GitHub Release with all platform artifacts

Expected artifacts:
- `Kata-Desktop-arm64.dmg` / `Kata-Desktop-arm64.zip` (macOS Apple Silicon)
- `Kata-Desktop-x64.dmg` / `Kata-Desktop-x64.zip` (macOS Intel)
- `Kata-Desktop-x64.exe` (Windows)
- `Kata-Desktop-x64.AppImage` (Linux)

### Desktop acceptance criteria

- [ ] `apps/electron/package.json` version bumped
- [ ] `apps/electron/CHANGELOG.md` updated
- [ ] GitHub Release created with tag `desktop-vX.Y.Z` and all platform artifacts

---

## CLI Release

The terminal coding agent, published to npm as `@kata-sh/cli`.

### Steps

1. **Verify clean state on main**
   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Run pre-release checks**
   ```bash
   cd apps/cli
   npx tsc
   npm test
   ```

3. **Bump version** in `apps/cli/package.json` only

4. **Update `apps/cli/CHANGELOG.md`** with the new version's changes

5. **Create release branch and PR**
   ```bash
   git checkout -b release/cli-vX.Y.Z
   git add apps/cli/package.json apps/cli/CHANGELOG.md
   git commit -m "chore(release): bump cli to X.Y.Z"
   git push -u origin release/cli-vX.Y.Z
   gh pr create --title "CLI vX.Y.Z" --body "CLI release vX.Y.Z"
   ```

6. **Merge PR to main** — CI takes over from here

7. **Verify the release**
   ```bash
   gh release view cli-vX.Y.Z
   npm view @kata-sh/cli version
   ```

### What CI does after merge

`cli-release.yml` triggers on push to main:
1. Compares `apps/cli/package.json` version against existing `cli-v*` tags — skips if tag exists
2. Runs TypeScript check and tests
3. Builds and publishes to npm (`npm publish --access public`)
4. Creates git tag `cli-vX.Y.Z` and GitHub Release

### CLI acceptance criteria

- [ ] `apps/cli/package.json` version bumped
- [ ] `apps/cli/CHANGELOG.md` updated
- [ ] Published to npm (`npm view @kata-sh/cli version`)
- [ ] Git tag `cli-vX.Y.Z` created

---

## Troubleshooting

See `release-troubleshooting.md` for detailed troubleshooting of build failures, code signing, notarization, and CI issues.

Quick checks:
- **CI didn't trigger**: Version in package.json must differ from existing git tags
- **Desktop CI fails**: `gh run list --workflow=desktop-release.yml --limit 3`
- **CLI publish fails**: Ensure `NPM_TOKEN` secret is set and `private: false` in `apps/cli/package.json`
- **macOS notarization fails**: Verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets
