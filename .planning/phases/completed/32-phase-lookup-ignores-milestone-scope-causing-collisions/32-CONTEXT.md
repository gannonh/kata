# Phase 3: Phase lookup ignores milestone scope causing collisions - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix phase directory lookup collisions by reverting to globally sequential phase numbering. Phases never reset to 1 at milestone boundaries. The sequence continues indefinitely across milestones.

This reverts the 2026-02-03 decision ("per-milestone phase numbering — each milestone starts phase numbering at 1").

</domain>

<decisions>
## Implementation Decisions

### Numbering model
- Globally sequential phase numbers across all milestones
- Phase numbers never reset when a new milestone starts
- A new milestone picks up where the previous milestone's highest phase left off
- Decimal insertions (N.1, N.2) remain valid for urgent mid-milestone work

### Scope of changes
- All phase lookup code (~17 files) must stop assuming phase numbers are milestone-scoped
- Roadmap display uses global phase numbers
- Existing completed phase directories may need renaming or prefixing to eliminate collisions
- Issue source: github:gannonh/kata-orchestrator#102

### Claude's Discretion
- Migration strategy for existing phase directories with overlapping numbers
- Exact implementation of phase number continuation logic
- Whether to batch-rename historical directories or handle via lookup disambiguation

</decisions>

<specifics>
## Specific Ideas

- "Bring back sequential phases" — this was the original behavior before 2026-02-03
- The sequence should continue indefinitely, not reset

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-phase-lookup-ignores-milestone-scope-causing-collisions*
*Context gathered: 2026-02-06*
