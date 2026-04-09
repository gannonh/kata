# Desktop Release

Package: `@kata/desktop`
Version source: `apps/desktop/package.json`
Changelog: `apps/desktop/CHANGELOG.md`
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
   cd apps/desktop
   bun run test              # Vitest with coverage
   bun run build             # esbuild + Vite
   bun run desktop:dist:mac  # Full local build (bundles CLI + Symphony + DMG)
   ```

3. **Bump version** in `apps/desktop/package.json` only

4. **Update `apps/desktop/CHANGELOG.md`** with the new version's changes

5. **Create release branch and PR**

   ```bash
   git checkout -b release/desktop-vX.Y.Z
   git add apps/desktop/package.json apps/desktop/CHANGELOG.md
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

1. Compares `apps/desktop/package.json` version against existing `desktop-v*` tags — skips if tag exists
2. Builds for macOS (arm64 + x64) — bundles CLI runtime, Symphony binary, and Bun
3. Builds for Windows (x64 + arm64) — NSIS installer with bundled runtime
4. Builds for Linux (x64 + arm64) — AppImage and .deb with bundled runtime
5. Code signs and notarizes macOS builds
6. Creates GitHub Release with all platform artifacts

Expected artifacts:

- `Kata-Desktop-arm64.dmg` / `Kata-Desktop-arm64.zip` (macOS Apple Silicon)
- `Kata-Desktop-x64.dmg` / `Kata-Desktop-x64.zip` (macOS Intel)
- `Kata-Desktop-x64-Setup.exe` (Windows x64)
- `Kata-Desktop-arm64-Setup.exe` (Windows ARM64)
- `Kata-Desktop-x64.AppImage` / `Kata-Desktop-x64.deb` (Linux x64)
- `Kata-Desktop-arm64.AppImage` / `Kata-Desktop-arm64.deb` (Linux ARM64)

## Bundled runtime

The packaged app is self-contained. The build pipeline bundles:

- `Contents/Resources/kata` — CLI launcher script
- `Contents/Resources/kata-runtime/` — Kata CLI runtime (dist + pkg + node_modules)
- `Contents/Resources/bun/bun` — Bun binary for the target architecture
- `Contents/Resources/symphony` — Symphony orchestrator binary (Rust release build)

## Acceptance criteria

- [ ] `apps/desktop/package.json` version bumped
- [ ] `apps/desktop/CHANGELOG.md` updated
- [ ] Local `bun run desktop:dist:mac` succeeds and app launches
- [ ] GitHub Release created with tag `desktop-vX.Y.Z` and macOS/Windows/Linux artifacts
