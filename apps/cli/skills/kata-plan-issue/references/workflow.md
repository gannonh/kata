# Workflow Reference

# Plan Issue Workflow

Use this workflow to plan a one-off, slice-sized unit of work in isolation and persist it as one backend issue in the GitHub Project v2 backlog. This workflow borrows Superpowers-style design and planning discipline, but Kata stores the result through the backend contract instead of local markdown files.

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
- Intended to sit in the project backlog as one executable GitHub issue.
- Planned and executed independently from the milestone/slice/task roadmap.

Do not use this workflow for roadmap-sized work, multi-slice work, or work that must attach to an active milestone. Route those to `kata-new-milestone` or `kata-plan-phase`.

## Stage 1: Readiness and Context

Check backend readiness before durable writes:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
```

Read project context:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

If either command returns `ok: false`, stop and fix setup before planning. If the project context is missing or points at the wrong repository, route to setup or project initialization instead of creating a backlog issue.

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

After the user chooses an approach, present the design only. Do not include the implementation plan yet. Use this structure:

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

Stop here. Ask whether the design looks right before writing the plan. If the user requests changes, revise the design and ask again. Do not draft the plan until the design is approved.

Example ending:

```text
CHECKPOINT: Does this design look right? Once you approve it, I’ll write the implementation plan for the same issue.
```

## Stage 5: Plan Gate

After the user approves the design, write the implementation plan only. The plan should be concrete enough for a fresh execution agent, but still sized for one isolated issue.

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

Stop here. Ask whether the plan looks right. Do not run `issue.create` until the user approves both the design and the plan.

Example ending:

```text
CHECKPOINT: Does this plan look right? Once you approve it, I’ll create one Kata backlog issue containing the design and plan.
```

## Stage 6: Create One Backend Issue

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
node <path-to-skill-directory>/scripts/kata-call.mjs issue.create --input /tmp/kata-issue-create.json
```

The backend creates one GitHub issue, adds it to the configured GitHub Project v2, sets status to Backlog when the Project has a Status field, and records Kata metadata fields.

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
