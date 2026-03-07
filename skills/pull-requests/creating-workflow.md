# Creating Pull Requests

Create a new branch (if needed), commit changes, push to origin, and open a PR.

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Branch name (optional): $ARGUMENTS

## Process

1. **Create a new branch** if on main
   - If no branch name provided, check `.planning/ROADMAP.md` for the current phase
   - Generate branch name from phase, e.g. `feat/39-day-status-tracking`
   - Otherwise use the provided branch name

2. **Commit any uncommitted changes** with an appropriate message
   - Follow conventional commits format
   - Use descriptive commit messages

3. **Push the branch to origin**
   ```bash
   git push -u origin $(git branch --show-current)
   ```

4. **Create a pull request** using gh CLI
   ```bash
   gh pr create --title "feat: <description>" --body "## Summary

   <bullet points>

   ## Test Plan

   <how to verify>"
   ```

5. **Report back** with a link to the PR

## Success Criteria

- [ ] Branch created (if needed)
- [ ] Changes committed
- [ ] Branch pushed to origin
- [ ] PR created and URL returned to user
