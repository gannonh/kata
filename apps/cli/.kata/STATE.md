# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S02 — Project Configuration & Mode Switching
**Active Task:** T04 — Wire centralized mode detection into Kata entrypoints without breaking file mode
**Phase:** Ready for next task
**Slice Branch:** kata/M002/S02
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Execute T04 in S02 — replace remaining file-mode assumptions with centralized workflow-mode checks in Kata entrypoints and add mode-switching coverage.
**Last Updated:** 2026-03-12
**Requirements Status:** 10 active · 3 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D013: Bundled custom subagents for PR reviewers (same pattern as worker/scout/researcher)
- D014: Tasks done → PR created → merge is separate action → merge confirms completion
- D015: All GitHub operations via `gh` CLI
- D016: File-backed PR body creation via `create_pr_safe.py`
- D017: Linear mode config lives in `.kata/preferences.md` with legacy uppercase fallback
- D018: Mode/config branching is centralized in `linear-config.ts`
- D019: `/kata prefs status` is the canonical inspection surface for active workflow mode and Linear config health

## Blockers

- (none)
