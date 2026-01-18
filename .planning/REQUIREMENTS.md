# Requirements: GSD Enterprise

**Defined:** 2026-01-17
**Core Value:** Teams get reliable AI-driven development without abandoning their existing GitHub workflow

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### VS Code Support

- [ ] **VSCODE-01**: GSD workflow runs in VS Code (slash commands functional)
- [ ] **VSCODE-02**: Native VS Code extension (not bash workarounds)
- [ ] **VSCODE-03**: Proper installer workflow for teams

### GitHub Issues Integration

- [ ] **GHISS-01**: Bidirectional sync between GSD milestones/phases and GitHub issues
- [ ] **GHISS-02**: Issue lifecycle tracking (New -> In Progress -> In Review -> Done)
- [ ] **GHISS-03**: Auto-labeling (type, priority, size applied automatically)
- [ ] **GHISS-04**: Issue templates (bug report, feature request)

### GitHub PR Workflow

- [ ] **GHPR-01**: Auto-create PRs after execute-phase completes
- [ ] **GHPR-02**: Branch naming conventions enforced (feature/, fix/, doc/, chore/, refactor/)
- [ ] **GHPR-03**: Conventional commits format (feat, fix, docs, style, refactor, test, chore)
- [ ] **GHPR-04**: Draft PR support for early feedback
- [ ] **GHPR-05**: Auto-generate PR descriptions with linked issues, summary, testing steps
- [ ] **GHPR-06**: Native PR reviews posted as GitHub comments (replaces CodeRabbit)
- [ ] **GHPR-07**: Read and respond to team PR comments

### GitHub CI/CD Integration

- [ ] **GHCI-01**: Orchestrate CI checks (lint, build, test) before merge
- [ ] **GHCI-02**: Auto-generate changelog from merged PRs

### Integration Architecture

- [ ] **INTG-01**: Extensible integration architecture exists (for GitHub, Linear, Jira, etc.)
- [ ] **INTG-02**: GitHub integration implemented using this architecture (proves the pattern)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Additional IDEs

- **IDE-01**: Cursor support (full GSD workflow)
- **IDE-02**: Antigravity support (full GSD workflow)
- **IDE-03**: Augment Code support (full GSD workflow)

### Additional Integrations

- **INTG-03**: Linear integration (issues, projects, cycles sync)
- **INTG-04**: Jira integration (issues, sprints sync)
- **INTG-05**: Integration documentation for third-party developers
- **INTG-06**: Integration discovery/registration system

### Enhanced CI/CD

- **CICD-01**: Coverage enforcement (block merge if coverage drops)
- **CICD-02**: Auto-deploy to staging/production
- **CICD-03**: Release workflow automation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Building an IDE | Coordination layer only, use existing tools |
| Building an LLM | Use Claude, not compete with it |
| Building an agent framework | Use platform-native capabilities (subagents, Skills, MCPs) |
| Hard fork from upstream | Start as extension, fork only if necessary |
| Real-time collaboration | Teams collaborate via GitHub, not a custom system |
| Custom project management | Integrate with existing tools (GitHub, Linear), don't replace |
| CodeRabbit integration | Native PR reviews replace it |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INTG-01 | Phase 1: Integration Architecture | Pending |
| INTG-02 | Phase 1: Integration Architecture | Pending |
| GHISS-01 | Phase 2: GitHub Issues Core | Pending |
| GHISS-02 | Phase 2: GitHub Issues Core | Pending |
| GHISS-03 | Phase 3: GitHub Issues Polish | Pending |
| GHISS-04 | Phase 3: GitHub Issues Polish | Pending |
| GHPR-01 | Phase 4: GitHub PR Creation | Pending |
| GHPR-02 | Phase 4: GitHub PR Creation | Pending |
| GHPR-03 | Phase 4: GitHub PR Creation | Pending |
| GHPR-04 | Phase 4: GitHub PR Creation | Pending |
| GHPR-05 | Phase 4: GitHub PR Creation | Pending |
| GHPR-06 | Phase 5: GitHub PR Collaboration | Pending |
| GHPR-07 | Phase 5: GitHub PR Collaboration | Pending |
| GHCI-01 | Phase 6: GitHub CI/CD | Pending |
| GHCI-02 | Phase 6: GitHub CI/CD | Pending |
| VSCODE-01 | Phase 7: VS Code Adapter | Pending |
| VSCODE-02 | Phase 7: VS Code Adapter | Pending |
| VSCODE-03 | Phase 7: VS Code Adapter | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18 ✓
- Unmapped: 0

---
*Requirements defined: 2026-01-17*
*Last updated: 2026-01-17 after roadmap creation*
