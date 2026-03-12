# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S02 — Project Configuration & Mode Switching
**Active Task:** T02 — Build centralized Linear config resolution and live validation helpers
**Phase:** Executing
**Slice Branch:** kata/M002/S02
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Execute T02 in S02 — add centralized Linear mode/config resolution plus validation helpers and test coverage.
**Last Updated:** 2026-03-12
**Requirements Status:** 10 active · 3 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D013: Bundled custom subagents for PR reviewers (same pattern as worker/scout/researcher)
- D014: Tasks done → PR created → merge is separate action → merge confirms completion
- D015: All GitHub operations via `gh` CLI
- D016: File-backed PR body creation via `create_pr_safe.py`
- D017: Linear mode config lives in `.kata/preferences.md` with legacy uppercase fallback
- D018: Mode/config branching is centralized in `linear-config.ts`

## Blockers

- (none)
