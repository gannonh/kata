Create a GitHub PR for the current Kata slice branch.

Use the `kata_create_pr` tool with these settings:
- `title`: derive from the active slice title (read the slice plan via the appropriate backend method), or ask the user if ambiguous
- `base_branch`: {{baseBranch}}
- Auto-detect `milestoneId` and `sliceId` from the current branch name

The `kata_create_pr` tool handles all pre-flight checks (gh CLI, auth, python3), composes the PR body from the slice issue description and optional summary artifacts, and returns `{ ok: true, url }` on success or `{ ok: false, phase, error, hint }` on failure. Surface any failure details directly to the user.

{{reviewOnCreate}}
