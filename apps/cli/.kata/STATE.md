# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S02 — Project Configuration & Mode Switching
**Active Task:** T01 — Extend project preferences for workflow mode and Linear binding
**Phase:** Executing
**Slice Branch:** kata/M002/S02
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Execute T01 in S02 — extend `.kata/preferences.md` schema/template/docs for `workflow.mode` + `linear` config and add parser compatibility tests.
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
