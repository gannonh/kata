# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S06 — Workflow Prompt & Auto-Mode Integration
**Active Task:** (none — S06 not yet started)
**Phase:** Planning
**Slice Branch:** kata/M002/S05 (pending squash-merge to main; S06 branch not yet cut)
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Squash-merge S05 to main, cut kata/M002/S06 branch, begin S06
**Last Updated:** 2026-03-12T19:00
**Requirements Status:** 14 active · 8 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D029: `LinearStateClient` interface from `linear-state.ts` — 2 methods (listMilestones + listIssues); same pattern as D025
- D030: `deriveLinearState` is pure-issue-state — no document parsing; aligns with D009 and avoids D028 pitfall
- D031: `started` state type → `executing`/`verifying`/`summarizing` by children completion ratio
- D032: `kata_derive_state` tool is zero-ceremony — reads config from preferences, resolves labels internally

## Blockers

- (none)

## M002 Slice Progress

- [x] S01: Linear GraphQL Client Extension
- [x] S02: Project Configuration & Mode Switching
- [x] S03: Entity Mapping — Hierarchy & Labels
- [x] S04: Document Storage — Artifacts as Linear Documents
- [x] S05: State Derivation from Linear API
- [ ] S06: Workflow Prompt & Auto-Mode Integration
