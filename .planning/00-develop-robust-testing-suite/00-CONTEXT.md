# Phase 0: Develop Robust Testing Suite - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish comprehensive testing infrastructure to validate Kata skills and agents. Every workflow segment gets tested to ensure: no errors in file reads, correct artifacts are created, and correct next steps are proposed by Claude.

</domain>

<decisions>
## Implementation Decisions

### Testing approach
- Use Claude CLI with `-p` flag to invoke skills with user-like prompts
- Evaluate both stdout output and artifacts created on disk
- Focus on deterministic outputs — Kata's template-driven design constrains Claude to produce predictable artifacts, file structures, and next-step directions
- Tests validate structured outputs (files, commands, patterns), not free-form prose

### Test coverage scope
- Comprehensive coverage across ALL skills — every workflow segment
- Skills to test include: adding phases, adding todos, configuring system, completing milestones, discussing phases, executing phases, inserting phases, planning phases, verifying phases, and all others
- No prioritization — all skills equally important for baseline

### CI/CD integration
- Tests run on every PR, must pass to merge
- Affected tests only — detect which skills changed, run only relevant tests (cost control for API calls)
- Failures reported via GitHub PR annotations — inline comments on failing lines, summary in PR checks

### Claude's Discretion
- Assertion strategy per test (file-based, structural validation, key phrase matching)
- Test file organization and naming conventions
- How to detect affected skills from PR diff
- Specific patterns for validating next-step proposals

</decisions>

<specifics>
## Specific Ideas

- Tests invoke `claude -p "user prompt"` and check resulting state
- All tested parts are the deterministic outputs from templates and scripts
- Should be able to catch regressions when skills or agents are modified

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 00-develop-robust-testing-suite*
*Context gathered: 2026-01-25*
