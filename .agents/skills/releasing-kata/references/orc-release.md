# Orchestrator Release

Package: `@kata-sh/orc`
Version source: `apps/orchestrator/package.json`
Changelog: `apps/orchestrator/CHANGELOG.md`
Tag format: `orc-vX.Y.Z`
CI workflow: `orc-release.yml`

## Steps

1. **Verify clean state on main**
   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Run pre-release checks**
   ```bash
   cd apps/orchestrator
   npm test
   ```

3. **Bump version** in `apps/orchestrator/package.json` only

4. **Update `apps/orchestrator/CHANGELOG.md`** with the new version's changes

5. **Create release branch and PR**
   ```bash
   git checkout -b release/orc-vX.Y.Z
   git add apps/orchestrator/package.json apps/orchestrator/CHANGELOG.md
   git commit -m "chore(release): bump orchestrator to X.Y.Z"
   git push -u origin release/orc-vX.Y.Z
   gh pr create --title "Orchestrator vX.Y.Z" --body "Orchestrator release vX.Y.Z"
   ```

6. **When approved, merge PR to main** — CI takes over from here

7. **Verify the release**
   ```bash
   gh release view orc-vX.Y.Z
   npm view @kata-sh/orc version
   ```

## What CI does after merge

`orc-release.yml` triggers on push to main when files under `apps/orchestrator/**` change:
1. Compares `apps/orchestrator/package.json` version against existing `orc-v*` tags — skips if tag exists
2. Runs `npm test`
3. Publishes to npm (`npm publish --access public`) — `prepublishOnly` runs `build:hooks` automatically
4. Creates git tag `orc-vX.Y.Z` and GitHub Release

## Acceptance criteria

- [ ] `apps/orchestrator/package.json` version bumped
- [ ] `apps/orchestrator/CHANGELOG.md` updated
- [ ] Published to npm (`npm view @kata-sh/orc version`)
- [ ] Git tag `orc-vX.Y.Z` created
