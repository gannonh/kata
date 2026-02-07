---
phase: 37
plan: 2
subsystem: preferences-infrastructure
tags: [onboarding, progressive-capture, check-or-ask, parallelization-removal]
dependency_graph:
  requires: [37-01]
  provides: [reduced-onboarding, progressive-capture-wiring, preferences-json-scaffold]
  affects: [38, 39]
tech_stack:
  added: []
  patterns: [check-or-ask, silent-defaults, key-absence-trigger]
key_files:
  created: []
  modified:
    - skills/kata-new-project/SKILL.md
    - skills/kata-plan-phase/SKILL.md
    - skills/kata-configure-settings/SKILL.md
    - skills/kata-execute-phase/references/planning-config.md
    - README.md
decisions:
  - model_profile absent from config.json triggers check-or-ask in kata-plan-phase step 3.5
  - Workflow and display settings silent-default to true (not user-selected during onboarding)
  - Statusline setup runs unconditionally (always defaults to true)
metrics:
  duration: 3m
  completed: 2026-02-07
---

# Phase 37 Plan 02: Skill Modifications Summary

Wired preferences infrastructure into skills: reduced onboarding from 11 questions to 5, added progressive capture via check-or-ask pattern, removed dead parallelization key from 5 files.

## Commits

- `e6b7eb0`: feat(37-02): reduce kata-new-project onboarding and scaffold preferences.json
- `12cfe8a`: feat(37-02): add check-or-ask to kata-plan-phase, remove parallelization from 3 files

## What Was Built

**kata-new-project onboarding reduction** — Round 1 reduced from 6 to 5 questions (removed Execution/Parallelization). Round 2 removed entirely (Researcher, Plan Checker, Verifier, Model Profile, Statusline). Workflow and display settings hardcoded to `true`. Config.json omits `model_profile` and `parallelization`. `preferences.json` scaffolded as `{}` and included in initial commit. Self-validation checks for preferences.json existence.

**kata-plan-phase step 3.5** — Check-or-ask for model_profile inserted between steps 3 and 4. On first run (model_profile absent from config.json), prompts user via AskUserQuestion, writes result via `set-config.sh`, and displays agent defaults notice box. On subsequent runs, no-op.

**parallelization removal** — Removed from all 5 files: kata-new-project (question + template + success criteria), kata-configure-settings (parse list + JSON template + comment), planning-config.md (schema JSON + table row), README.md (execution settings table row). Also removed from kata-plan-phase implicitly (was never directly referenced there).

## Verification Results

- 5 onboarding questions confirmed: Mode, Depth, Git Tracking, PR Workflow, GitHub Tracking
- No Round 2 section in kata-new-project
- Zero `parallelization` matches across all 4 target files
- Config.json template has no `parallelization` or `model_profile` keys
- preferences.json scaffold and commit present
- Self-validation checks for preferences.json
- Step 3.5 exists with set-config.sh reference and agent defaults notice

## Deviations from Plan

None — plan executed exactly as written.
