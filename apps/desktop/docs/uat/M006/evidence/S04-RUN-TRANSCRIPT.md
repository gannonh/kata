# S04 Run Transcript (Packaged Gate Inputs)

Date (UTC): 2026-04-08
Branch: `sym/KAT-2402`
Workspace: `/Volumes/EVO/symphony-workspaces/KAT-2402/apps/desktop`

This transcript captures the exact command-level evidence consumed by S04 release-gate reports.

## 1) Build + DMG packaging

Command:

```bash
cd apps/desktop && bun run build && bun run dist:mac
```

Observed output (excerpt):

- `✓ built in 786ms`
- `building target=DMG arch=arm64 file=release/Kata-Desktop-arm64.dmg`
- `[package-mac] DMG ready in /Volumes/EVO/symphony-workspaces/KAT-2402/apps/desktop/release`

Artifact produced:

- `apps/desktop/release/Kata-Desktop-arm64.dmg`

## 2) Packaged install/launch/shutdown smoke (clean profile)

Command:

```bash
cd apps/desktop && \
  hdiutil attach release/Kata-Desktop-arm64.dmg -nobrowse -mountpoint /tmp/kata-desktop-m006-dmg && \
  cp -R "/tmp/kata-desktop-m006-dmg/Kata Desktop.app" /tmp/kata-desktop-m006-install/ && \
  open -n "/tmp/kata-desktop-m006-install/Kata Desktop.app" --args --user-data-dir=/tmp/kata-desktop-m006-profile
```

Observed output (excerpt):

- DMG checksum + attach succeeded
- Mounted app bundle visible: `Kata Desktop.app`
- Running process observed:
  - `/private/tmp/kata-desktop-m006-install/Kata Desktop.app/Contents/MacOS/Kata Desktop --user-data-dir=/tmp/kata-desktop-m006-profile`
- DMG detach succeeded: `"disk22" ejected.`

## 3) Integrated M006 acceptance automation

Command:

```bash
cd apps/desktop && npx playwright test e2e/tests/m006-beta-acceptance.e2e.ts
```

Observed output:

- `2 passed (10.9s)`
- Happy-path test passed (`startup → onboarding → plan → execute → symphony → mcp → shutdown`)
- Recovery-path test passed (`subprocess crash + symphony disconnect recover without restart`)

## 4) Typecheck gate

Command:

```bash
cd apps/desktop && bun run typecheck
```

Observed output:

- `tsc --noEmit` completed successfully (exit code 0)

## 5) Release-gate summary generation

Command:

```bash
cd apps/desktop && bun run qa:m006:release-gate -- --assert-checkpoints --report docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json
```

Observed output:

- Generated after S04 UAT + acceptance reports were authored
- Asserts all required checkpoints + criteria
