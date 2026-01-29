# Requirements: Kata v1.3.3

## v1.3.3 Requirements

### Internal Tooling

- [x] **TOOL-01**: User can view Mermaid flow diagrams documenting Kata's major workflow paths (orchestration, lifecycle, planning, execution, verification, PR)
- [x] **TOOL-02**: User can reference a Kata glossary defining key terms (milestone, phase, issue, plan, etc.) with clear relationships

---

## v1.3.0 Requirements (Complete)

### Release Automation

- [x] **REL-01**: User can auto-generate changelog entries from conventional commits when completing a milestone
- [x] **REL-02**: User can auto-detect semantic version bump (major/minor/patch) based on commit types
- [x] **REL-03**: User can trigger release workflow from milestone completion (milestone → PR merge → GitHub Release → CI publish)
- [x] **REL-04**: User can dry-run a release to validate workflow without publishing

---

## Future Requirements

**v1.4.0 — Issue & Phase Management:**

*Issue Model:*
- [ ] **ISS-01**: "Todos" renamed to "issues" in all skills, commands, and terminology
- [ ] **ISS-02**: Local issue storage uses `.planning/issues/` directory structure
- [ ] **ISS-03**: When GitHub enabled, issues sync bidirectionally with GitHub Issues (backlog label)
- [ ] **ISS-04**: Projects without GitHub use local-only issue storage
- [ ] **PULL-01**: User can pull a GitHub Issue into Kata workflow
- [ ] **PULL-02**: Pulled issues become active work items with Kata tracking

*Phase Management:*
- [ ] **PHASE-01**: Phase folders organized as pending/active/completed structure
- [ ] **PHASE-02**: User can move a phase to a different position in the roadmap
- [ ] **PHASE-03**: User can move a phase to a different milestone
- [ ] **PHASE-04**: Phase numbering resets per milestone (each milestone has Phase 1, 2, 3... not global numbering)
- [ ] **PHASE-05**: Artifact validation at phase/milestone completion — thorough review and cleanup of REQUIREMENTS.md, ROADMAP.md, PROJECT.md, MILESTONES.md, STATE.md (agent verification loop or validation scripts)

*Roadmap Improvements:*
- [ ] **ROAD-01**: Roadmap shows FUTURE milestones (what's coming), not just current and past
- [ ] **ROAD-02**: Roadmap format clearly shows current position and what's next

**Deferred to later milestones:**
- Demo projects for UAT testing (fixture projects in various states)
- UX-01: CLAUDE.md Kata section during project-new
- UX-02: Statusline project info
- UX-03: Onboarding UX expectations
- Quickstart documentation ("Try Kata in 5 minutes")
- Release rollback/recovery workflow

---

## Out of Scope

**Not building:**
- Interactive onboarding wizard (quickstart docs sufficient)
- Real-time diagram synchronization (manual regeneration acceptable)
- Diagram editor UI (Mermaid Live Editor exists)

---

## Traceability

| Requirement | Phase   | Plan    | Status  |
| ----------- | ------- | ------- | ------- |
| TOOL-01     | Phase 1 | 01-01   | Pending |
| TOOL-02     | Phase 1 | 01-02   | Pending |

**Coverage:** 2/2 requirements mapped to plans (100%)

---
*Created: 2026-01-28*
*Last updated: 2026-01-29 — Plans assigned to requirements*
