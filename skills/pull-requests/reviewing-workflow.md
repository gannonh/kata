# Reviewing Pull Requests

Run comprehensive PR review and quality checks before merging.

## Objective

Ensure code quality, test coverage, and adherence to project standards.
Output: All review issues addressed, PR ready for merge.

## Context

PR Number: $ARGUMENTS (auto-detect from current branch if not provided)

## Process

Create a structured task list:

- [ ] Step 1: Identify PR to Review
- [ ] Step 2: Run PR Review
- [ ] Step 3: Run Quick Checks
- [ ] Step 4: Update Project State
- [ ] Step 5: Present Next Steps

### Step 1: Identify PR to Review

Get the PR number for the current branch:
```bash
GH_PAGER= gh pr view --json number --jq '.number'
```

Then get PR details:
```bash
GH_PAGER= gh pr view --json number,title,state,headRefName,url --jq '"PR #\(.number): \(.title)\nState: \(.state)\nBranch: \(.headRefName)\nURL: \(.url)"'
```

If PR is already merged or closed, inform user and exit.

### Step 2: Run PR Review & Fix Issues

Run comprehensive PR review using pr-review-toolkit:

```
/pr-review-toolkit:review-pr all parallel
```

This launches specialized review agents:
- **code-reviewer**: Code quality, bugs, logic errors
- **pr-test-analyzer**: Test coverage completeness
- **silent-failure-hunter**: Error handling patterns
- **type-design-analyzer**: Type design quality
- **comment-analyzer**: Comment accuracy

**For each issue found:**

1. **Critical issues** - Must fix immediately
2. **Important issues** - Should fix before merge
3. **Suggestions** - Consider fixing

**Address ALL issues**, not just critical ones. Continue iterating until no issues remain.

### Step 3: Run Quick Checks

**If changes were made:**

```bash
# Run swiftlint on changed files and fix ANY issues
git diff --name-only origin/main...HEAD -- '*.swift' | xargs -r swiftlint lint --strict

# Run unit test suite to confirm no regressions
./scripts/test.sh unit 1
```

### Step 4: Update Project State

Update STATE.md to record pre-merge completion:

```markdown
Status: PR Review complete - ready for milestone completion
Last activity: [today's date] - PR Review complete (CI + reviews passed)
```

Commit the state update:

```bash
git add .planning/STATE.md
git commit -m "chore: mark PR review complete"
git push
```

### Step 5: Present Next Steps

```
✅ PR Review Complete

PR #[PR_NUMBER]: [Title]
Branch: [branch_name]

Validation Results:
- PR Review Toolkit: ✅ All issues addressed
- CI Checks: ✅ Passing

Ready for merge when you are.
```

## Success Criteria

- [ ] PR identified and accessible
- [ ] PR review issues addressed
- [ ] All CI checks pass (lint, build, tests, coverage)
- [ ] User knows next steps

## Critical Rules

- **Fix ALL issues** - Don't skip "minor" issues; they compound
- **Re-run after fixes** - Confirm issues are resolved before proceeding
- **Don't skip steps** - Each review type catches different issues
- **Final validation required** - Confirm no regressions from fixes
