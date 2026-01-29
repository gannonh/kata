# Requirements: v1.4.0 Issue & Phase Management

**Milestone:** v1.4.0
**Created:** 2026-01-29
**Total Requirements:** 13

---

## v1.4.0 Requirements

### Issue Model

- [ ] **ISS-01**: Rename "todos" vocabulary to "issues" throughout Kata (skills, UI messages, file references)
- [ ] **ISS-02**: Store issues as GitHub Issues with `backlog` label when `github.enabled=true`
- [ ] **ISS-03**: Keep local `.planning/issues/` fallback for non-GitHub projects
- [ ] **ISS-04**: Display issues in `/kata:check-issues` (renamed from check-todos) with unified view across local and GitHub sources

### Pull from GitHub

- [ ] **PULL-01**: Pull existing GitHub Issues into Kata workflow (query via `gh issue list`, filter by labels, make workable)
- [ ] **PULL-02**: Link Kata execution to external GitHub Issues (reference existing issues during phase execution, auto-update on completion)

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

| Requirement | Phase | Verified |
| ----------- | ----- | -------- |
| ISS-01      | TBD   | ☐        |
| ISS-02      | TBD   | ☐        |
| ISS-03      | TBD   | ☐        |
| ISS-04      | TBD   | ☐        |
| PULL-01     | TBD   | ☐        |
| PULL-02     | TBD   | ☐        |
| PHASE-01    | TBD   | ☐        |
| PHASE-02    | TBD   | ☐        |
| PHASE-03    | TBD   | ☐        |
| PHASE-04    | TBD   | ☐        |
| PHASE-05    | TBD   | ☐        |
| ROAD-01     | TBD   | ☐        |
| ROAD-02     | TBD   | ☐        |

---

## Out of Scope

**Deferred to future milestones:**
- Linear integration (separate integration milestone)
- GitHub Project board sync (later GitHub phase)
- Issue templates/forms (later enhancement)

**Explicitly not building:**
- Full issue tracker UI (use GitHub/local files directly)
- Issue assignment to team members (GitHub handles this natively)

---
*Requirements defined: 2026-01-29*
