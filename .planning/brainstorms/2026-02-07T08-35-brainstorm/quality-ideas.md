# Quality & Reliability Ideas for v1.8.0

## 1. Execution Replay / Deterministic Re-run

**What:** Record the full execution trace of a phase (plan content, subagent prompts, config, file snapshots) into a `.planning/replays/{phase}/` directory. On re-run, compare current output against the recorded trace to detect drift. Surface differences as a structured diff report.

**Why:** Kata's execution model spawns subagents with fresh context windows. When a phase fails or produces unexpected results, there is no way to reproduce the exact conditions. Replay traces provide post-mortem debugging data and let users re-run a phase with confidence that the same inputs produce the same outputs.

**Scope:** Large. Requires hooks in the executor orchestrator to capture state at spawn time, a storage format for traces, and a comparison engine.

**Risks:** Trace files could be large and clutter `.planning/`. Replay fidelity depends on model determinism, which is inherently probabilistic. Overhead of capture could slow execution.

---

## 2. Plan Regression Guard

**What:** After each plan's execution, automatically diff the project's test suite results against a baseline snapshot. If a plan introduces test failures that did not exist before its execution, block SUMMARY creation and flag the regression. Integrate with step 6.5 of kata-execute-phase (which already runs `npm test`) by capturing before/after test result sets.

**Why:** Step 6.5 in kata-execute-phase runs the test suite but only reports pass/fail at the phase level. It does not attribute failures to specific plans or detect which plan introduced a regression. Plans execute in waves, and a regression introduced in Wave 1 Plan 02 currently looks identical to a pre-existing failure when Wave 2 starts.

**Scope:** Medium. Capture test results before each wave, diff after each wave, attribute regressions to specific plans.

**Risks:** Test suites with flaky tests will produce false positives. Projects without test suites get no benefit. Additional test runs increase execution time.

---

## 3. Verifier Confidence Calibration

**What:** Extend the kata-verifier with a confidence scoring system for each must-have truth. Instead of binary VERIFIED/FAILED, report a confidence percentage based on the depth of evidence found. For example: file exists (20%), substantive content (40%), exports present (60%), imported by other files (80%), integration wiring confirmed (100%). Aggregate truth confidence into an overall phase confidence score.

**Why:** The current verifier returns a binary pass/fail per truth, but the quality of verification varies. "File exists and has 30 lines" is weaker evidence than "file exists, exports the right functions, is imported by the route handler, and the route handler returns its output." A confidence score helps users decide whether to accept verification or dig deeper.

**Scope:** Medium. The verifier already checks three levels (existence, substantive, wired). This formalizes the scoring and surfaces it in VERIFICATION.md.

**Risks:** Numeric scores can create false precision. Users may anchor on numbers rather than reading the evidence. Calibrating thresholds across different project types is subjective.

---

## 4. Cross-Phase Integration Smoke Tests

**What:** After a phase completes, automatically verify that artifacts from previously completed phases still function correctly by running a lightweight integration check. For each completed phase's key_links, re-verify that wiring is intact. Store results in a `.planning/phases/{phase}/INTEGRATION.md` file.

**Why:** Kata verifies each phase in isolation. Phase 3 might refactor a module that Phase 1 depends on, breaking Phase 1's key links without detection. The milestone audit (`/kata-audit-milestone`) catches this at the end, but that is too late for efficient remediation. Early detection reduces rework.

**Scope:** Medium. Reuse existing verifier key_link checking patterns against completed phase must_haves after each new phase completes.

**Risks:** Cross-phase verification could be slow for projects with many phases. False positives from expected refactors that intentionally change APIs. Maintaining a growing list of things to check as phases accumulate.

---

## 5. Skill Test Coverage Dashboard

**What:** Create a `kata-test-coverage` skill (or extend `kata-track-progress`) that analyzes the test suite in `tests/skills/` and reports which skills have tests, which test cases exercise which skill behaviors, and where coverage gaps exist. Output a structured report mapping skill capabilities to test coverage.

**Why:** Kata has 29 skills and 27 skill test files. Some tests only verify trigger detection (skill invoked for prompt X). Others verify artifact creation. There is no systematic view of what behaviors are tested vs. untested. As skills grow more complex, untested code paths accumulate silently.

**Scope:** Small. Parse test files, extract test descriptions, map to skill capabilities from SKILL.md, report gaps.

**Risks:** Static analysis of test files may miss dynamic test generation patterns. Coverage report accuracy depends on consistent test naming conventions. Could become stale if not maintained.

---

## 6. Automated Plan Smell Detection

**What:** Extend the plan-checker with a "smell detection" pass that identifies common plan anti-patterns beyond the existing 6 verification dimensions. Smells include: tasks with vague verbs ("set up", "handle", "manage"), tasks that modify more than 5 files, tasks with verify steps that only check file existence rather than behavior, plans that depend on external services without mocking strategy, and tasks whose action descriptions are shorter than their name.

**Why:** The plan-checker verifies structural correctness (fields present, dependencies valid, scope within budget). It does not evaluate whether individual tasks are well-specified enough to produce reliable execution. Vague tasks produce variable results across runs. Plan smells are leading indicators of execution failures.

**Scope:** Small. Add a new verification dimension to the existing plan-checker-instructions.md. No new infrastructure needed.

**Risks:** Smell thresholds are inherently subjective. Could produce noise for experienced users who write terse-but-clear tasks. May conflict with quick-mode's intentionally lighter planning.

---

## 7. UAT Session Analytics

**What:** After each UAT session completes, analyze the results and produce a trend report: which types of issues recur across phases, which severity levels are most common, which plan types (TDD vs standard) produce fewer issues, average pass rate by phase position (early phases vs late phases). Store in `.planning/analytics/uat-trends.md`.

**Why:** The current UAT system logs results per phase in individual UAT.md files. There is no aggregate view. Recurring issue patterns (e.g., "wiring failures are 60% of all issues") could inform planning improvements: if wiring is the most common failure mode, plans should be required to have explicit wiring verification tasks.

**Scope:** Medium. Parse all UAT.md files, aggregate statistics, produce trend report. Could run as part of `/kata-audit-milestone` or as a standalone analysis.

**Risks:** Small projects may have too few data points for meaningful trends. Analytics could give false confidence about quality patterns. Storage and maintenance of analytics artifacts adds complexity.
