## Your job: Implement and open a PR

The issue is in `In Progress`. Implement the scoped work, validate it, push branch updates, open/update a PR, and move to `Agent Review` only after publish proofs pass.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `.agents/skills/sym-state/scripts/sym-call issue.get --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.list-children --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call document.read --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call comment.upsert --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.update-state --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.create-followup --input /tmp/input.json`

{% if issue.children_count > 0 %}
## Slice execution mode

This issue is a Kata-planned slice with {{ issue.children_count }} child task(s). Execute tasks in deterministic order.

### Context loading protocol (required order)

1. Call `issue.get` with `{"issueId":"@current","includeChildren":true,"includeComments":true}`.
2. Call `issue.list-children` with `{"issueId":"@current"}` and order tasks by `T##` (fallback numeric id order).
3. Read each task issue via `issue.get` before implementation, using each child task's `id` field as `issueId`.
4. Load marker docs with `document.read` using `{"issueId":"@current"}`; read a known single doc with `{"issueId":"@current","title":"Context"}`.

### Execution flow

1. Build ordered task list.
2. For each task:
   - Read task description as task contract.
   - Implement exactly the scoped changes.
   - Run task-level validation.
   - Commit with task reference.
   - Move task to done with `issue.update-state` using `{"issueId":"<task-issue-id>","state":"Done"}`.
3. Keep one PR for the slice branch.

{% elsif issue.parent_identifier %}
## Task execution mode

This is a Kata task under parent slice {{ issue.parent_identifier }}.

1. Read issue description (task contract: steps, must-haves, verification).
2. Implement required changes.
3. Run required validation.
4. Commit with task reference.

{% else %}
## Flat ticket execution mode

1. Analyze issue description and existing comments/context.
2. Capture a concrete reproduction/proof signal before changing code.
3. Implement and validate.
{% endif %}

## Implementation steps

1. Pull-sync from `origin/{{ workspace.base_branch }}` before edits.
2. Upsert `## Agent Workpad` via `comment.upsert` with concrete plan + validation checklist.
3. Implement required changes and keep workpad current.
4. Run all required validation gates.
5. Re-check acceptance criteria and close any gaps.
6. Push branch updates and open/update PR targeting `{{ workspace.base_branch }}`.

## Publish proofs (required)

- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName`
- PR must be `OPEN` and `headRefName` must equal current branch.

## State transition

After publish proofs succeed:
- Upsert final workpad status via `comment.upsert`.
- Move the issue to `Agent Review` with `issue.update-state` using `{"issueId":"@current","state":"Agent Review"}`.

If proofs fail, keep issue in `In Progress` and document blocker in workpad.
