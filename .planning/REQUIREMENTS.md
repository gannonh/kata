# Requirements: v1.5.0 Phase Management

**Milestone:** v1.5.0
**Created:** 2026-02-01
**Total Requirements:** 7

---

## v1.5.0 Requirements

### Phase Management

- [ ] **PHASE-01**: Organize phase folders into state directories: `pending/`, `active/`, `completed/`
- [ ] **PHASE-02**: Move phases between milestones via `/kata:move-phase` skill
- [ ] **PHASE-03**: Reorder phases within a milestone with automatic renumbering of subsequent phases
- [ ] **PHASE-04**: Reset phase numbering at milestone boundaries (each milestone starts at phase 1, not cumulative)
- [ ] **PHASE-05**: Validate phase artifacts at completion (PLAN.md, SUMMARY.md existence; VERIFICATION.md for non-gap phases)

### Roadmap Improvements

- [ ] **ROAD-01**: Show future milestones in ROADMAP.md (currently only shows current milestone)
- [ ] **ROAD-02**: Improve roadmap format for readability (clearer phase/milestone hierarchy, better progress indicators)

---

## Traceability

| Requirement | Phase   | Verified |
| ----------- | ------- | -------- |
| PHASE-01    | Phase 1 | -        |
| PHASE-02    | Phase 2 | -        |
| PHASE-03    | Phase 2 | -        |
| PHASE-04    | Phase 2 | -        |
| PHASE-05    | Phase 1 | -        |
| ROAD-01     | Phase 3 | -        |
| ROAD-02     | Phase 3 | -        |

---

## Out of Scope

**Deferred to future milestones:**
- Linear integration (separate integration milestone)
- GitHub Project board sync (later GitHub phase)
- Phase templates/presets (later enhancement)

**Explicitly not building:**
- Full project management UI (use Kata skills via CLI)
- Cross-project phase management (single project scope)

---
*Requirements carried over from v1.4.0: 2026-02-01*
