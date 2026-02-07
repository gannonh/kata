# Quality & Reliability Report for v1.8.0

## Overview

Seven proposals evaluated for improving Kata's output quality and verification reliability. Proposals ranked by impact-to-effort ratio with explorer proposals and challenger critique applied. The existing quality infrastructure (6-agent PR review, UAT workflow, plan-checker with 6 verification dimensions, verifier with 3-level artifact checking) provides a strong foundation. These proposals target gaps in regression detection, plan quality prediction, and cross-phase integrity.

---

## Recommended: High Priority

### 1. Automated Plan Smell Detection

**What:** Extend plan-checker-instructions.md with a new "Dimension 7: Plan Smells" pass. Detect common anti-patterns that predict execution failures:
- Tasks with vague verbs ("set up", "handle", "manage") combined with short action fields
- Tasks modifying more than 5 files
- Verify steps that only check file existence rather than behavior
- Plans depending on external services with no mocking strategy

**Why:** The plan-checker verifies structural correctness (fields present, dependencies valid, scope within budget) across 6 dimensions. It does not assess whether task specifications are precise enough for reliable execution. Vague tasks produce inconsistent results across runs.

**Scope:** Small

**Implementation sketch:**
- Add Dimension 7 section to `skills/kata-verify-work/references/plan-checker-instructions.md`
- Check for vague verbs + short action fields (context-dependent, not verb-alone)
- Count files per task from `<files>` elements
- Check verify elements for "file exists" vs behavioral verification

**Critique applied:** Smell thresholds are inherently subjective. May produce noise for experienced users who write terse-but-precise tasks. Mitigation: report as `info` severity (not `warning` or `blocker`), let users suppress specific smells in config.json.

**Challenger refinements:**
1. Drop the "action shorter than name" smell. Task names in Kata are deliberately short (`Task 1: Create login endpoint`). The action field is where detail lives. Comparing lengths is meaningless because the fields serve different purposes.
2. Vague verb detection must be context-dependent. "implement" is vague in `implement auth` but specific in `implement POST /api/auth/login accepting {email, password}`. Check for vague verbs + insufficient qualifying details, not vague verbs alone.

**Verdict:** Proceed. Strongest proposal. Zero new files, zero new infrastructure. The plan-checker is the right place since it already gates execution.

---

### 2. Plan Regression Guard

**What:** Capture test suite results before and after each execution wave. Diff results to detect regressions at the wave level. Extend step 6.5 of `kata-execute-phase` which already runs `npm test`.

**Why:** The current test run (step 6.5) reports aggregate pass/fail at the phase level. It cannot distinguish a regression introduced in Wave 1 from a pre-existing failure. Wave-level attribution enables targeted investigation.

**Scope:** Medium

**Implementation sketch:**
- Before Wave 1: capture `npm test` output as baseline snapshot
- After each wave: re-run, diff against baseline, flag new failures
- Attribute failures to the wave as a whole (not individual plans within a wave)
- Block SUMMARY creation for the wave if regressions detected

**Critique applied:** Projects without test suites get no benefit. Flaky tests produce false positives. Mitigation: skip this step if no test script detected (matching existing step 6.5 behavior).

**Challenger refinements:**
1. **Scope to wave-level attribution, not plan-level.** Plans within a wave execute in parallel and may touch overlapping files. If Wave 1 has Plans 01 and 02 both modifying `src/lib/utils.ts`, file-change correlation cannot determine which plan caused a test failure. Attempting plan-level attribution would require sequential execution, destroying parallelism and the ~3 min execution cadence.
2. **Drop flake tolerance entirely.** A flake tolerance threshold (run tests N times, accept if majority pass) either triples test execution time or requires a flake registry feature that doesn't exist. Ship the simpler version: baseline before Wave 1, diff after each wave, flag new failures at the wave level. Users inspect manually if regressions appear.

**Verdict:** Proceed with scoped version. Wave-level regression detection without flake management.

---

### 3. Cross-Phase Integration Smoke Tests

**What:** Periodically re-verify key_links from completed phases to detect cross-phase breakage earlier than the milestone audit.

**Why:** Kata verifies phases in isolation. Phase 3 might refactor a module that Phase 1 depends on. The milestone audit catches this at the end, but late detection increases rework cost.

**Scope:** Medium

**Challenger critique (significant concerns):**

1. **Key_link verification relies on framework-specific grep patterns.** The verifier checks for `fetch`, `axios`, `prisma.$model`, `onSubmit` (see verifier-instructions.md lines 218-360). These patterns work for React/Next.js/Prisma codebases. Running against Rails, Go, Flask, or other stacks produces zero useful signal. The verifier already marks uncertain cases as "? UNCERTAIN."

2. **Non-blocking warnings become noise.** A warning on every phase completion that users cannot act on (no structured remediation path until milestone audit) trains users to ignore it. If the warning triggers false positives from intentional API refactors, the signal-to-noise ratio drops further.

3. **Quadratic scaling.** Phase N checks phases 1 through N-1. A 10-phase milestone accumulates 45 cross-checks. With grep-based verification, this adds execution time to every phase.

**Descoped alternative:** Run the integration checker from `kata-audit-milestone` in lightweight mode after every 3rd completed phase, not after every phase. This reduces overhead by 66% while still catching breakage before end-of-milestone.

**Verdict:** Defer to lower priority or proceed only with the descoped periodic approach. The milestone audit already serves this purpose. Per-phase integration checks add cost without proportional benefit.

---

## Recommended: Lower Priority

### 4. Skill Test Coverage Dashboard

**What:** Analyze `tests/skills/*.test.js` files against skill capabilities from `skills/kata-*/SKILL.md` to report coverage gaps. Map test descriptions to skill behaviors.

**Scope:** Small

**Critique applied:** Useful for Kata's own development but not directly user-facing. Better suited as a development tool than a shipped skill. The 29 skills / 27 test files mapping is Kata-internal, not relevant to user projects.

**Verdict:** Defer. Useful for Kata maintainers but does not improve user-facing quality. Implement as a development script in `scripts/` rather than a skill.

---

### 5. Verifier Confidence Calibration

**What:** Replace binary VERIFIED/FAILED with confidence percentages per truth, based on verification depth reached.

**Scope:** Medium

**Critique applied:** The verifier already reports three levels (existence, substantive, wired) with clear status indicators. Adding numeric percentages creates false precision. A file that "exists, is substantive, but is not wired" provides more actionable information than "75% confident." Users need to know what to fix, not how confident the system is.

**Verdict:** Defer. The existing three-level reporting already communicates verification depth effectively. Numeric confidence adds complexity without proportional value. If pursued, implement as a supplementary score in VERIFICATION.md frontmatter rather than replacing the status system.

---

## Not Recommended

### 6. Execution Replay / Deterministic Re-run

**What:** Record execution traces for replay and drift detection.

**Scope:** Large

**Critique applied:** Three fundamental problems:
1. **Model non-determinism undermines the value proposition.** LLM outputs vary across runs even with identical inputs. Comparing outputs for "drift" would produce noise, not signal.
2. **Trace storage is expensive.** Full prompts for each subagent (including inlined file contents) can be 50-100KB per plan. A 5-plan phase generates 250-500KB of trace data per run.
3. **Debugging benefit is marginal.** The actual execution record already exists: SUMMARY.md files document what happened, VERIFICATION.md documents what was verified, git history shows what changed. Adding a parallel trace system duplicates information.

**Verdict:** Do not pursue. The core premise (deterministic comparison) conflicts with the probabilistic nature of LLM execution. Existing artifacts (SUMMARY, VERIFICATION, git log) already serve the post-mortem use case.

---

### 7. UAT Session Analytics

**What:** Aggregate UAT results across phases to identify recurring failure patterns.

**Scope:** Medium

**Critique applied:** Two problems:
1. **Small sample sizes.** Most projects have 3-8 phases. Statistical patterns from 3-8 UAT sessions are unreliable.
2. **Issue categories are inferred, not classified.** UAT severity comes from keyword matching on free-text user responses. Aggregating these into "60% of issues are wiring failures" requires a classification system that does not exist.

**Verdict:** Do not pursue for v1.8.0. Revisit if Kata accumulates cross-project analytics data in a future telemetry system.

---

## Summary Table

| # | Proposal | Priority | Scope | Verdict |
|---|----------|----------|-------|---------|
| 1 | Plan Smell Detection | High | Small | Proceed |
| 2 | Plan Regression Guard | High | Medium | Proceed (wave-level only) |
| 3 | Cross-Phase Integration | Low | Medium | Defer or descope to periodic |
| 4 | Test Coverage Dashboard | Low | Small | Defer (dev tool) |
| 5 | Confidence Calibration | Low | Medium | Defer |
| 6 | Execution Replay | N/A | Large | Do not pursue |
| 7 | UAT Analytics | N/A | Medium | Do not pursue |

## Consensus

Explorer and challenger agree on proposals 4-7 (defer or reject). Proposals 1-2 are viable with the scoping refinements documented above. Proposal 3 is contested: explorer recommends proceeding, challenger recommends deferring or descoping to a periodic check (every 3rd phase) rather than per-phase.

## Next Steps

Suggested implementation order:
1. **Plan Smell Detection** (smallest scope, extends existing plan-checker-instructions.md, zero new files)
2. **Plan Regression Guard** (medium scope, builds on existing step 6.5, scoped to wave-level attribution without flake management)
3. **Periodic Integration Check** (if pursued, descoped: run integration checker after every 3rd phase, not every phase)

## Additional Finding

During codebase analysis, the challenger identified that `failure-finder-instructions.md` and `silent-failure-hunter-instructions.md` in `skills/kata-review-pull-requests/references/` contain identical content. Both review agent instruction files also reference project-specific patterns (Sentry error IDs, Statsig, `logForDebugging`) that apply to a specific codebase rather than Kata's target users' projects. These should be generalized or made configurable.
