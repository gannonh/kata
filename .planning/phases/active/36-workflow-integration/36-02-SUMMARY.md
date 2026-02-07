---
phase: 36
plan: 02
subsystem: skills
tags: [brainstorm, research, planning, workflow-integration]
requires: [35]
provides: [brainstorm-gates-in-research-and-plan-skills]
affects: [36-03]
tech-stack:
  added: []
  patterns: [AskUserQuestion-gate, optional-sub-skill-invocation]
key-files:
  created: []
  modified:
    - skills/kata-research-phase/SKILL.md
    - skills/kata-plan-phase/SKILL.md
decisions:
  - Brainstorm gates use consistent AskUserQuestion pattern across both skills
  - Gates invoke /kata-brainstorm as sub-skill (skill handles its own prerequisite check)
  - Skip path continues parent workflow without blocking
metrics:
  duration: ~1 min
  completed: 2026-02-07
---

# Phase 36 Plan 02: Add Brainstorm Gates to Research and Plan Skills Summary

Optional brainstorm integration points added to kata-research-phase and kata-plan-phase via AskUserQuestion gates.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add brainstorm follow-up to kata-research-phase | cf3122c | Done |
| 2 | Add brainstorm gate to kata-plan-phase research decision | e4b73e3 | Done |

## Changes Made

### kata-research-phase (Step 5)
- RESEARCH COMPLETE handler now displays summary, then offers brainstorm follow-up via AskUserQuestion
- "Brainstorm first" runs `/kata-brainstorm`, then continues to existing next-step options
- "Skip" continues directly to existing options (Plan phase, Dig deeper, Review full, Done)

### kata-plan-phase (Step 5)
- Brainstorm gate inserted after skip/exists checks, before research spawning
- Gate fires only when research is about to run (not when skipped or already exists)
- "Brainstorm first" runs `/kata-brainstorm`, then continues to research
- "Skip" continues directly to research

## Decisions Made

1. **Consistent gate pattern** -- Both skills use identical AskUserQuestion structure: "Brainstorm" header, "Brainstorm first" and "Skip" options
2. **Sub-skill delegation** -- Gates invoke `/kata-brainstorm` directly; the brainstorm skill handles its own Agent Teams prerequisite check
3. **Non-blocking skip** -- Declining brainstorm at either point continues the parent workflow immediately

## Deviations

None -- plan executed exactly as written.

## Verification

- [x] kata-research-phase offers brainstorm follow-up after research completes
- [x] kata-plan-phase offers brainstorm before research spawning
- [x] Both gates use consistent AskUserQuestion pattern
- [x] Neither gate blocks the parent workflow on decline
- [x] Brainstorm gates fire at the right workflow points (not when research is skipped)
- [x] No other content modified in either file
