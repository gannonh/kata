## Your job: Implement and open a PR

The issue is in `In Progress`. Implement the scoped work, validate it, push branch updates, open or update a PR, and move to `Agent Review` only after publish proofs pass.

## Helper usage

Use the direct Symphony helper contract from the system prompt for tracker, document, state, and PR-inspection operations. Write each helper payload to a unique temp file.

Common operations for this state:

```bash
"$SYMPHONY_BIN" helper issue.get --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.list-children --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper document.read --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper comment.upsert --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.update-state --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.create-followup --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

{% if issue.children_count > 0 %}
## Slice execution mode

This issue is a Kata-planned slice with {{ issue.children_count }} child task(s). Execute tasks in deterministic order.

### Context loading protocol

1. Call `issue.get` with `{"issueId":"@current","includeChildren":true,"includeComments":true}`.
2. Call `issue.list-children` with `{"issueId":"@current"}` and order tasks by `T##`, falling back to numeric id order.
3. Read each task issue via `issue.get` before implementation, using each child task's `id` field as `issueId`.
4. Load marker docs with `document.read` using `{"issueId":"@current"}`. Read a known single doc with `{"issueId":"@current","title":"Context"}` when needed.

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

1. Read issue description as the task contract: steps, must-haves, and verification.
2. Implement required changes.
3. Run required validation.
4. Commit with task reference.

{% else %}
## Flat ticket execution mode

1. Analyze issue description and existing comments/context.
2. Capture a concrete reproduction/proof signal before changing code when applicable.
3. Implement and validate.
{% endif %}

## Implementation steps

1. Pull-sync from `origin/{{ workspace.base_branch }}` before edits when the branch may be stale.
2. Upsert `## Agent Workpad` via `comment.upsert` with a concrete plan and validation checklist.
3. Implement required changes and keep workpad current.
4. Run all required validation gates.
5. Re-check acceptance criteria and close any gaps.
6. Push branch updates and open or update a PR targeting `{{ workspace.base_branch }}`.
7. Ensure the PR body references this issue:
   - Use the PR host's closing-reference syntax when supported.
   - Prefer the short issue reference, such as `#123`, over a URL when available.
   - If no closing reference can be formed, include a `Refs` line using the best available issue reference.

## Publish proofs

- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName,body`
- PR must be `OPEN` and `headRefName` must equal current branch.
- PR body must reference this issue as described above.

## State transition

After publish proofs succeed:

1. Upsert final workpad status via `comment.upsert`.
2. Move the issue to `Agent Review` with `issue.update-state` using `{"issueId":"@current","state":"Agent Review"}`.

If proofs fail, keep issue in `In Progress` and document the blocker in the workpad.
