# Release Troubleshooting

Common issues and solutions for Kata release flows.

## Target and namespace sanity check

Before debugging CI, confirm the target identity is correct:

- CLI: `@kata-sh/cli`
- Symphony: Rust binary release
- Pi Symphony extension: `@kata-sh/pi-symphony-extension`

If the wrong target/version file is edited, release workflows may skip.

## CLI publish issues

### npm publish failed

**Check:**

1. `NPM_TOKEN` repository secret is set.
2. `apps/cli/package.json` was bumped.
3. Target version is new (no existing release tag).

```bash
git tag -l 'cli-v*'
```

For CLI prereleases, confirm the package did not publish as `latest`:

```bash
npm view @kata-sh/cli dist-tags
```

### Workflow did not trigger

Confirm the right path changed:

- CLI: `apps/cli/**`

## Symphony release issues

### CI did not trigger

**Check:**

1. Changes are under `apps/symphony/**`
2. `Cargo.toml` version changed
3. `symphony-vX.Y.Z` tag does not already exist

```bash
git tag -l 'symphony-v*'
rg -n '^version\s*=\s*"' apps/symphony/Cargo.toml
```

### Local build/test failures

```bash
cd apps/symphony
cargo test
cargo clippy -- -D warnings
cargo fmt --check
cargo build --release
```

## CI visibility commands

```bash
# Recent release workflow runs
gh run list --workflow=cli-release.yml --limit 5
gh run list --workflow=symphony-release.yml --limit 5
gh run list --workflow=pi-symphony-extension-release.yml --limit 5

# Inspect a run
gh run view <run-id>

# Watch current run
gh run watch

# List releases
gh release list
```
