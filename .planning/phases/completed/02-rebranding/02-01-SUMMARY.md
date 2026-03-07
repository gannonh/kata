---
phase: 02
plan: 01
subsystem: branding
tags: [electron, build-config, ui]
dependency-graph:
  requires: []
  provides: [kata-agents-branding, bundle-id]
  affects: [02-02, 02-03, 02-04]
tech-stack:
  added: []
  patterns: [env-var-migration-fallback]
key-files:
  created: []
  modified:
    - apps/electron/electron-builder.yml
    - apps/electron/src/main/index.ts
    - apps/electron/src/main/menu.ts
    - apps/electron/src/renderer/index.html
    - apps/electron/src/renderer/playground.html
    - apps/viewer/index.html
decisions:
  - id: D10
    choice: "Backward compatible env vars"
    rationale: "Support KATA_ and CRAFT_ env vars during migration period"
metrics:
  duration: 2m 17s
  completed: 2026-01-29
---

# Phase 2 Plan 1: Product Name and Metadata Summary

**One-liner:** Rebranded user-facing names to Kata Agents with backward-compatible env var support for migration

## What Was Done

Updated all user-visible product names from "Craft Agents" to "Kata Agents" and changed the bundle ID to `sh.kata.desktop`.

### Task 1: Update electron-builder configuration

- Changed `appId` from `com.lukilabs.craft-agent` to `sh.kata.desktop`
- Changed `productName` from `Craft Agents` to `Kata Agents`
- Updated all `artifactName` patterns from `Craft-Agent-*` to `Kata-Agents-*`
- Updated DMG title to "Kata Agents"
- Updated Linux maintainer to "Kata <hello@kata.sh>"
- Preserved copyright attribution (required by Apache 2.0 license)

### Task 2: Update main process app name and environment variables

- Changed app name from "Craft Agents" to "Kata Agents"
- Changed deeplink scheme from `craftagents://` to `kata://`
- Added backward compatibility: both `KATA_*` and `CRAFT_*` env vars are supported
- Updated comments to reflect new branding

### Task 3: Update menu labels and HTML titles

- Updated macOS app menu label to "Kata Agents"
- Updated About, Hide, Quit menu items
- Updated reset dialog message
- Updated HTML titles in all entry points

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| d93baa0 | chore | Update electron-builder configuration |
| 323467e | chore | Update main process branding |
| fb9d2ce | chore | Update menu labels and HTML titles |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All success criteria passed:
1. `appId: sh.kata.desktop` - PASS
2. `productName: Kata Agents` - PASS
3. `grep -c "Kata Agents" menu.ts` = 6 (>= 4) - PASS
4. `<title>Kata Agents</title>` in index.html - PASS
5. `bun run typecheck:all` - PASS

## Decisions Made

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| D10 | Environment variable migration | Support both KATA_ and CRAFT_ prefixes | Enables gradual migration without breaking existing dev scripts |

## Next Phase Readiness

Plan 02-02 (Internal Identifiers) can proceed - no blockers.

The following identifiers still use "craft" naming (addressed in later plans):
- Internal paths: `~/.craft-agent/`
- Package names: `@craft-agent/*`
- Environment variables: `CRAFT_DEBUG`, etc.
