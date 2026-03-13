# Kata State

**Active Milestone:** M002 — Linear Mode
**Active Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Active Task:** T01 — Types, Title Conventions, and Phase-State Mapping
**Phase:** Executing
**Slice Branch:** kata/M002/S03
**Active Workspace:** /Volumes/EVO/kata/kata-mono/apps/cli
**Next Action:** Execute T01 — extend `linear-types.ts` with `KataPhase`/`KataLabelSet`/`KataEntityCreationConfig`, create `linear-entities.ts` with title format/parse functions and phase-state mapping, write unit tests in `tests/entity-mapping.test.ts`.
**Last Updated:** 2026-03-12
**Requirements Status:** 9 active · 4 validated · 0 deferred · 3 out of scope

## Recent Decisions

- D021: Kata entity title format is `[M001] Title` bracket prefix (parseable, visually distinct)
- D022: Three Kata labels — `kata:milestone` (provisioned), `kata:slice` (applied to slices), `kata:task` (applied to tasks)
- D023: Kata phase→Linear state type: `backlog`→`backlog`, `planning`→`unstarted`, `executing`/`verifying`→`started`, `done`→`completed`
- D024: `linear-entities.ts` lives in the linear extension, takes explicit client+config args, no kata-extension imports

## Blockers

- (none)
