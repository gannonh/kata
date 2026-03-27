You are resequencing slices for milestone {{milestoneId}} ("{{milestoneTitle}}") in Linear mode.

## Rules

- Linear-backed workflow only. Do NOT use local `.kata/*` file operations.
- Read/write roadmap via `kata_read_document` and `kata_write_document`.
- This flow is resequencing only: do NOT create or delete slice issues.
- Do NOT call `kata_update_issue_state`.

## Steps

1. Read the current roadmap:
   - `kata_read_document("{{milestoneId}}-ROADMAP")`
   - If missing, stop and ask user to create the roadmap first.

2. Present current ordering to the user:
   - list each slice with risk and dependency tags,
   - call out any risky ordering or dependency contradictions.

3. Discuss desired changes with the user:
   - reorder slices,
   - adjust `depends:[]`,
   - keep completed slices clearly marked.

4. Update the roadmap content:
   - preserve intent and completed history,
   - rewrite ordering/dependency metadata,
   - update boundary map links so they match the new order.

5. Persist updated roadmap:
   - `kata_write_document("{{milestoneId}}-ROADMAP", content)`.

6. Summarize the new sequence and dependency changes.

Leave all Linear issue states unchanged.