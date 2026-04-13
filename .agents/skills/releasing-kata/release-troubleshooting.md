# Release Troubleshooting

Common issues and solutions for Kata release flows.

## Target and namespace sanity check

Before debugging CI, confirm the target identity is correct:

- CLI: `@kata-sh/cli`
- Orchestrator: `@kata-sh/orc`
- Context: `@kata/context`
- Desktop: app release only (not an npm publish target)
- Symphony: Rust binary release

If the wrong target/version file is edited, release workflows may skip.

## Desktop build issues

### Wrong working directory

**Symptom:** Desktop packaging fails with missing file/script paths.

**Fix:** Run desktop release commands from `apps/desktop`.

```bash
cd apps/desktop
pnpm run desktop:dist:mac
```

### Expected artifact name mismatch

**Symptom:** Build succeeded but your manual check says artifact is missing.

**Check:** Current artifacts use `Kata-Desktop-*` naming.

```bash
ls -la apps/desktop/release | rg 'Kata-Desktop|\.dmg|\.zip|\.exe|\.AppImage|\.deb'
```

### Desktop release workflow did not trigger

**Check:**

1. `apps/desktop/package.json` version changed.
2. Tag `desktop-vX.Y.Z` does not already exist.

```bash
git tag -l 'desktop-v*'
rg -n '"version"' apps/desktop/package.json
```

## CLI / Orchestrator / Context publish issues

### npm publish failed

**Check:**

1. `NPM_TOKEN` repository secret is set.
2. Correct package file was bumped.
3. Target version is new (no existing release tag).

```bash
git tag -l 'cli-v*'
git tag -l 'orc-v*'
git tag -l 'context-v*'
```

### Workflow did not trigger

Confirm the right path changed:

- CLI: `apps/cli/**`
- Orchestrator: `apps/orchestrator/**`
- Context: `apps/context/**`

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

## Code signing and notarization (desktop)

### Signing identity missing

```bash
security find-identity -v -p codesigning
```

### Notarization failing

Verify repository secrets:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

And locally:

```bash
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

## CI visibility commands

```bash
# Recent release workflow runs
gh run list --workflow=desktop-release.yml --limit 5
gh run list --workflow=cli-release.yml --limit 5
gh run list --workflow=orc-release.yml --limit 5
gh run list --workflow=context-release.yml --limit 5
gh run list --workflow=symphony-release.yml --limit 5

# Inspect a run
gh run view <run-id>

# Watch current run
gh run watch

# List releases
gh release list
```
