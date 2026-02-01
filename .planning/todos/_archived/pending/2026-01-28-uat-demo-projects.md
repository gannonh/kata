---
title: Create UAT demo projects at various milestone stages
created: 2026-01-28
priority: medium
area: testing
---

# UAT Demo Projects

## Problem

UAT testing requires manually bringing a project to a specific stage (e.g., "ready to complete milestone with release workflow"). This is time-consuming and error-prone.

## Solution

Create pre-configured demo projects at various stages:

1. **Fresh project** — Just after `/kata:new-project`
2. **Mid-milestone** — Phase 2 of 3 complete, ready for planning
3. **Ready for execution** — Plans created, ready for `/kata:execute-phase`
4. **Ready to complete** — All phases done, ready for `/kata:complete-milestone`
5. **Release ready** — Milestone complete, conventional commits ready for release workflow

## Implementation

- Store in `tests/fixtures/uat-projects/` or similar
- Each project has full `.planning/` structure
- Include mock git history with conventional commits where needed
- Script to reset demo project to known state after testing

## Benefits

- Faster UAT cycles
- Reproducible test scenarios
- Can test specific features in isolation
- Enables automated E2E tests for interactive workflows
