---
phase: 01-live-e2e-test-suite
plan: 02
subsystem: testing
tags: [e2e, playwright, testing, auth, chat]
dependency-graph:
  requires: ["01-01"]
  provides: ["auth-live-test", "chat-live-test", "data-testid-selectors"]
  affects: ["01-03"]
tech-stack:
  added: []
  patterns: ["data-testid selectors", "page object pattern", "streaming state attributes"]
key-files:
  created:
    - apps/electron/e2e/tests/live/auth.live.e2e.ts
    - apps/electron/e2e/tests/live/chat.live.e2e.ts
  modified:
    - apps/electron/src/renderer/App.tsx
    - packages/ui/src/components/chat/TurnCard.tsx
    - apps/electron/e2e/page-objects/ChatPage.ts
    - apps/electron/src/main/index.ts
decisions:
  - id: "data-testid-streaming"
    decision: "Add data-streaming attribute alongside data-testid on TurnCard"
    rationale: "Allows tests to wait for streaming completion with attribute selector"
  - id: "multi-instance-lock"
    decision: "Skip single-instance lock when KATA_CONFIG_DIR is set"
    rationale: "Enables parallel test runs with different config directories"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-04"
---

# Phase 01 Plan 02: Auth and Chat Live E2E Tests Summary

Auth and chat live E2E tests with data-testid selectors for reliable test automation.

## What Was Built

### E2E-03: Auth Verification Test
- Verifies app loads with real credentials from `~/.kata-agents/credentials.enc`
- Confirms no onboarding wizard appears
- Validates main content container and chat input are visible
- Tests the authenticated user journey from app launch

### E2E-04: Chat Round-Trip Test
- Sends a message and verifies streaming response renders
- Uses `data-testid="assistant-turn-card"` for reliable element targeting
- Waits for `data-streaming="false"` to detect streaming completion
- Extended timeout (120s) for live API calls

### Supporting Changes
1. **Data-testid attributes added:**
   - `data-testid="app-main-content"` on App.tsx main container
   - `data-testid="assistant-turn-card"` on TurnCard component
   - `data-streaming` attribute on TurnCard for streaming state

2. **ChatPage page object updated:**
   - Now uses data-testid selector for assistant turns
   - More reliable than class-based selectors

3. **Single-instance lock fix:**
   - Skip lock when `KATA_CONFIG_DIR` is set
   - Enables multiple app instances with different config dirs
   - Required for parallel test execution

## Commits

| Hash | Message |
|------|---------|
| c36a9d9 | feat(01-02): add data-testid attributes for E2E testing |
| 019aed7 | feat(01-02): add auth and chat live E2E tests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Single-instance lock preventing test execution**
- **Found during:** Task 2 verification
- **Issue:** Electron's single-instance lock prevented tests from launching the app when another instance was running or had crashed
- **Fix:** Skip `requestSingleInstanceLock()` when `KATA_CONFIG_DIR` env var is set
- **Files modified:** apps/electron/src/main/index.ts
- **Commit:** 019aed7

**2. [Rule 1 - Bug] ChatPage selector not matching assistant turns**
- **Found during:** Task 2 verification
- **Issue:** `[class*="assistant-message"]` selector didn't match actual UI structure
- **Fix:** Updated ChatPage to use the new `data-testid="assistant-turn-card"` selector
- **Files modified:** apps/electron/e2e/page-objects/ChatPage.ts
- **Commit:** 019aed7

## Test Results

All live E2E tests passing:
```
Running 5 tests using 1 worker
  [check] e2e/tests/live/auth.live.e2e.ts - E2E-03 (3.9s)
  [check] e2e/tests/live/chat.live.e2e.ts - E2E-04 (6.6s)
  [check] e2e/tests/live/git.live.e2e.ts - E2E-06 (9.6s)
  [check] e2e/tests/live/permission.live.e2e.ts - E2E-07 (5.2s)
  [check] e2e/tests/live/session.live.e2e.ts - E2E-05 (9.5s)
5 passed (35.4s)
```

## Next Phase Readiness

**Ready for:** Plan 01-03 (if it exists) or Phase 02 (Unit Test Coverage)

**Dependencies satisfied:**
- Data-testid selectors established
- ChatPage page object updated
- Live test infrastructure validated

**No blockers identified.**
