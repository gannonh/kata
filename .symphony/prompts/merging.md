## Your job: Merge the PR

The issue is in `Merging`. The PR has human approval. Land it cleanly.

## Helper usage

Use the direct Symphony helper contract from the system prompt. Write each helper payload to a unique temp file.

Common operations for this state:

```bash
"$SYMPHONY_BIN" helper issue.get --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper comment.upsert --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.update-state --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper pr.land-status --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper pr.inspect-checks --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

## Merge flow

1. Locate the PR for the current branch: `gh pr view --json number,url,title,body,mergeable,headRefName,baseRefName`.
2. Confirm the working tree is clean. If it is not clean, inspect changes, validate scope, commit intended changes, and push.
3. Confirm the target base branch is `{{ workspace.base_branch }}` unless the PR explicitly requires another base.
4. Inspect PR status with `pr.land-status` using `{"includeLogs":false}` for the current branch PR.
5. Ensure review feedback is acknowledged and any required fixes are handled before merging.
6. If mergeability is `CONFLICTING`, fetch and merge `origin/{{ workspace.base_branch }}`, resolve conflicts, run validation, commit, and push.
7. Watch checks until complete.
8. If checks fail, inspect logs with `pr.inspect-checks` using `{"includeLogs":true,"maxLines":160}`, fix failures, validate, commit, push, and repeat.
9. When feedback is resolved and checks are green, squash-merge with the PR title/body:

```bash
pr_title=$(gh pr view --json title -q .title)
pr_body=$(gh pr view --json body -q .body)
gh pr merge --squash --subject "$pr_title" --body "$pr_body"
```

10. Confirm target branch contains the merged changes.
11. Upsert `## Agent Workpad` with merge proof and cleanup notes.

## PR status helper example

```bash
INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-land-status-$$.json"
printf '{"includeLogs":false}\n' > "$INPUT"
"$SYMPHONY_BIN" helper pr.land-status --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

Treat non-empty `checks.failing` as CI work to fix before merge.

## Failure handling

- If checks fail, pull details with `pr.inspect-checks`, fix locally, commit, push, and re-run the watch.
- Use judgment to identify flaky failures. If a failure is a clear flake, document the rationale in the workpad before proceeding.
- If CI pushes an auto-fix commit, pull the updated PR head locally, merge `origin/{{ workspace.base_branch }}` if needed, add a real author commit, and push to retrigger CI.
- If mergeability is `UNKNOWN`, wait and re-check.
- Do not merge while human review comments are outstanding.
- Do not enable auto-merge unless the repo prompt explicitly requires it.

## State transition

After successful merge:

- Move the issue to `Done` with `issue.update-state` using `{"issueId":"@current","state":"Done"}`.

{% if issue.children_count > 0 %}
Also verify child task issues are done before finalizing slice completion.
{% endif %}

## Guardrails

- Do not mark done until merge proof is complete.
- Do not delete remote branches unless the repo prompt explicitly requires it.
- Do not bypass validation gates.
