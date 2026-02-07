# Requirements: v1.7.0 Brainstorm Integration

## Skill Shipping

- [ ] **SKILL-01**: kata-brainstorm skill included in plugin build output
- [ ] **SKILL-02**: Skill loads and invokes correctly via `/kata-brainstorm`
- [ ] **SKILL-03**: Brainstorm output written to `.planning/brainstorms/YYYY-MM-DDTHH-MM-brainstorm/`

## Agent Teams Prerequisite

- [ ] **PREREQ-01**: Brainstorm skill checks whether Agent Teams are enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) before spawning teams
- [ ] **PREREQ-02**: If Agent Teams not enabled, offer to enable by writing `{"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}}` to `~/.claude/settings.json`
- [ ] **PREREQ-03**: If user declines enabling, skip brainstorm gracefully with explanation

## Workflow Integration

- [ ] **WFLOW-01**: kata-add-milestone offers optional brainstorm step before gathering milestone goals
- [ ] **WFLOW-02**: kata-plan-phase offers optional brainstorm step at research decision gate
- [ ] **WFLOW-03**: kata-new-project offers optional brainstorm step after initial project description
- [ ] **WFLOW-04**: kata-discuss-phase offers optional brainstorm step before presenting gray areas
- [ ] **WFLOW-05**: kata-research-phase offers optional brainstorm follow-up after research completes

## Context Injection

- [ ] **CTX-01**: Brainstorm agents receive condensed project brief from PROJECT.md, ROADMAP.md, open issues, and recent milestones
- [ ] **CTX-02**: Brainstorm output (SUMMARY.md) auto-feeds into downstream agents (researcher, planner) as context

## Future Requirements

- Issue creation from brainstorm output (convert proposals to Kata issues)
- Brainstorm session history/archive indexing
- Custom remit configuration beyond default 3 pairs

## Out of Scope

- Modifying the core brainstorm skill logic (explorer/challenger pattern already works)
- Non-Agent-Teams fallback (brainstorm requires Agent Teams by design)

## Traceability

| Requirement | Phase | Plan |
|-------------|-------|------|
| SKILL-01    | —     | —    |
| SKILL-02    | —     | —    |
| SKILL-03    | —     | —    |
| PREREQ-01   | —     | —    |
| PREREQ-02   | —     | —    |
| PREREQ-03   | —     | —    |
| WFLOW-01    | —     | —    |
| WFLOW-02    | —     | —    |
| WFLOW-03    | —     | —    |
| WFLOW-04    | —     | —    |
| WFLOW-05    | —     | —    |
| CTX-01      | —     | —    |
| CTX-02      | —     | —    |
