# Desktop Release

Package: `@kata-sh/desktop`
Version source: `apps/electron/package.json`
Changelog: `apps/electron/CHANGELOG.md`
Tag format: `desktop-vX.Y.Z`
CI workflow: `desktop-release.yml`

## Steps

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

6. **When approved, merge PR to main** — CI takes over from here

7. **Verify the release**
   ```bash
   gh release view desktop-vX.Y.Z
   gh release view desktop-vX.Y.Z --json assets --jq '.assets[].name'
   ```

## What CI does after merge

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

## Acceptance criteria

- [ ] `apps/electron/package.json` version bumped
- [ ] `apps/electron/CHANGELOG.md` updated
- [ ] GitHub Release created with tag `desktop-vX.Y.Z` and all platform artifacts
