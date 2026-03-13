# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S05 — State Derivation from Linear API
**Active Task:** (none — planning S05)
**Phase:** Planning
**Slice Branch:** kata/M002/S04 (to be merged; S05 branch forthcoming)
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Begin S05 — State Derivation from Linear API
**Last Updated:** 2026-03-12
**Requirements Status:** 16 active · 6 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D024: `linear-entities.ts` lives in the linear extension, takes explicit client+config args, no kata-extension imports
- D025: `LinearEntityClient` interface exported from `linear-entities.ts` as the structural contract for mock clients
- D026: `DocumentAttachment = { projectId: string } | { issueId: string }` discriminated union enforces "attach to one target only" at type level
- D027: Document upsert strategy — title-scoped first-match: list by scope+title → update if found, create if not
- D028: Linear normalizes `- ` bullets to `* ` and strips trailing newlines on document write — downstream parsers must handle `* ` list syntax

## Blockers

- (none)

## M002 Slice Progress

- [x] S01: Linear GraphQL Client Extension
- [x] S02: Project Configuration & Mode Switching
- [x] S03: Entity Mapping — Hierarchy & Labels
- [x] S04: Document Storage — Artifacts as Linear Documents
- [ ] S05: State Derivation from Linear API ← next
- [ ] S06: Workflow Prompt & Auto-Mode Integration
