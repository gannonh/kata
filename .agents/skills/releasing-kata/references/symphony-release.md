# Symphony Release

Package: `symphony` (Rust binary)
Version source: `apps/symphony/Cargo.toml`
Changelog: `apps/symphony/CHANGELOG.md`
Tag format: `symphony-vX.Y.Z`
CI workflow: `symphony-release.yml`

## Steps

1. **Verify clean state on main**
   ```bash
   git branch --show-current  # → main
   git status                 # → clean
   ```

2. **Run pre-release checks**
   ```bash
   cd apps/symphony
   cargo test
   cargo clippy -- -D warnings
   cargo fmt --check
   ```

3. **Bump version** in `apps/symphony/Cargo.toml` only

4. **Update `apps/symphony/CHANGELOG.md`** with the new version's changes (create if it doesn't exist)

5. **Create release branch and PR**
   ```bash
   git checkout -b release/symphony-vX.Y.Z
   git add apps/symphony/Cargo.toml apps/symphony/CHANGELOG.md
   git commit -m "chore(release): bump symphony to X.Y.Z"
   git push -u origin release/symphony-vX.Y.Z
   gh pr create --title "Symphony vX.Y.Z" --body "Symphony release vX.Y.Z"
   ```

6. **When approved, merge PR to main** — CI takes over from here

7. **Verify the release**
   ```bash
   gh release view symphony-vX.Y.Z
   ```

## What CI does after merge

`symphony-release.yml` triggers on push to main when `apps/symphony/**` changes:
1. Reads version from `Cargo.toml`, compares against existing `symphony-v*` tags — skips if tag exists
2. Runs `cargo test`
3. Builds release binary (`cargo build --release`)
4. Creates git tag `symphony-vX.Y.Z` and GitHub Release with binary attached

## Acceptance criteria

- [ ] `apps/symphony/Cargo.toml` version bumped
- [ ] `apps/symphony/CHANGELOG.md` updated
- [ ] Git tag `symphony-vX.Y.Z` created
- [ ] GitHub Release has binary attached
