# Plan Issue Workflow

Use this workflow to plan a one-off, slice-sized unit of work in isolation and persist it as one backlog issue. This workflow uses a staged design-and-planning process, and Kata stores the approved design and plan through the backend contract.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/questioning.md`
- `references/ui-brand.md`
- `templates/issue-plan.md`

## When to Use This Workflow

Use `kata-plan-issue` when the request is:

- A standalone bugfix, enhancement, cleanup, spike, or integration task.
- Roughly slice-sized: meaningful enough to need design, but not large enough to become a milestone.
- Intended to sit in the project backlog as one executable issue.
- Planned and executed independently from the milestone/slice/task roadmap.

Do not use this workflow for roadmap-sized work, multi-slice work, or work that must attach to an active milestone. Route those to `kata-new-milestone` or `kata-plan-phase`.

## Stage 1: Readiness and Context

Check backend readiness before durable writes:

```bash
node ./scripts/kata-call.mjs health.check
```

Read project context:

```bash
node ./scripts/kata-call.mjs project.getContext
```

If either command returns `ok: false`, stop and fix setup before planning. If the project context backend is not `github`, stop and report that standalone issue workflows require a backend with `issue.create` support. If the project context is missing or points at the wrong repository, route to setup or project initialization before creating a backlog issue.

Briefly inspect relevant repository files or docs when the request depends on current implementation details. Keep this bounded: the goal is enough context to design one issue, not a full project audit.

## Stage 2: Clarify the Issue

Ask focused questions one at a time until you can state:

- The concrete problem or opportunity.
- The intended user/developer outcome.
- The affected surface area.
- Constraints, non-goals, and compatibility expectations.
- Verification expectations.

Prefer multiple-choice questions when the user can answer faster that way. If the request is already clear, ask at most one confirmation question before proposing a design.

Scope check before continuing:

- If the work contains multiple independent outcomes, propose splitting it and ask which one issue to plan first.
- If the work depends on a milestone roadmap, stop and route to `kata-plan-phase`.
- If the work is trivial enough to be a direct edit with no durable backlog issue, ask whether the user still wants a Kata issue.

## Stage 3: Approach Gate

Present only 2-3 approaches with trade-offs, then recommend one. Keep the options concise and grounded in the current repo/backend context.

For each approach include:

- What changes.
- Why it fits or does not fit a one-off issue.
- Main risk or trade-off.
- Verification strategy.

Stop here. Do not draft the design, do not draft the implementation plan, and do not ask to create the issue in the same response as the options. Ask the user to choose an approach or approve the recommendation.

Example ending:

```text
Recommended: Option B because it gives UAT a clear first-class skill surface without overloading verification.

CHECKPOINT: Which approach should I turn into the design?
```

## Stage 4: Design Gate

After the user chooses an approach, draft the design only. Do not include the implementation plan yet. Before showing the design to the user, run the Design Self-Review below and fix any issues inline.

Use this structure:

```markdown
Issue title: <short imperative title>

# Design

## Problem

## Goals

## Non-goals

## Proposed approach

## Affected files or surfaces

## Risks and edge cases

## Verification
```

### Design Self-Review

Before presenting the design, review it with fresh eyes:

1. **Scope:** Is this truly one isolated issue, not milestone-sized or multi-slice work?
2. **Clarity:** Can a fresh execution agent understand the problem, outcome, and selected approach without extra conversation?
3. **Non-goals:** Are exclusions explicit enough to prevent scope creep?
4. **Verification:** Is there a concrete way to prove the issue is done?
5. **Consistency:** Do the goals, non-goals, proposed approach, affected surfaces, risks, and verification notes agree with each other?

If you find a problem, fix the design before showing it to the user.

Always include a brief visible self-review summary before the checkpoint. Keep it concise and factual; do not reveal hidden chain-of-thought. Use pass/fix language:

```text
Design self-review
- Scope: Pass — one isolated issue, not milestone-sized.
- Clarity: Pass — a fresh execution agent can understand the outcome.
- Non-goals: Pass — excluded scope is explicit.
- Verification: Pass — completion can be proven.
- Consistency: Pass — goals, approach, risks, and verification align.
```

Stop here after presenting the reviewed design and visible self-review summary. Ask whether the design looks right before planning. If the user requests changes, revise the design and run the Design Self-Review again. Do not draft the plan until the design is approved.

Example ending:

```text
CHECKPOINT: Does this design look right? Once you approve it, I’ll do the planning research needed for this issue and then write the implementation plan.
```

## Stage 5: Planning Depth and Research

After the user approves the design, do not immediately write the plan. First choose the planning depth and do the amount of planning work the issue deserves.

### Planning Depth

Classify the issue as one of these depths before researching:

- **Fast plan** — one package or surface, obvious implementation path, known tests, no runtime/backend contract change, low regression risk.
- **Research plan** — multiple files or packages, generated files/docs involved, existing behavior unclear, test strategy needs discovery, or backend/runtime contract details matter.
- **Reviewed plan** — cross-system or cross-language changes, scheduling/execution semantics, backend contract changes, high regression risk, release/security/CI impact, or user explicitly requests extra rigor.

Default to the higher depth when uncertain. For reviewed plans, use a reviewer subagent if the harness provides subagents. If subagents are not available, perform the reviewer pass inline and say so.

Example classification:

```text
Planning depth: Reviewed
Reason: This crosses CLI TypeScript, backend fields, Rust Symphony dispatch, and regression behavior.
```

### Planning Research

Before drafting the plan, inspect the concrete implementation surfaces required by the chosen depth.

For **Fast plan**, inspect only the obvious files/tests needed to avoid guessing.

For **Research plan**, inspect at least:

- relevant source files and existing patterns,
- nearby tests and validation commands,
- generated-source or bundle implications,
- runtime/backend contract shape.

For **Reviewed plan**, do the Research plan work, then draft a candidate plan and run a reviewer pass before showing the plan to the user. The reviewer should look for missing files, incorrect assumptions, missing tests, sequencing problems, scope creep, and contract violations. Incorporate valid feedback before presenting the plan.

Always present a concise planning research summary before the plan:

```text
Planning research summary
- CLI dependency metadata currently lives/should live in ...
- Existing tests for this behavior are in ...
- Generated files affected: ...
- Validation commands: ...
- Reviewer pass: completed; incorporated N changes.  # for Reviewed depth
```

If research reveals the approved design is wrong or too broad, stop and return to the Design Gate with the new information instead of forcing a plan.

## Stage 6: Plan Gate

After planning research is complete, write the implementation plan only. The plan should be concrete enough for a fresh execution agent, but still sized for one isolated issue. Before showing the plan to the user, run the Plan Self-Review below and fix any issues inline.

Use this structure:

```markdown
# Plan

## Tasks

- [ ] Step 1: ...
- [ ] Step 2: ...

## Acceptance criteria

- ...

## Execution notes

- ...
```

### Plan Self-Review

Before presenting the plan, review it against the approved design:

1. **Design coverage:** Does every important design goal, non-goal, affected surface, risk, and verification expectation map to a task, acceptance criterion, or execution note?
2. **No placeholders:** Remove `TBD`, `TODO`, "handle edge cases", "add appropriate tests", "as needed", and other vague instructions unless they are explicit investigation steps with a concrete output.
3. **Task size:** Is each task actionable and small enough for one issue-oriented execution pass?
4. **Ordering:** Do tasks build in a sensible order, with tests or contract checks before implementation where appropriate?
5. **Verification coverage:** Are exact validation commands or concrete human checks included when known?
6. **Backend constraint:** Does the plan avoid creating milestones, slices, or tasks?
7. **Single-issue constraint:** Does the plan still fit as one backlog issue containing the approved design and this plan?

If you find a problem, fix the plan before showing it to the user.

Always include a brief visible self-review summary before the checkpoint. Keep it concise and factual; do not reveal hidden chain-of-thought. Use pass/fix language:

```text
Plan self-review
- Design coverage: Pass — every design goal maps to tasks or acceptance criteria.
- No placeholders: Pass — no TBD/TODO/vague edge-case instructions remain.
- Task size/order: Pass — tasks are actionable and sequenced.
- Verification coverage: Pass — concrete validation commands/checks are included.
- Backend constraint: Pass — this planning issue creates no milestones, slices, or tasks.
- Single-issue constraint: Pass — this remains one backlog issue.
```

Stop here after presenting the planning research summary, reviewed plan, and visible self-review summary. Ask whether the plan looks right. Do not run `issue.create` until the user approves both the design and the plan.

Example ending:

```text
CHECKPOINT: Does this plan look right? Once you approve it, I’ll create one Kata backlog issue containing the design and plan.
```

## Stage 7: Create One Backend Issue

Create `/tmp/kata-issue-create.json` with exactly one issue payload. The `design` field should contain the approved design document. The `plan` field should contain the approved implementation plan. Do not create separate issues for design and plan.

```json
{
  "title": "Fix first-run setup messaging",
  "design": "## Problem\n\nThe first-run setup output uses harness language that confuses users.\n\n## Goals\n\n- Make supported skill locations clear.\n- Avoid treating skills-sh as a harness.\n\n## Non-goals\n\n- Changing setup storage semantics.\n\n## Proposed approach\n\nRender concrete supported skill targets from detected install paths.\n\n## Verification\n\nRun CLI tests and inspect doctor output.",
  "plan": "## Tasks\n\n- [ ] Add tests for human-readable doctor output.\n- [ ] Update the doctor renderer.\n- [ ] Run targeted CLI validation.\n\n## Acceptance criteria\n\n- Doctor output names Universal, Claude Code, or Cursor locations.\n- Doctor output does not call skills-sh a harness."
}
```

Run:

```bash
node ./scripts/kata-call.mjs issue.create --input /tmp/kata-issue-create.json
```

The backend creates one issue, adds it to the configured project, sets status to Backlog when the project has a Status field, and records Kata metadata fields.

## Completion

Summarize:

- Created issue ID and URL when returned.
- Why this is isolated one-off work.
- The approved approach.
- The first execution step.
- Any follow-up that should become a separate issue.

Do not proceed into implementation unless the user explicitly asks after the issue has been created.

## Rules

- Create exactly one backend issue.
- Keep the design and plan together in that issue body.
- Do not create milestones, slices, or tasks.
- Do not write local design or plan markdown files.
- Do not execute implementation work in this skill.
- Keep the issue slice-sized; decompose larger requests before creating backend state.
