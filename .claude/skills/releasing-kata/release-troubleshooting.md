# Release Troubleshooting

Common issues and solutions for the Kata Agents release process.

## Build Issues

### Path Resolution Errors

**Symptom:** `Cannot find module 'apps/electron/scripts/afterPack.cjs'` or doubled paths like `apps/electron/apps/electron/...`

**Cause:** Running build from the wrong directory. The root-level `bun run electron:dist:mac` has path issues with electron-builder.

**Fix:** Always run from `apps/electron`:
```bash
cd apps/electron && bun run dist:mac
```

### DMG Name Mismatch

**Symptom:** Build completes but script says "Expected DMG not found"

**Cause:** The build script checks for `Craft-Agent-*.dmg` but electron-builder produces `Kata-Agents-*.dmg`

**Status:** This is a cosmetic issue - the DMG was actually built successfully. Check `apps/electron/release/` for `Kata-Agents-arm64.dmg`.

### Entitlements Not Found

**Symptom:** `build/entitlements.mac.plist: cannot read entitlement data`

**Cause:** Running from wrong directory (paths in electron-builder.yml are relative to apps/electron)

**Fix:** Run from `apps/electron` directory

## Code Signing Issues

### Certificate Not Found

**Symptom:** `No identity found for signing`

**Check:**
1. Certificate is in Keychain Access
2. Certificate name matches `APPLE_SIGNING_IDENTITY` exactly
3. Certificate is not expired

```bash
# List available signing identities
security find-identity -v -p codesigning
```

### Notarization Fails

**Symptom:** `xcrun notarytool submit` fails or hangs

**Check:**
1. Apple ID credentials are correct
2. App-specific password is valid (generate at appleid.apple.com)
3. Team ID matches your developer account

```bash
# Verify credentials work
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

## CI Workflow Issues

### Release Not Triggered

**Symptom:** Pushed to main but no release workflow ran

**Check:**
1. Version in `apps/electron/package.json` actually changed
2. Tag `vX.Y.Z` doesn't already exist

```bash
# Check existing tags
git tag -l "v*"

# Check what CI sees
cat apps/electron/package.json | grep version
```

### Artifacts Missing from Release

**Symptom:** GitHub Release created but missing some platform builds

**Check:**
1. All build jobs completed (macOS arm64, macOS x64, Windows, Linux)
2. No failures in individual build jobs

```bash
# Check workflow runs
gh run list --workflow=release.yml --limit 5

# View specific run details
gh run view <run-id>
```

## Session/UI Issues

### Sessions Not Displaying

**Symptom:** Production build shows "No conversations yet" but dev build shows sessions

**Cause:** Stale `workspaceId` in window-state.json doesn't match session workspace IDs

**Fix:**
```bash
rm ~/.kata-agents/window-state.json
```

Then relaunch the app.

### Window State Issues

**Symptom:** App opens to wrong workspace or wrong session

**Fix:** Clear window state and let app recreate it:
```bash
rm ~/.kata-agents/window-state.json
```

## Environment Setup

### Required Secrets for CI

For full CI release functionality, set these GitHub repository secrets:

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded .p12 certificate |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

### Required Environment for Local Builds

For local signed builds, set in `.env`:

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
APPLE_ID="your@email.com"
APPLE_TEAM_ID="TEAMID"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

## Useful Commands

```bash
# Check current version
cat apps/electron/package.json | grep version

# List existing releases
gh release list

# View specific release
gh release view vX.Y.Z

# Monitor CI
gh run list --limit 5
gh run watch

# Check signing identities
security find-identity -v -p codesigning

# Verify app is signed
codesign -dv --verbose=4 "apps/electron/release/mac-arm64/Kata Agents.app"

# Verify app is notarized
spctl -a -v "apps/electron/release/mac-arm64/Kata Agents.app"
```
