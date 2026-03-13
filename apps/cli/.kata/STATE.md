# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S04 — Document Storage — Artifacts as Linear Documents
**Active Task:** (none — S04 not yet started)
**Phase:** Planning
**Slice Branch:** (not yet created — start from kata/M002/S03 base or main)
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** S03 complete — begin S04 (Document Storage). Create branch kata/M002/S04, read S04 slice plan, execute.
**Last Updated:** 2026-03-12
**Requirements Status:** 17 active · 5 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D021: Kata entity title format is `[M001] Title` bracket prefix (parseable, visually distinct)
- D022: Three Kata labels — `kata:milestone` (provisioned), `kata:slice` (applied to slices), `kata:task` (applied to tasks)
- D023: Kata phase→Linear state type: `backlog`→`backlog`, `planning`→`unstarted`, `executing`/`verifying`→`started`, `done`→`completed`
- D024: `linear-entities.ts` lives in the linear extension, takes explicit client+config args, no kata-extension imports
- D025: `LinearEntityClient` interface exported from `linear-entities.ts` as the structural contract for mock clients — avoids importing the full `LinearClient` class into the pure mapping module

## Blockers

- (none)

## M002 Slice Progress

- [x] S01: Linear GraphQL Client Extension
- [x] S02: Project Configuration & Mode Switching
- [x] S03: Entity Mapping — Hierarchy & Labels
- [ ] S04: Document Storage — Artifacts as Linear Documents ← next
- [ ] S05: State Derivation from Linear API
- [ ] S06: Workflow Prompt & Auto-Mode Integration
