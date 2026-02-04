# Phase 03 Plan 02: ROADMAP Format Conventions in Skills/Agents Summary

**One-liner:** Propagated standardized ROADMAP.md formatting (Goal lines, archive links, Planned Milestones, symbol vocabulary) to kata-complete-milestone, kata-add-milestone, and kata-roadmapper.

## What Was Done

### Task 1: Update kata-complete-milestone formatting (e6deb9a)

Updated milestone-complete.md reorganize_roadmap step:
- Added `**Goal:**` line to completed milestone `<details>` block template
- Added `[Full archive]` link to details block
- Changed milestones overview to use consistent symbols: ✅ shipped, 🔄 in-progress, ○ planned
- Added Planned Milestones section example with Goal and Target features format

Updated milestone-archive-template.md:
- Added `**Goal:** {{MILESTONE_GOAL}}` placeholder between Status and Phases lines

### Task 2: Update kata-add-milestone and kata-roadmapper (b9fb6a2)

Updated kata-add-milestone/SKILL.md Phase 9:
- Added 3 new instructions (items 7-9) for Planned Milestones, symbol vocabulary, and Progress Summary
- Added `<format_conventions>` block with symbol definitions, details block format, and table conventions

Updated agents/kata-roadmapper.md:
- Replaced generic "Key sections" list with detailed section guidance including Milestones overview, Completed Milestones, Planned Milestones, and Progress Summary table

## Decisions Made

None. All changes followed the formatting conventions established in Plan 01 (ROAD-02).

## Deviations from Plan

None -- plan executed exactly as written.

## Files Modified

- `skills/kata-complete-milestone/references/milestone-complete.md` -- reorganize_roadmap step formatting
- `skills/kata-complete-milestone/references/milestone-archive-template.md` -- Goal placeholder added
- `skills/kata-add-milestone/SKILL.md` -- Phase 9 roadmapper spawn instructions
- `agents/kata-roadmapper.md` -- output_formats section guidance

## Verification Results

1. milestone-complete.md has Goal: in reorganize_roadmap step (2 occurrences)
2. milestone-archive-template.md has MILESTONE_GOAL placeholder
3. kata-add-milestone has format_conventions block
4. kata-roadmapper has Planned Milestones guidance and ○ symbol
5. All changes additive, no functionality removed

## Metrics

- Duration: ~1 min
- Completed: 2026-02-04
- Tasks: 2/2
- Commits: 2
