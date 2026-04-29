You are adding a new slice to milestone {{milestoneId}} ("{{milestoneTitle}}") in Linear mode.

## Rules

- Linear-backed workflow only. Do NOT create or edit local `.kata/*` files.
- Use `kata_read_document`/`kata_write_document` for artifacts.
- Do NOT plan tasks in this flow.
- Do NOT call `kata_update_issue_state`.

## Steps

1. Read the current roadmap document:
   - `kata_read_document("{{milestoneId}}-ROADMAP")`
   - If missing, stop and ask the user to run milestone roadmap planning first.

2. Read context documents if present:
   - `kata_read_document("{{milestoneId}}-CONTEXT")`
   - `kata_read_document("DECISIONS")`
   - `kata_read_document("REQUIREMENTS")`

3. Ask the user what the new slice should accomplish and any constraints.

4. Determine where the new slice belongs:
   - choose the right sequence position,
   - set risk level,
   - set `depends:[]` dependencies,
   - ensure boundary map remains coherent.

5. Update and write the roadmap:
   - preserve existing completed slices,
   - append/insert the new slice,
   - update boundary map transitions,
   - write with `kata_write_document("{{milestoneId}}-ROADMAP", content)`.

6. Create the new slice issue with `kata_create_slice`:
   - use the next `S##` identifier from the roadmap,
   - include a concise description of the slice intent.

7. Finish with a short summary of what changed.

Planning mode creates artifacts only. Leave all issues in their current/default state.