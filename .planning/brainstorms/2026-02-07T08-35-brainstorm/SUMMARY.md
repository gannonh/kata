# Brainstorm: What Should v1.8.0 Be?

**Date:** 2026-02-07
**Pairs:** 3 (Developer Experience, Platform Expansion, Quality & Reliability)
**Focus:** Next milestone planning for Kata

---

## Developer Experience

5 proposals survived debate. Core theme: onboarding friction is the primary adoption bottleneck.

| #   | Proposal                                 | Scope                 | Strategic Value                            |
| --- | ---------------------------------------- | --------------------- | ------------------------------------------ |
| 1   | CLAUDE.md auto-injection on project init | Small (1 plan)        | Self-discovering Kata across sessions      |
| 2   | Just-in-time preferences (scoped)        | Small-med (1-2 plans) | Cuts onboarding questions by ~40%          |
| 3   | Rich statusline with breadcrumb          | Small (1 plan)        | Eliminates most /kata-track-progress calls |
| 4   | Workflow continuity hints (Next Up)      | Medium (2-3 plans)    | Every skill becomes a chain link           |
| 5   | Error recovery system (top 5 paths)      | Small (1 plan)        | First error determines user retention      |

**Deferred:** First-run tutorial mode (maintenance cost), safe rollback (git already provides this).

[Full report](dx-report.md)

---

## Platform Expansion

4 proposals survived debate plus 1 housekeeping fix. Core theme: build infrastructure before building features.

| #   | Proposal                               | Scope               | Strategic Value                             |
| --- | -------------------------------------- | ------------------- | ------------------------------------------- |
| 1   | MCP server for Kata state              | Medium (2-3 phases) | Standards-based external integration        |
| 2   | GitHub Actions validation              | Medium (2-3 phases) | CI presence + Actions Marketplace discovery |
| 3   | Linear integration research (doc only) | Small (1 phase)     | De-risks v1.9.0                             |
| 4   | Onboarding presets (project types)     | Small (1 phase)     | Express intent, get working defaults        |
| -   | Version detection fix (#112)           | Bug fix             | Distribution credibility                    |

**Rejected:** GitHub Project Board sync (disproportionate API complexity), webhook/event system (ephemeral sessions), cross-project dashboard (contradicts platform-native constraint), template registry (premature community assumption).

[Full report](platform-report.md)

---

## Quality & Reliability

3 proposals survived debate. Core theme: catch quality issues earlier in the workflow.

| #   | Proposal                            | Scope  | Strategic Value                              |
| --- | ----------------------------------- | ------ | -------------------------------------------- |
| 1   | Plan regression guard               | Medium | Wave-level test attribution during execution |
| 2   | Plan smell detection                | Small  | Catch vague tasks before execution           |
| 3   | Cross-phase integration smoke tests | Medium | Detect breakage between phases earlier       |

**Deferred:** Test coverage dashboard (dev tool, not user-facing), verifier confidence calibration (existing 3-level system suffices).

**Rejected:** Execution replay (model non-determinism undermines premise), UAT analytics (sample sizes too small).

[Full report](quality-report.md)

---

## Cross-Cutting Themes

1. **Onboarding dominates DX.** CLAUDE.md injection, just-in-time preferences, onboarding presets, and error recovery all target the new-user experience. Three separate pairs independently identified this as the highest-leverage area.

2. **Standards alignment pays forward.** MCP server and GitHub Actions follow Kata's stated constraint of using native platform capabilities. Both create integration points that compound in value over time.

3. **Quality signals belong earlier.** Plan smell detection (planning time), regression guard (execution time), and integration smoke tests (verification time) form a pipeline that catches issues before the milestone audit.

4. **Small scope, high density.** Most surviving proposals are 1-2 plans each. The rejected ideas were consistently the large-scope, speculative ones.

---

## Recommended v1.8.0 Slate

Combining across all three pairs, ordered by dependencies:

**Phase A: Foundation (parallel, no dependencies)**
- CLAUDE.md auto-injection (1 plan)
- Rich statusline (1 plan)
- Version detection fix (bug fix)
- Plan smell detection (1 plan)

**Phase B: Onboarding & Errors (parallel)**
- Just-in-time preferences (1-2 plans)
- Onboarding presets (1 plan)
- Error recovery system (1 plan)

**Phase C: Platform Infrastructure**
- Validation extraction + GitHub Action (2-3 plans)
- MCP server Phase 1 (2-3 plans)

**Phase D: Quality Pipeline**
- Plan regression guard (2 plans)
- Cross-phase integration smoke tests (2 plans)

**Phase E: Research & Polish**
- Workflow continuity hints (2-3 plans)
- Linear integration research (1 plan, document only)

**Total estimated scope:** 15-20 plans across 5-7 phases.

This is comparable to v1.6.0 (17 plans, 5 phases) and v1.1.0 (33 plans, 10 phases). The milestone balances user-facing DX improvements (Phases A-B) with platform infrastructure (Phase C) and quality investment (Phase D).
