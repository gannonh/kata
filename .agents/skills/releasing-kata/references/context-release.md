# Context Release

Package: `@kata/context`
Version source: `apps/context/package.json`
Changelog: `apps/context/CHANGELOG.md`
Tag format: `context-vX.Y.Z`
CI workflow: `context-release.yml`

## Steps

1. **Verify clean state on main**

   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Run pre-release checks**

   ```bash
   cd apps/context
   npx tsc --noEmit
   bun test test/
   ```

3. **Bump version** in `apps/context/package.json` only

4. **Update `apps/context/CHANGELOG.md`** with the new version's changes

5. **Create release branch and PR**

   ```bash
   git checkout -b release/context-vX.Y.Z
   git add apps/context/package.json apps/context/CHANGELOG.md
   git commit -m "chore(release): bump context to X.Y.Z"
   git push -u origin release/context-vX.Y.Z
   gh pr create --title "Context vX.Y.Z" --body "Context release vX.Y.Z"
   ```

6. **When approved, merge PR to main** — CI takes over from here

7. **Verify the release**

   ```bash
   gh release view context-vX.Y.Z
   npm view @kata/context version
   ```

## What CI does after merge

`context-release.yml` triggers on push to main when `apps/context/**` changes:

1. Compares `apps/context/package.json` version against existing `context-v*` tags — skips if tag exists
2. Runs TypeScript check and tests
3. Builds with tsc and publishes to npm (`npm publish --access public`)
4. Creates git tag `context-vX.Y.Z` and GitHub Release

## Acceptance criteria

- [ ] `apps/context/package.json` version bumped
- [ ] `apps/context/CHANGELOG.md` updated
- [ ] Published to npm (`npm view @kata/context version`)
- [ ] Git tag `context-vX.Y.Z` created
