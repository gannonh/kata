---
name: sym-push
description:
  Push current branch changes to origin and create or update the corresponding
  pull request (with the correct base branch); use when asked to push, publish
  updates, or create pull request.
---

# Push

## Prerequisites

- `gh` CLI is installed and available in `PATH`.
- `gh auth status` succeeds for pull-request operations in this repo.
- When this is part of a Kata-backed Symphony run, use the active Kata backend-state workflow for durable Kata task/slice/artifact state. PR creation/update remains a repository operation handled through `gh`.

## Goals

- Push current branch changes to `origin` safely.
- Create a PR if none exists for the branch, otherwise update the existing PR.
- Keep branch history clean when remote has moved.

## Related Skills

- `pull`: use this when push is rejected or sync is not clean (non-fast-forward,
  merge conflict risk, or stale branch).

## Steps

1. Identify current branch and confirm remote state.
2. Determine the PR/merge base branch:
   - Use a workflow-configured base branch when task context provides one (for
     Symphony workflows, this is `workspace.base_branch`).
   - Default to `main` when no explicit base branch is available.
3. Run local validation (`cd apps/symphony && cargo test && cargo clippy -- -D warnings`) before pushing. Use project-appropriate checks when the touched files are outside Symphony.
4. Push branch to `origin` using explicit first-push upstream setup. Never use `git push --no-verify`:
   - first publish of a new branch: `git push -u origin "$branch"`
   - subsequent updates: `git push`
   Use whatever remote URL is already configured.
5. If push is not clean/rejected:
   - If the failure is a non-fast-forward or sync problem, run the `pull`
     skill to merge `origin/<base-branch>`, resolve conflicts, and rerun
     validation.
   - Retry with `git push -u origin "$branch"` so upstream is set even when the
     first push failed before tracking was recorded.
   - Use `--force-with-lease` only when history was rewritten.
   - If the failure is due to auth, permissions, or workflow restrictions on
     the configured remote, stop and surface the exact error instead of
     rewriting remotes or switching protocols as a workaround.

6. Ensure a PR exists for the branch:
   - If no PR exists, create one.
   - If a PR exists and is open, update it.
   - If branch is tied to a closed/merged PR, create a new branch + PR.
   - Write a proper PR title that clearly describes the change outcome
   - For branch updates, explicitly reconsider whether current PR title still
     matches the latest scope; update it if it no longer does.
7. Write/update PR body explicitly using `.github/pull_request_template.md`:
   - Fill every section with concrete content for this change.
   - Replace all placeholder comments (`<!-- ... -->`).
   - Keep bullets/checkboxes where template expects them.
   - If this is a Symphony issue run, include an issue reference line in the PR body:
     - Use the PR host's closing-reference syntax when supported.
     - Prefer the short issue reference, such as `#123`, over a URL when available.
     - Use `Refs <issue-reference>` when no closing reference can be formed.
   - If PR already exists, refresh body content so it reflects the total PR
     scope (all intended work on the branch), not just the newest commits,
     including newly added work, removed work, or changed approach.
   - Do not reuse stale description text from earlier iterations.
8. Reply with the PR URL from `gh pr view`, and if a Kata task is active, record PR URL/evidence in the appropriate Kata summary or verification artifact through the active workflow.

## Commands

```sh
# Identify branch
branch=$(git branch --show-current)
base_branch="${BASE_BRANCH:-main}"

# Initial push for a new branch: set upstream explicitly.
git push -u origin "$branch"

# If that failed because the remote moved, use the pull skill. After
# pull-skill resolution and re-validation, retry the normal push:
git push -u origin "$branch"

# After upstream is set, routine branch updates can use:
git push

# If the configured remote rejects the push for auth, permissions, or workflow
# restrictions, stop and surface the exact error.

# Only if history was rewritten locally:
git push --force-with-lease origin HEAD

# Ensure a PR exists (create only if missing)
pr_state=$(gh pr view --json state -q .state 2>/dev/null || true)
if [ "$pr_state" = "MERGED" ] || [ "$pr_state" = "CLOSED" ]; then
  echo "Current branch is tied to a closed PR; create a new branch + PR." >&2
  exit 1
fi

# Write a clear, human-friendly title that summarizes the shipped change.
pr_title="<clear PR title written for this change>"
if [ -z "$pr_state" ]; then
  gh pr create --base "$base_branch" --title "$pr_title"
else
  # Reconsider title on every branch update; edit if scope shifted.
  gh pr edit --base "$base_branch" --title "$pr_title"
fi

# Write/edit PR body to match .github/pull_request_template.md before validation.
# Example workflow:
# 1) open the template and draft body content for this PR
# 2) include an issue reference line:
#    - use closing-reference syntax when supported
#    - prefer a short issue reference such as #123 over a URL when available
#    - use Refs <issue-reference> when no closing reference can be formed
# 3) gh pr edit --body-file /tmp/pr_body.md
# 4) for branch updates, re-check that title/body still match current diff

tmp_pr_body=$(mktemp)
gh pr view --json body -q .body > "$tmp_pr_body"
rm -f "$tmp_pr_body"

# Show PR URL for the reply
gh pr view --json url -q .url
```

## Notes

- Do not use `--force`; only use `--force-with-lease` as the last resort.
- Distinguish sync problems from remote auth/permission problems:
  - Use the `pull` skill for non-fast-forward or stale-branch issues.
  - Surface auth, permissions, or workflow restrictions directly instead of
    changing remotes or protocols.
