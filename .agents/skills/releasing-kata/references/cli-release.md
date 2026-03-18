# CLI Release

Package: `@kata-sh/cli`
Version source: `apps/cli/package.json`
Changelog: `apps/cli/CHANGELOG.md`
Tag format: `cli-vX.Y.Z`
CI workflow: `cli-release.yml`

## Steps

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

5. **Update `apps/cli/src/resources/AGENTS.md`** with any relevant changes to agent capabilities or instructions

6. **Create release branch and PR**

   ```bash
   git checkout -b release/cli-vX.Y.Z
   git add apps/cli/package.json apps/cli/CHANGELOG.md
   git commit -m "chore(release): bump cli to X.Y.Z"
   git push -u origin release/cli-vX.Y.Z
   gh pr create --title "CLI vX.Y.Z" --body "CLI release vX.Y.Z"
   ```

7. **When approved, merge PR to main** — CI takes over from here

8. **Verify the release**

   ```bash
   gh release view cli-vX.Y.Z
   npm view @kata-sh/cli version
   ```

## What CI does after merge

`cli-release.yml` triggers on push to main:

1. Compares `apps/cli/package.json` version against existing `cli-v*` tags — skips if tag exists
2. Runs TypeScript check and tests
3. Builds and publishes to npm (`npm publish --access public`)
4. Creates git tag `cli-vX.Y.Z` and GitHub Release

## Acceptance criteria

- [ ] `apps/cli/package.json` version bumped
- [ ] `apps/cli/CHANGELOG.md` updated
- [ ] Published to npm (`npm view @kata-sh/cli version`)
- [ ] Git tag `cli-vX.Y.Z` created
