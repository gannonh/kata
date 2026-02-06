---
created: 2026-01-28T15:14
title: Create demo projects in various states for UAT testing
area: testing
files:
  - tests/fixtures/
---

## Problem

UAT testing currently requires manually setting up projects in specific states (mid-phase, post-milestone, with pending todos, etc.). This is time-consuming and error-prone, making it hard to consistently test workflows like:
- Resuming mid-execution
- Verifying phases with partial completion
- Milestone completion with various todo states
- Project onboarding variations

## Solution

Create a set of demo/fixture projects representing common states:

1. **Fresh project** — Just initialized, no phases planned
2. **Mid-planning** — Phase planned but not executed
3. **Mid-execution** — Phase partially complete (1 of 3 plans done)
4. **Post-phase** — Phase complete, ready for verification
5. **Multi-milestone** — Project with completed milestone + new one in progress
6. **With blockers** — Project with pending todos and blockers in STATE.md

Store in `tests/fixtures/demo-projects/` or similar. Could be:
- Actual `.planning/` directory snapshots
- Scripts that generate the state
- Git branches in a test repo
