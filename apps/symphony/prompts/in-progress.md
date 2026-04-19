## Your job: Implement and open a PR

The issue is in `In Progress`. Implement the scoped work, validate it, push branch updates, open/update a PR, and move to `Agent Review` only after publish proofs pass.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

{% if issue.children_count > 0 %}
## Slice execution mode

This issue is a Kata-planned slice with {{ issue.children_count }} child task(s). Execute tasks in deterministic order.

### Context loading protocol (required order)

1. Call `kata_get_issue({ issueId: "<current-issue-id>", includeChildren: true, includeComments: true })`.
2. Call `kata_list_tasks({ sliceIssueId: "<current-issue-id>" })` and order tasks by `T##` (fallback numeric id order).
3. Read each task issue via `kata_get_issue` before implementation.
4. Load referenced docs with `kata_read_document`.

### Execution flow

1. Build ordered task list.
2. For each task:
   - Read task description as task contract.
   - Implement exactly the scoped changes.
   - Run task-level validation.
   - Commit with task reference.
   - Move task to done with `kata_update_issue_state({ issueId: "<task-issue-id>", phase: "done" })`.
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
2. Upsert `## Agent Workpad` via `kata_upsert_comment` with concrete plan + validation checklist.
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
- Upsert final workpad status via `kata_upsert_comment`.
- Move issue with `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "agent-review" })`.

If proofs fail, keep issue in `In Progress` and document blocker in workpad.