## Your job: Implement and open a PR

The issue is in `In Progress`. Your job is to implement the work, validate it, push a branch, open a PR, and move the issue to `Agent Review`.

{% if issue.children_count > 0 %}
## Slice execution mode

This issue is a **Kata-planned slice** with {{ issue.children_count }} child task(s). Execute tasks in order.

### Context loading protocol (required order)

Before implementation starts, load context in this exact order:

1. **Child issues** — fetch all child sub-issues to discover task list and ordering. Sort by task prefix (`T01`, `T02`, ...) when present; otherwise by issue number ascending. **Each child issue's description IS the task plan** — read it to understand what to implement.
2. **This issue's description** — the slice plan with goal, must-haves, and task overview.
3. **Project documents** — read project-scoped docs (`DECISIONS`, `M00N-CONTEXT`, `M00N-ROADMAP`) if needed for broader context.

### Execution flow

1. Build ordered task list from child issues.
2. For each task in order:
   - Read the child issue description (this is the task plan — it contains steps, must-haves, and verification criteria).
   - Execute the implementation steps described in the description.
   - Run validation for that task.
   - Commit with task reference in the message.
   - Move the child issue directly to `Done`. Do NOT move it to `Todo`, `In Progress`, or any other intermediate state — only `Backlog` → `Done`. Moving tasks to intermediate states causes the orchestrator to dispatch them as separate workers.
3. Keep one PR for the entire slice branch.

### Workpad format for slices

Use this structure (filled with real data from loaded context, NOT placeholders):

````md
## Agent Workpad

```text
<host>:<abs-workdir>@<short-sha>
```

### Task Progress

- [ ] T01: <title> (<identifier>) — Pending
- [ ] T02: <title> (<identifier>) — Pending

### Plan

- [ ] 1\. Load child issues and read their descriptions
- [ ] 2\. Execute T01 per its issue description
- [ ] 3\. Execute T02 per its issue description
- [ ] 4\. Run validation gates
- [ ] 5\. Push and open PR

### Acceptance Criteria

- [ ] All child tasks moved to `Done`
- [ ] Validation gates pass (tests, lint, build)
- [ ] PR opened and linked to issue

### Validation

- [ ] <exact test/lint/build commands for the scope>

### Notes

- <timestamped progress entries>
````

{% elsif issue.parent_identifier %}
## Task execution mode

This issue is a **Kata task** under parent slice {{ issue.parent_identifier }}. Your issue description IS the task plan.

1. Read this issue's description — it contains the steps, must-haves, and verification criteria.
2. Execute the implementation steps described in the description.
3. Run validation as described in the must-haves.
4. Commit with task reference in the message.

{% else %}
## Flat ticket execution mode

This is a standalone ticket. Read the description, plan your approach, implement, and validate.

1. Analyze the issue description and any linked context.
2. Locate/update the existing workpad using the **Workpad search protocol in `prompts/system.md`**, then write the plan before coding.
3. Before implementing, capture a concrete reproduction signal and record it in the workpad Notes section.
4. Implement the solution.
5. Run appropriate validation (tests, lint, build).

{% endif %}

## Implementation steps

1. Run pull-sync against `origin/{{ workspace.base_branch }}` before any code edits.
2. Implement the work, keeping the workpad current as you go (always reusing the same workpad located via the system workpad search protocol).
3. Run validation/tests required for the scope.
   - Mandatory gate: execute all ticket-provided `Validation`/`Test Plan`/`Testing` requirements when present.
   - Prefer targeted proofs that directly demonstrate the behavior you changed.
4. Re-check all acceptance criteria and close any gaps.
5. Before every `git push`, run required validation and confirm it passes.
6. Open a PR targeting `{{ workspace.base_branch }}`.
   - Attach PR URL to the issue.
7. Merge latest `origin/{{ workspace.base_branch }}` into branch, resolve conflicts, rerun checks.
8. Update the workpad with final checklist status and validation notes.
9. Run publish proofs before advancing state:
   - `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
   - `gh pr view --json url,state,headRefName,baseRefName`
   - Confirm PR is `OPEN` and `headRefName` equals current branch.

## State transition

Move issue to `Agent Review`. The orchestrator will dispatch a new session to run the PR feedback sweep.

Do **not** move to `Human Review` — that skips the feedback loop.

## Guardrails

- Do not edit the issue body for planning/progress; use only the workpad comment.
- Temporary proof edits for local verification must be reverted before commit.
- If blocked by missing required auth/tools, capture blocker in workpad and move to `Agent Review` with a blocker note.
