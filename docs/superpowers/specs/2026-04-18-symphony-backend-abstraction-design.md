# Symphony Worker Backend Abstraction Design

**Date:** 2026-04-18
**Status:** Approved (design)
**Scope:** Symphony worker execution path for Linear + GitHub tracker operations

## 1) Problem

Symphony workers run as Kata CLI instances, but worker instructions and skills still leak backend-specific behavior (especially Linear-centric guidance). This creates drift and makes GitHub support fragile.

**Hard requirement:** No backend-specific workflow branches in prompts/skills. If branching is needed, the abstraction is incomplete and must be fixed in tooling.

## 2) Goal

Make worker tracker/artifact/state operations fully backend-abstracted through `kata_*` tools so the same worker prompt/skill flow works for Linear and GitHub.

## 3) Non-goals

- No parallel Linear vs GitHub prompt suites.
- No prompt-level label/state mechanics.
- No worker dependence on `linear_*` tools for Kata-managed workflow operations.

## 4) Architecture

### 4.1 Canonical Worker Operations Contract

Define a single worker contract (served by `kata_*` tools) for:

1. Issue read (bounded, deterministic)
2. Child task enumeration
3. Artifact read/write
4. Comment/workpad write
5. Workflow state transition
6. Follow-up issue creation (if needed)

Workers interact only with this contract.

### 4.2 CLI as Backend Dispatcher

CLI `kata_*` tools dispatch to backend implementations (Linear/GitHub) and return normalized, compact responses.

- Worker sees one stable surface
- Backend-specific mechanics stay in backend modules

### 4.3 Symphony Prompt Layer

Keep one shared prompt set by workflow state (`in-progress`, `agent-review`, `rework`, `merging`).

Prompt responsibilities:
- Tell workers to use `kata_*` for tracker/artifact/state operations
- Keep workflow semantics clear
- Avoid backend-specific operational instructions

### 4.4 Skills Layer

`sym-*` skills become backend-neutral for tracker operations by routing through `kata_*` tools.

If a skill contains backend assumptions, rewrite it to the canonical worker contract.

## 5) Data/Control Flow

1. Orchestrator dispatches worker with issue context
2. Worker loads context via `kata_*` contract
3. Worker executes implementation/test/PR flow
4. Worker updates comments/workpad via `kata_*`
5. Worker advances state via `kata_*`
6. Orchestrator polls tracker and continues next state/session

No worker-side backend branching.

## 6) Error Handling and Guardrails

- Missing capability in `kata_*` surface is a tooling defect; add the tool method rather than adding prompt branches.
- Any backend-specific worker instruction detected in prompts/skills is a policy violation.
- State updates must remain canonical (`Todo`, `In Progress`, `Agent Review`, `Merging`, `Done`, etc.), with backend mapping hidden in tooling.

## 7) Implementation Plan

### Phase 1 — Inventory

Map all worker operations currently touching tracker/artifacts/state across:
- Symphony prompts
- `sym-*` skills
- worker runtime assumptions

Output: operation matrix and abstraction gaps.

### Phase 2 — Tooling Completion

Add/fix missing `kata_*` methods in CLI so all worker operations are covered.

Output: complete worker-facing backend-neutral tool surface.

### Phase 3 — Prompt Cleanup

Update Symphony prompts to remove Linear-specific operational guidance and reinforce `kata_*` usage.

Output: one backend-agnostic prompt flow.

### Phase 4 — Skill Hardening

Refactor `sym-*` skills to remove tracker-specific assumptions.

Output: skills conform to canonical contract.

### Phase 5 — Evals (required)

Run skill evals using:
`$HOME/.agents/skills/skill-creator/SKILL.md`

Evaluate:
- baseline vs updated skills/prompts
- tool-use correctness (`kata_*` only for tracker operations)
- transition correctness
- no backend leakage

Output: qualitative + quantitative eval evidence.

### Phase 6 — End-to-End Verification

Run full worker flow in:
- Linear mode
- GitHub mode

with identical prompt/skill stack.

Pass criteria:
- same workflow semantics
- no backend-specific worker instructions
- successful state progression via abstraction.

## 8) Test Strategy

1. Unit tests for new/changed `kata_*` methods and backend dispatch behavior
2. Prompt/skill lint checks for banned backend-specific worker instructions
3. Integration tests of worker operation chain (context -> update -> transition)
4. Eval suite via `skill-creator` workflow
5. Live dual-backend proof run

## 9) Acceptance Criteria

1. Workers can complete tracker/artifact/state operations without `linear_*` or GitHub-specific mechanics.
2. Symphony prompts remain shared across backends.
3. `sym-*` skills pass evals with no backend leakage.
4. Linear and GitHub worker flows pass end-to-end with same semantics.
5. Any required backend differences are contained in CLI backend implementation, not worker prompt/skill logic.

## 10) Verification Evidence (2026-04-18)

### Automated checks

- `kata_*` tooling contract tests: PASS
- Linear backend worker contract tests: PASS
- GitHub backend worker contract tests: PASS
- Symphony prompt/skill backend leakage tests: PASS
- GitHub backend validation lane (`scripts/ci/github-backend-validation.sh`): PASS

### Skill evals (skill-creator)

- Baseline prompts/skills: backend leakage detected in worker guidance.
- Updated prompts/skills: no backend leakage in tracker operations.
- State transition semantics remained canonical across Linear and GitHub modes.

### Dual backend outcome

- Linear mode and GitHub mode now run with identical worker prompt/skill stack for tracker/artifact/state flows.
- Remaining backend differences are contained in CLI backend implementation.
