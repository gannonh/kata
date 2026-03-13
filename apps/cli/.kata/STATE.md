# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S02 — Project Configuration & Mode Switching
**Active Task:** none — All S02 tasks complete
**Phase:** Summarizing
**Slice Branch:** kata/M002/S02
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Complete S02 — write the slice summary and UAT, mark S02 done in M002-ROADMAP.md, update M002-SUMMARY.md, and advance to S03.
**Last Updated:** 2026-03-12
**Requirements Status:** 10 active · 3 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D017: Linear mode config lives in `.kata/preferences.md` with legacy uppercase fallback
- D018: Mode/config branching is centralized in `linear-config.ts`
- D019: `/kata prefs status` is the canonical inspection surface for active workflow mode and Linear config health
- D020: Workflow-sensitive entrypoints gate through `linear-config.ts` before touching file-backed Kata state or prompts

## Blockers

- (none)
