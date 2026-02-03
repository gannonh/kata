---
phase: quick
plan: 005
type: execute
wave: 1
depends_on: []
files_modified:
  - skills/add-milestone/SKILL.md
autonomous: true

must_haves:
  truths:
    - "When GitHub enabled but no remote exists, user is asked if they want to create a repo"
    - "If user approves, repo is created with gh repo create"
    - "After repo creation, GitHub Milestone creation continues"
  artifacts:
    - path: "skills/add-milestone/SKILL.md"
      provides: "Milestone creation with repo creation prompt"
      contains: "AskUserQuestion"
---

<objective>
Change "warn and skip" behavior to "ask and create" when GitHub is enabled but no remote exists during milestone creation.

Purpose: Users who enable GitHub tracking but haven't pushed to GitHub yet should be offered the option to create a repo, not just warned and skipped.

Output: Updated SKILL.md with AskUserQuestion flow for repo creation.
</objective>

<context>
Current behavior (lines 126-139 of skills/add-milestone/SKILL.md):
- When `HAS_GITHUB_REMOTE=false`, displays warning and skips GitHub operations
- User must manually create repo and re-run milestone creation

Desired behavior:
- When `HAS_GITHUB_REMOTE=false`, prompt user with AskUserQuestion
- If user approves, create repo with `gh repo create --source=. --public --push`
- Continue with GitHub Milestone creation
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace warn-and-skip with ask-and-create flow</name>
  <files>skills/add-milestone/SKILL.md</files>
  <action>
In skills/add-milestone/SKILL.md, replace lines 126-139 (the `**If HAS_GITHUB_REMOTE=false:**` section) with an AskUserQuestion flow:

Replace this:
```markdown
**If `HAS_GITHUB_REMOTE=false`:**

Display warning and skip GitHub operations:
```
Warning: GitHub tracking enabled but no GitHub remote found.
Skipping GitHub Milestone creation.

To enable GitHub Milestones:
1. Create a repository: gh repo create --source=. --public --push
2. Re-run milestone creation or manually create via: gh api --method POST /repos/:owner/:repo/milestones -f title="v${VERSION}"
```

Continue with local milestone initialization (do NOT set github.enabled=false in config - user may add remote later).
```

With this:
```markdown
**If `HAS_GITHUB_REMOTE=false`:**

Use AskUserQuestion to offer repo creation:
- header: "GitHub Repository"
- question: "GitHub tracking is enabled but no GitHub remote found. Create a repository now?"
- options:
  - "Yes, create public repo" — Create public repository and push
  - "Yes, create private repo" — Create private repository and push
  - "Skip for now" — Continue without GitHub integration

**If "Yes, create public repo":**
```bash
gh repo create --source=. --public --push
```
If successful, set `HAS_GITHUB_REMOTE=true` and continue to Step 2 (Check authentication).

**If "Yes, create private repo":**
```bash
gh repo create --source=. --private --push
```
If successful, set `HAS_GITHUB_REMOTE=true` and continue to Step 2 (Check authentication).

**If "Skip for now":**
Display brief note and continue with local milestone initialization:
```
Continuing without GitHub integration. Run `gh repo create` later to enable.
```
Do NOT set github.enabled=false in config - user may add remote later.
```

This change:
1. Adds AskUserQuestion with three options (public, private, skip)
2. Executes `gh repo create` with appropriate visibility flag
3. On success, continues to GitHub Milestone creation (Step 2)
4. On skip, continues with local-only milestone (same as before)
  </action>
  <verify>
```bash
# Check that AskUserQuestion is used for repo creation
grep -A 5 "HAS_GITHUB_REMOTE=false" skills/add-milestone/SKILL.md | grep -q "AskUserQuestion" && echo "PASS: AskUserQuestion added"

# Check that gh repo create is included
grep -q "gh repo create --source=. --public --push" skills/add-milestone/SKILL.md && echo "PASS: public repo command"
grep -q "gh repo create --source=. --private --push" skills/add-milestone/SKILL.md && echo "PASS: private repo command"

# Check that skip option exists
grep -q "Skip for now" skills/add-milestone/SKILL.md && echo "PASS: skip option exists"
```
  </verify>
  <done>SKILL.md updated with AskUserQuestion flow for repo creation when GitHub enabled but no remote exists</done>
</task>

</tasks>

<verification>
```bash
# Verify the change is in place
echo "=== Verification ==="

# 1. AskUserQuestion for repo creation
grep -c "AskUserQuestion" skills/add-milestone/SKILL.md
echo "AskUserQuestion instances (should be 5+ now)"

# 2. Repo creation commands present
grep -q "gh repo create --source=. --public" skills/add-milestone/SKILL.md && echo "PASS: public repo create"
grep -q "gh repo create --source=. --private" skills/add-milestone/SKILL.md && echo "PASS: private repo create"

# 3. Old warning text removed
grep -c "Skipping GitHub Milestone creation" skills/add-milestone/SKILL.md
echo "Old skip warning (should be 0)"
```
</verification>

<success_criteria>
- [ ] AskUserQuestion added for repo creation prompt
- [ ] Public repo option with `gh repo create --source=. --public --push`
- [ ] Private repo option with `gh repo create --source=. --private --push`
- [ ] Skip option that continues without GitHub
- [ ] Old "warn and skip" text removed
- [ ] Flow continues to Step 2 after successful repo creation
</success_criteria>

<output>
After completion, create `.planning/quick/005-create-github-repo-when-github-enabled-b/005-SUMMARY.md`
</output>
