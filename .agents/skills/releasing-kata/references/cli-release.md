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

4. **Update `apps/cli/CHANGELOG.md`** and `apps/cli/README.md` with the new version's changes

5. **Update essential documentation:**
   1. Preferences Reference: `apps/cli/src/resources/extensions/kata/docs/preferences-reference.md` - Documents every preference field, its type, default, and behavior. Update when adding, removing, or renaming a preference field, changing a field's type or default, or changing how a preference affects runtime behavior.
   2. Preferences Template: `apps/cli/src/resources/extensions/kata/templates/preferences.md` - YAML frontmatter template copied into new projects on init. Update when adding a new field (add with its default), removing a field, or changing a default value. Keep template and reference in sync: every field in the template should be documented in the reference, and vice versa.
   3. Agent Context: `apps/cli/src/resources/AGENTS.md` - Tells the agent about CLI architecture, directory structure, extensions, and capabilities. Update when adding or removing extensions, commands, or skills; changing directory structure or file roles; changing how the agent interacts with the system; or adding new agent prompt templates.

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
