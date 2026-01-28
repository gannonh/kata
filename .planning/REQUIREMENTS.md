# Requirements: Kata v1.3.0

## v1.3.0 Requirements

### Release Automation

- [ ] **REL-01**: User can auto-generate changelog entries from conventional commits when completing a milestone
- [ ] **REL-02**: User can auto-detect semantic version bump (major/minor/patch) based on commit types
- [ ] **REL-03**: User can trigger release workflow from milestone completion (milestone → PR merge → GitHub Release → CI publish)
- [ ] **REL-04**: User can dry-run a release to validate workflow without publishing

### Workflow Documentation

- [ ] **DOC-01**: User can view Mermaid diagrams for core orchestrators (plan-phase, execute-phase, verify-phase)
- [ ] **DOC-02**: User can see decision trees documenting all branch points in workflows
- [ ] **DOC-03**: User can view ASCII fallback diagrams for terminal-only environments
- [ ] **DOC-04**: User can generate diagrams for all skills in batch

### User Experience

- [ ] **UX-01**: User's CLAUDE.md gets Kata section added during project-new explaining commands, hierarchy, and planning files
- [ ] **UX-02**: User can see project info in statusline (milestone, phase, suggested next command)
- [ ] **UX-03**: User receives UX expectations during onboarding explaining conversational interface

---

## Future Requirements

**Deferred to later milestones:**
- Quickstart documentation ("Try Kata in 5 minutes") — v1.4.0
- Release rollback/recovery workflow — v1.4.0
- Auto-detection of diagram staleness — v1.4.0

---

## Out of Scope

**Not building:**
- Interactive onboarding wizard (quickstart docs sufficient)
- Real-time diagram synchronization (manual regeneration acceptable)
- Diagram editor UI (Mermaid Live Editor exists)

---

## Traceability

| Requirement | Phase | Plan | Status |
| ----------- | ----- | ---- | ------ |
| REL-01      | —     | —    | —      |
| REL-02      | —     | —    | —      |
| REL-03      | —     | —    | —      |
| REL-04      | —     | —    | —      |
| DOC-01      | —     | —    | —      |
| DOC-02      | —     | —    | —      |
| DOC-03      | —     | —    | —      |
| DOC-04      | —     | —    | —      |
| UX-01       | —     | —    | —      |
| UX-02       | —     | —    | —      |
| UX-03       | —     | —    | —      |

---
*Created: 2026-01-28*
