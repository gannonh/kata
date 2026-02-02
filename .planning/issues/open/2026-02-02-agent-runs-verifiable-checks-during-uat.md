---
created: 2026-02-02T04:58
title: Agent runs verifiable checks during UAT sessions
type: enhancement
area: tooling
provenance: github:gannonh/kata-orchestrator#81
files:
  - skills/verify-work/SKILL.md
---

## Problem

During UAT sessions, the agent currently instructs users to run tests or verify outputs manually, even when these checks could be automated. This creates unnecessary friction and slows down the acceptance process.

User time should be focused on aspects that genuinely require human judgment—UX, UI, workflow ergonomics—not running `npm test` or checking method outputs.

## Solution

Update UAT workflow to:

1. **Agent-verifiable checks** — Agent runs directly and presents results:
   - Unit/integration tests (`npm test`, `pytest`, etc.)
   - Method output verification
   - API response validation
   - Build/compile checks
   - Linting/type checking

2. **Human-focused checks** — Present to user for judgment:
   - Visual appearance and layout
   - User experience flow
   - Interaction feel
   - Accessibility experience
   - Edge case behavior that requires context

The agent should clearly distinguish between "I verified X passes" (with evidence) and "Please confirm Y looks correct" (with screenshots or instructions).

Goal: Maximize user confidence while minimizing user effort.
