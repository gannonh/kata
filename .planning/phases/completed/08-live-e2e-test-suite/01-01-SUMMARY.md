---
phase: 01-live-e2e-test-suite
plan: 01
subsystem: testing
tags: [e2e, playwright, infrastructure]
dependency-graph:
  requires: []
  provides: [live-fixture-credential-validation, test-e2e-live-script, tests-live-directory]
  affects: [01-02, 01-03]
tech-stack:
  added: []
  patterns: [credential-validation-before-launch]
key-files:
  created:
    - apps/electron/e2e/tests/live/.gitkeep
  modified:
    - apps/electron/e2e/fixtures/live.fixture.ts
    - apps/electron/package.json
    - apps/electron/e2e/README.md
decisions:
  - id: live-fixture-validation
    description: Validate credentials.enc exists before launching app in live fixture
    rationale: Prevents confusing test failures when credentials are missing
metrics:
  duration: 2m
  completed: 2026-02-04
---

# Phase 01 Plan 01: Live E2E Test Infrastructure Summary

Live fixture with credential validation, test:e2e:live scripts targeting tests/live directory

## What Was Built

### Credential Validation in live.fixture.ts

Added pre-launch validation that checks for `~/.kata-agents/credentials.enc` before attempting to launch the Electron app. When credentials are missing, the fixture throws a clear error message:

```
Error: Live E2E tests require credentials.
Run the app first and authenticate via OAuth to create ~/.kata-agents/credentials.enc
```

Also exported `DEMO_CONFIG_DIR` constant for test files to reference the demo directory path.

### Test Scripts in package.json

Added three new npm scripts for running live tests:

| Script | Purpose |
|--------|---------|
| `test:e2e:live` | Run all live tests in tests/live/ |
| `test:e2e:live:debug` | Run with Playwright debug mode |
| `test:e2e:live:headed` | Run with visible browser window |

### Directory Structure

Created `apps/electron/e2e/tests/live/` directory with `.gitkeep` to preserve the empty directory until test files are added.

### Documentation

Updated `apps/electron/e2e/README.md` with a "Running Live Tests" section documenting:
- Prerequisites (valid credentials required)
- Available scripts
- Notes on timeout requirements for real API calls

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 0916adf | Add credential validation to live E2E fixture |
| 2 | d708d93 | Add test:e2e:live script and directory structure |

## Deviations from Plan

None. Plan executed exactly as written.

## Verification Results

- Existing tests pass (session-lifecycle visible window test)
- Credential validation verified by temporarily moving credentials.enc and confirming error message
- test:e2e:live script runs and correctly targets tests/live/ directory
- Directory structure created and tracked via .gitkeep

## Next Plan Readiness

Ready for 01-02: First Live Test (Session Creation). The infrastructure is in place:
- Live fixture validates credentials and launches app with demo environment
- Test scripts target the correct directory
- Directory exists to receive test files
