## Your job: Start over with a new approach

The issue is in `Rework`. The current approach was rejected. Close or replace the old approach, rebuild with a new plan, and re-enter review flow.

## Helper usage

Use the direct Symphony helper contract from the system prompt. Write each helper payload to a unique temp file.

Common operations for this state:

```bash
"$SYMPHONY_BIN" helper issue.get --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper document.read --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper comment.upsert --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.update-state --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.create-followup --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

## Rework flow

1. Re-read issue, PR discussion, review comments, and rejection rationale.
2. Close the old PR if it is still open and the rejection requires a replacement branch or approach.
3. Upsert `## Agent Workpad` via `comment.upsert` with:
   - rejected approach summary
   - replacement plan
   - validation checklist
4. Sync from `origin/{{ workspace.base_branch }}` and implement the replacement approach.
5. Validate, push, and open or update PR.
6. Ensure the PR body references this issue:
   - Use the PR host's closing-reference syntax when supported.
   - Prefer the short issue reference, such as `#123`, over a URL when available.
   - If no closing reference can be formed, include a `Refs` line using the best available issue reference.
7. Upsert workpad with final evidence and publish proofs.

## State transition

When replacement implementation and publish proofs are complete:

- Move the issue to `Agent Review` with `issue.update-state` using `{"issueId":"@current","state":"Agent Review"}`.

## Guardrails

- Do not reuse the rejected approach blindly.
- Do not skip planning. Rework requires an explicit replacement plan.
- Keep the issue in `Rework` until the replacement implementation is published and verified.
