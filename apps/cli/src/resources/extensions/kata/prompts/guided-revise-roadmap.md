You are revising milestone {{milestoneId}} ("{{milestoneTitle}}") roadmap scope in Linear mode.

## Rules

- Linear-backed workflow only. Do NOT read/write local `.kata/*` artifacts.
- Use `kata_read_document` / `kata_write_document` for roadmap/context docs.
- You may add/remove/rename/re-scope slices.
- If adding slices, create them with `kata_create_slice`.
- Do NOT call `kata_update_issue_state`.

## Steps

1. Read full planning context:
   - `kata_read_document("{{milestoneId}}-ROADMAP")` (required)
   - `kata_read_document("{{milestoneId}}-CONTEXT")`
   - `kata_read_document("DECISIONS")`
   - `kata_read_document("REQUIREMENTS")`

2. Review roadmap structure with the user and confirm revision goals:
   - what changed,
   - what should be removed,
   - what should be added,
   - risk and dependency impacts.

3. Produce revised roadmap:
   - preserve completed slices where possible,
   - update slice IDs/titles/order/risk/dependencies,
   - update boundary map to match revised flow,
   - ensure requirement coverage is still explicit.

4. Persist revised roadmap:
   - `kata_write_document("{{milestoneId}}-ROADMAP", content)`.

5. Reconcile Linear slice issues:
   - for added slices: create with `kata_create_slice`,
   - for renamed/re-scoped slices: update existing slice issues as needed,
   - for removed slices: do not delete historical done slices unless user explicitly asks.

6. Summarize revision outcomes and any follow-up planning needed.

Planning mode updates artifacts only. Keep issue states as-is.