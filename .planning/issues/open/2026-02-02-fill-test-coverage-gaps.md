---
created: 2026-02-02T22:15
title: Fill test coverage gaps
area: testing
provenance: github:gannonh/kata-agents#52
linked_phase: 2
files:
  - packages/shared/src/git/pr-service.ts
  - packages/shared/src/git/__tests__/
---

## Problem

Test coverage is well below the target 100%. The PR review noted that `pr-service.ts` has no unit tests, while the existing `git-service.ts` has comprehensive tests at `packages/shared/src/git/__tests__/git-service.test.ts`.

Coverage gaps likely exist across:
- New PR service module (no tests)
- Other recently added modules
- Edge cases in existing code

## Solution

1. Run coverage report to identify specific gaps: `bun test --coverage`
2. Prioritize critical paths (error handling, IPC boundaries)
3. Add unit tests for pr-service.ts following git-service.test.ts patterns
4. Fill gaps or adjust targets as appropriate based on risk assessment
