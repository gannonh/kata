Merge the open GitHub PR for the current Kata slice branch and sync local state.

Use the `kata_merge_pr` tool. It:
1. Checks all CI checks have passed via `gh pr checks`
2. Merges the PR via `gh pr merge --squash`
3. Syncs the local branch state after merge (checkout main, pull, clean up slice branch)
4. Marks the slice done in the milestone's `ROADMAP` document (via `kata_write_document`)
5. Returns `{ ok: true }` on success or `{ ok: false, phase, error }` on failure

Surface any failure details directly to the user. If CI checks are failing, surface which checks are failing so they can be fixed before retrying the merge.
