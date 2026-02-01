# Requirements: v1.4.1 Issue Execution

**Milestone:** v1.4.1
**Created:** 2026-02-01
**Total Requirements:** 9

---

## v1.4.1 Requirements

### PR → Issue Closure

- [ ] **CLOSE-01**: Phase execution PRs include `Closes #X` for the phase GitHub Issue
- [ ] **CLOSE-02**: Milestone completion PRs include `Closes #X` for all completed phase issues
- [ ] **CLOSE-03**: Issue execution PRs include `Closes #X` for the source issue

### Issue Execution Workflow

- [ ] **EXEC-01**: "Work on it now" offers execution mode selection (quick task vs planned)
- [ ] **EXEC-02**: Quick task execution creates plan, executes with commits, creates PR with `Closes #X`
- [ ] **EXEC-03**: Planned execution links issue to a new or existing phase

### Issue → Roadmap Integration

- [ ] **INTEG-01**: Pull backlog issues into a milestone's scope via `/kata:add-milestone` or dedicated skill
- [ ] **INTEG-02**: Pull issues into a phase (becomes a task/plan within the phase)
- [ ] **INTEG-03**: Phase plans can reference their source issue number for traceability

---

## Traceability

| Requirement | Phase   | Verified |
| ----------- | ------- | -------- |
| CLOSE-01    | Phase 1 | -        |
| CLOSE-02    | Phase 1 | -        |
| CLOSE-03    | Phase 1 | -        |
| EXEC-01     | Phase 2 | -        |
| EXEC-02     | Phase 2 | -        |
| EXEC-03     | Phase 2 | -        |
| INTEG-01    | Phase 3 | -        |
| INTEG-02    | Phase 3 | -        |
| INTEG-03    | Phase 3 | -        |

---

## Out of Scope

**Deferred to v1.5.0:**
- Phase organization (state directories)
- Phase movement between milestones
- Roadmap format enhancements

**Explicitly not building:**
- Issue dependencies (issue A blocks issue B)
- Issue estimation/sizing
- Issue templates beyond current format

---
*Requirements defined: 2026-02-01*
