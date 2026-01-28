# Requirements: Kata v1.3.0

## v1.3.0 Requirements

### Release Automation

- [x] **REL-01**: User can auto-generate changelog entries from conventional commits when completing a milestone
- [x] **REL-02**: User can auto-detect semantic version bump (major/minor/patch) based on commit types
- [x] **REL-03**: User can trigger release workflow from milestone completion (milestone → PR merge → GitHub Release → CI publish)
- [x] **REL-04**: User can dry-run a release to validate workflow without publishing

---

## Future Requirements

**v1.4.0 — Workflow Documentation & UX:**
- [ ] **DOC-01**: User can view Mermaid diagrams for core orchestrators (plan-phase, execute-phase, verify-phase)
- [ ] **DOC-02**: User can see decision trees documenting all branch points in workflows
- [ ] **DOC-03**: User can view ASCII fallback diagrams for terminal-only environments
- [ ] **DOC-04**: User can generate diagrams for all skills in batch
- [ ] **UX-01**: User's CLAUDE.md gets Kata section added during project-new explaining commands, hierarchy, and planning files
- [ ] **UX-02**: User can see project info in statusline (milestone, phase, suggested next command)
- [ ] **UX-03**: User receives UX expectations during onboarding explaining conversational interface

**Deferred to later milestones:**
- Quickstart documentation ("Try Kata in 5 minutes")
- Release rollback/recovery workflow
- Auto-detection of diagram staleness

---

## Out of Scope

**Not building:**
- Interactive onboarding wizard (quickstart docs sufficient)
- Real-time diagram synchronization (manual regeneration acceptable)
- Diagram editor UI (Mermaid Live Editor exists)

---

## Traceability

| Requirement | Phase   | Plan  | Status   |
| ----------- | ------- | ----- | -------- |
| REL-01      | Phase 1 | 01-01 | Complete |
| REL-02      | Phase 1 | 01-01 | Complete |
| REL-03      | Phase 1 | 01-02 | Complete |
| REL-04      | Phase 1 | 01-02 | Complete |

**Coverage:** 4/4 requirements mapped (100%)

---
*Created: 2026-01-28*
*Last updated: 2026-01-28 — Phase 1 complete, all REL requirements satisfied*
