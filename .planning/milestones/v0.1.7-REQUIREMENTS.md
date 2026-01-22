# Requirements: Kata v0.1.7 GitHub Integration

**Defined:** 2026-01-18
**Updated:** 2026-01-22 — Rescoped to v0.1.7 after v0.1.5 shipped
**Core Value:** Teams get reliable AI-driven development without abandoning their existing GitHub workflow

## v1 Requirements

Requirements for v0.1.7 release. Each maps to roadmap phases.

### Configuration

- [ ] **CFG-01**: GitHub integration enabled/disabled via `.planning/config.json`
- [ ] **CFG-02**: Issue creation mode configurable: `auto` | `ask` | `never`
- [ ] **CFG-03**: Integration config set during `/kata:new-project` onboarding

### GitHub Milestones

- [ ] **GHM-01**: `/kata:new-milestone` creates corresponding GitHub Milestone
- [ ] **GHM-02**: Milestone includes version number and description from ROADMAP.md

### GitHub Issues

- [ ] **GHI-01**: Phase issues created with `phase` label when milestone created
- [ ] **GHI-02**: Phase issues include goal and success criteria from ROADMAP.md
- [ ] **GHI-03**: Phase issues assigned to GitHub Milestone
- [ ] **GHI-04**: Plan checklist added to phase issue body
- [ ] **GHI-05**: Plan checklist items updated as plans complete

### GitHub PRs

- [ ] **GHP-01**: `/kata:execute-phase` creates PR at phase completion
- [ ] **GHP-02**: PR auto-links to phase issue with "Closes #X"
- [ ] **GHP-03**: PR title follows convention: `Phase N: [Phase Name]`
- [ ] **GHP-04**: PR body includes summary from phase SUMMARY.md

### Workflow Audit

- [ ] **WFA-01**: Document integration points in existing Kata workflows
- [ ] **WFA-02**: Add conditional GitHub logic to relevant commands/agents
- [ ] **WFA-03**: Create GitHub-specific templates/references for @file loading

## v2 Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### GitHub Project Boards

- **GPB-01**: Sync phase status to GitHub Project board columns
- **GPB-02**: Auto-move cards as phases progress

### GitHub Actions

- **GHA-01**: Trigger CI checks before PR merge
- **GHA-02**: Surface CI failures with actionable information

### Native PR Reviews

- **GPR-01**: Claude reviews PRs with full Kata context
- **GPR-02**: Review comments posted directly to GitHub
- **GPR-03**: Claude responds to team PR feedback

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Linear integration | GitHub first proves the pattern |
| Jira integration | GitHub first proves the pattern |
| VS Code adapter | Prove in Claude Code first |
| Bidirectional issue sync | One-way (Kata → GitHub) for v1 |
| GitHub Discussions | Issues sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFG-01 | Phase 1 | Pending |
| CFG-02 | Phase 1 | Pending |
| CFG-03 | Phase 2 | Pending |
| GHM-01 | Phase 2 | Pending |
| GHM-02 | Phase 2 | Pending |
| GHI-01 | Phase 3 | Pending |
| GHI-02 | Phase 3 | Pending |
| GHI-03 | Phase 3 | Pending |
| GHI-04 | Phase 4 | Pending |
| GHI-05 | Phase 4 | Pending |
| GHP-01 | Phase 5 | Pending |
| GHP-02 | Phase 5 | Pending |
| GHP-03 | Phase 5 | Pending |
| GHP-04 | Phase 5 | Pending |
| WFA-01 | Phase 1 | Pending |
| WFA-02 | Phase 4 | Pending |
| WFA-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-01-18*
*Last updated: 2026-01-22 — rescoped to v0.1.7 after v0.1.5 shipped*
