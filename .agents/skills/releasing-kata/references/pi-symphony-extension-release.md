# Pi Symphony Extension Release

Package: `@kata-sh/pi-symphony-extension`
Version source: `apps/symphony/pi-extension/package.json`
Tag format: `pi-symphony-vX.Y.Z`
CI workflow: `pi-symphony-extension-release.yml`
Required runtime binary: `symphony >= 2.3.0`

## Install modes to preserve

Document and test these forms:

```bash
pi install npm:@kata-sh/pi-symphony-extension
pi install npm:@kata-sh/pi-symphony-extension@X.Y.Z
pi install git:github.com/gannonh/kata
pi install git:github.com/gannonh/kata@pi-symphony-vX.Y.Z
pi -e ./apps/symphony/pi-extension
```

Notes:

- Unpinned npm installs track npm `latest`.
- Pinned npm installs are version-locked.
- Unpinned git installs track the default branch and can update with `pi update`.
- Pinned git installs are version-locked to the release tag.
- Monorepo git installs load the repository root package, so root `package.json` must expose the extension through its `pi` manifest.

## Root package requirements for git install

Root `package.json` stays version `0.0.0`; never use it as the release version.

For git installs, root `package.json` must include:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["apps/symphony/pi-extension/src/index.ts"]
  }
}
```

Root runtime dependencies must include any dependencies needed by root-loaded Pi resources. For the current Symphony extension, root git installs need `ws` available at runtime.

The root Pi manifest is the future aggregator for broader Kata Pi capabilities. Add future CLI workflow commands, tools, or skills there without changing this package's npm identity.

## Before releasing

1. **Verify clean state on main**

   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Confirm whether this is extension-only**

   ```bash
   git diff --name-only symphony-v$(grep '^version' apps/symphony/Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')..HEAD -- apps/symphony/src apps/symphony/Cargo.toml apps/symphony/Cargo.lock
   ```

   If Rust sources or Cargo metadata changed, consider whether a separate Symphony binary release is also required. Extension-only changes do not bump `apps/symphony/Cargo.toml`.

3. **Check existing package and tag state**

   ```bash
   VERSION=$(node -p "require('./apps/symphony/pi-extension/package.json').version")
   npm view @kata-sh/pi-symphony-extension@$VERSION version || true
   git ls-remote --tags --refs origin "refs/tags/pi-symphony-v$VERSION" || true
   ```

## Release setup if missing

If this is the first Pi Symphony extension release and `.github/workflows/pi-symphony-extension-release.yml` does not exist, add it before cutting the release. It should:

1. Trigger on pushes to `main` for `apps/symphony/pi-extension/**`, `.github/workflows/pi-symphony-extension-release.yml`, root `package.json`, and `pnpm-lock.yaml`, plus `workflow_dispatch`.
2. Read `apps/symphony/pi-extension/package.json` version.
3. Skip when both npm `@kata-sh/pi-symphony-extension@X.Y.Z` and tag `pi-symphony-vX.Y.Z` already exist.
4. Fail loudly if only one of the npm version or git tag exists.
5. Install dependencies with pnpm.
6. Run extension validation.
7. Run `npm pack --dry-run` in `apps/symphony/pi-extension`.
8. Publish from `apps/symphony/pi-extension` with `npm publish --access public` using `NPM_TOKEN`.
9. Create and push `pi-symphony-vX.Y.Z`.
10. Create a GitHub release named `Pi Symphony Extension vX.Y.Z`.

## Steps

1. **Run pre-release checks**

   ```bash
   pnpm --dir apps/symphony/pi-extension run lint
   pnpm --dir apps/symphony/pi-extension run typecheck
   pnpm --dir apps/symphony/pi-extension run test
   (cd apps/symphony/pi-extension && npm pack --dry-run)
   pnpm run validate:affected
   ```

2. **Bump version** in `apps/symphony/pi-extension/package.json` only.

   - Patch for bug fixes and docs.
   - Minor for new commands, tools, dashboard sections, or install UX improvements.
   - Major for breaking command, tool, or package changes.

3. **Update package documentation**

   Update `apps/symphony/pi-extension/README.md` with:

   - npm latest and pinned install commands
   - git latest and pinned install commands
   - local development command
   - `symphony >= 2.3.0` requirement
   - binary resolution order: `SYMPHONY_BIN`, repo-local release binary, then `symphony` on `PATH`

4. **Update release docs if the workflow changed**

   Update this reference and `release-troubleshooting.md` if release behavior, tag format, CI, or install modes changed.

5. **Create release branch and PR**

   ```bash
   VERSION=$(node -p "require('./apps/symphony/pi-extension/package.json').version")
   git checkout -b release/pi-symphony-v$VERSION
   git add apps/symphony/pi-extension/package.json apps/symphony/pi-extension/README.md .github/workflows/pi-symphony-extension-release.yml .agents/skills/releasing-kata
   git commit -m "chore(release): bump pi symphony extension to $VERSION"
   git push -u origin release/pi-symphony-v$VERSION
   gh pr create --title "Pi Symphony Extension v$VERSION" --body "Pi Symphony extension release v$VERSION"
   ```

   Include root `package.json` in the commit if adding or changing the monorepo git package manifest or root runtime dependencies.

6. **When approved, merge PR to main**

   CI takes over after merge.

7. **Verify the release**

   ```bash
   VERSION=$(node -p "require('./apps/symphony/pi-extension/package.json').version")
   gh release view pi-symphony-v$VERSION
   npm view @kata-sh/pi-symphony-extension version
   npm view @kata-sh/pi-symphony-extension dist-tags
   ```

8. **Smoke-test install forms where practical**

   Use a temporary Pi config directory or disposable environment:

   ```bash
   PI_CODING_AGENT_DIR=$(mktemp -d) pi install npm:@kata-sh/pi-symphony-extension@$VERSION
   PI_CODING_AGENT_DIR=$(mktemp -d) pi install git:github.com/gannonh/kata@pi-symphony-v$VERSION
   ```

## What CI does after merge

`pi-symphony-extension-release.yml` triggers on push to main when extension, workflow, root package manifest, or lockfile release inputs change:

1. Reads version from `apps/symphony/pi-extension/package.json`.
2. Checks npm and git tag state.
3. Skips completed releases and fails partial releases.
4. Runs lint, typecheck, tests, and npm pack dry-run.
5. Publishes the nested npm package.
6. Creates git tag `pi-symphony-vX.Y.Z`.
7. Creates a GitHub Release.

## Acceptance criteria

- [ ] `apps/symphony/pi-extension/package.json` version bumped
- [ ] `apps/symphony/pi-extension/README.md` updated
- [ ] Root git package manifest supports `pi install git:github.com/gannonh/kata`
- [ ] Published to npm (`npm view @kata-sh/pi-symphony-extension version`)
- [ ] Git tag `pi-symphony-vX.Y.Z` created
- [ ] GitHub release `Pi Symphony Extension vX.Y.Z` created
- [ ] Pinned npm install works
- [ ] Pinned git install works
