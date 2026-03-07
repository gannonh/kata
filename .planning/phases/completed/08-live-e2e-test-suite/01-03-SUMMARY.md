---
phase: 01-live-e2e-test-suite
plan: 03
subsystem: testing
tags: [e2e, playwright, session, git, permission]
dependency_graph:
  requires: [01-01]
  provides: [E2E-05, E2E-06, E2E-07]
  affects: []
tech_stack:
  added: []
  patterns: [live-fixture, page-object, data-testid]
key_files:
  created:
    - apps/electron/e2e/tests/live/session.live.e2e.ts
    - apps/electron/e2e/tests/live/git.live.e2e.ts
    - apps/electron/e2e/tests/live/permission.live.e2e.ts
  modified: []
decisions:
  - id: git-test-dynamic-branch
    choice: Dynamic branch detection instead of hardcoded 'main'
    rationale: Demo repo may be on different branch; test verifies badge shows actual branch
metrics:
  duration: 6m
  completed: 2026-02-04
---

# Phase 01 Plan 03: Workspace Context Live Tests Summary

Session lifecycle, git status, and permission mode live E2E tests for workspace context features.

## What Was Built

Three live E2E test files covering workspace-level features:

1. **session.live.e2e.ts** (E2E-05)
   - Creates new session via "New Chat" button
   - Closes and relaunches app
   - Verifies session persists after restart
   - Uses `data-tutorial="new-chat-button"` selector

2. **git.live.e2e.ts** (E2E-06)
   - Verifies git badge is visible for git repo workspace
   - Dynamically checks actual branch from demo repo
   - Uses `data-testid="git-branch-badge"` selector

3. **permission.live.e2e.ts** (E2E-07)
   - Cycles through permission modes with SHIFT+TAB
   - Verifies mode displays: Ask -> Auto -> Explore -> Ask
   - Uses `ChatPage.cyclePermissionMode()` page object method
   - Uses `data-tutorial="permission-mode-dropdown"` selector

## Key Implementation Details

### Session Persistence Test

The session test spawns a second Electron instance after closing the first to verify persistence:

```typescript
// Close the app
await electronApp.close()

// Relaunch the app to verify persistence
const app = await electron.launch({
  args: [
    path.join(__dirname, '../../../dist/main.cjs'),
    `--user-data-dir=${DEMO_CONFIG_DIR}`,
  ],
  env: { ...process.env, NODE_ENV: 'test', KATA_CONFIG_DIR: DEMO_CONFIG_DIR },
})
```

### Dynamic Branch Detection

Git test reads actual branch instead of hardcoding:

```typescript
const actualBranch = execSync('git branch --show-current', {
  cwd: demoRepoPath,
  encoding: 'utf-8',
}).trim()

await expect(gitBadge).toContainText(actualBranch)
```

### Permission Mode Cycle Order

The permission cycle order is: `ask` -> `allow-all` -> `safe` -> `ask`

Display names: "Ask to Edit" -> "Auto" -> "Explore" -> "Ask to Edit"

## Decisions Made

1. **Dynamic branch detection (git-test-dynamic-branch)**: Instead of hardcoding 'main', the git test reads the actual branch from the demo repo. This makes the test resilient to demo repo modifications while still verifying the core functionality.

2. **New Chat button selector**: Used `data-tutorial="new-chat-button"` instead of role-based selector because there are two "New Chat" buttons in the UI (sidebar and titlebar).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed path to main.cjs in session test**
- **Found during:** Task 1
- **Issue:** Path `../../../../dist/main.cjs` was incorrect (resolved to apps/dist instead of apps/electron/dist)
- **Fix:** Changed to `../../../dist/main.cjs` (correct relative path from tests/live/)
- **Commit:** 946434b

**2. [Rule 3 - Blocking] Fixed New Chat button selector ambiguity**
- **Found during:** Task 1
- **Issue:** `getByRole('button', { name: /new chat/i })` matched two elements
- **Fix:** Used `locator('[data-tutorial="new-chat-button"]')` for disambiguation
- **Commit:** 946434b

**3. [Rule 1 - Bug] Fixed git test hardcoded branch assumption**
- **Found during:** Task 2
- **Issue:** Test assumed demo repo is on 'main' branch, but it was on a feature branch
- **Fix:** Dynamically read actual branch from demo repo
- **Commit:** bcc5695

## Test Results

All 5 live E2E tests pass:

```
  ✓ auth.live.e2e.ts - E2E-03 (4.9s)
  ✓ chat.live.e2e.ts - E2E-04 (13.7s)
  ✓ git.live.e2e.ts - E2E-06 (9.1s)
  ✓ permission.live.e2e.ts - E2E-07 (6.8s)
  ✓ session.live.e2e.ts - E2E-05 (12.4s)

  5 passed (47.4s)
```

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 946434b | test | Add session lifecycle live E2E test |
| bcc5695 | test | Add git status and permission mode live E2E tests |

## Next Phase Readiness

Phase 1 (Live E2E Test Suite) is now complete with all 5 tests passing:
- E2E-03: Auth verification
- E2E-04: Chat round-trip
- E2E-05: Session lifecycle
- E2E-06: Git status
- E2E-07: Permission modes

Ready to proceed to Phase 2 (Unit Test Coverage).
