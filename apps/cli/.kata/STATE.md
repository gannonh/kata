# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Active Task:** none — Slice not planned yet
**Phase:** Planning
**Slice Branch:** kata/M002/S02
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Plan S03 — map Kata milestones/slices/tasks onto Linear milestones/issues/sub-issues and define label/status conventions.
**Last Updated:** 2026-03-12
**Requirements Status:** 9 active · 4 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D017: Linear mode config lives in `.kata/preferences.md` with legacy uppercase fallback
- D018: Mode/config branching is centralized in `linear-config.ts`
- D019: `/kata prefs status` is the canonical inspection surface for active workflow mode and Linear config health
- D020: Workflow-sensitive entrypoints gate through `linear-config.ts` before touching file-backed Kata state or prompts

## Blockers

- (none)
