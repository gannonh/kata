# Merging Pull Requests

Run CI checks and merge the PR.

## Objective

All review issues addressed, PR merged successfully.

## Context

PR Number: $ARGUMENTS (auto-detect from current branch if not provided)

## Process

Create a structured task list:

- [ ] Step 1: Identify PR to merge
- [ ] Step 2: Run CI Checks
- [ ] Step 3: Present Merge Readiness
- [ ] Step 4: Merge PR, checkout main, and pull latest
- [ ] Step 5: Present Next Steps

### Step 1: Identify PR to Merge

Get the PR number for the current branch:
```bash
GH_PAGER= gh pr view --json number --jq '.number'
```

Then get PR details:
```bash
GH_PAGER= gh pr view --json number,title,state,headRefName,url --jq '"PR #\(.number): \(.title)\nState: \(.state)\nBranch: \(.headRefName)\nURL: \(.url)"'
```

If PR is already merged or closed, inform user and exit.

### Step 2: Run CI Checks

**Run CI checks and fix any issues:**

#### Phase 1: Run swiftlint on changed files
```bash
git diff --name-only origin/main...HEAD -- '*.swift' | xargs -r swiftlint lint --strict
```

#### Phase 2: Validate coverage configuration
```bash
./scripts/check-coverage-config.sh
```
If missing files found, add them to coverage-config.json.

#### Phase 3: Build the project
```bash
./scripts/build.sh
```

#### Phase 4: Run unit tests
```bash
./scripts/test.sh unit 1
```

#### Phase 5: Check test coverage
```bash
./scripts/check-coverage.sh
```

**Analyze coverage** (if needed):
```bash
./scripts/coverage-detail.sh                    # Full report
./scripts/coverage-json.sh --summary            # File overview sorted by %
./scripts/coverage-json.sh --functions          # Show uncovered functions only
```

#### Phase 6: Run relevant UI tests

```bash
./scripts/test.sh ui 1 "<TestClass>/<testMethod>"
```

Run UI tests that cover the functionality changed in this milestone.

#### Phase 7: Fix all failures and violations

Fix all issues before continuing. Re-run checks until all pass.

#### Phase 8: Final check

```bash
./scripts/check-all.sh --skip-ui
```

**If all checks pass:**
```
✅ CI Checks Passed
- SwiftLint: No violations
- Build: Successful
- Unit Tests: All passing
- Coverage: Thresholds met
```

### Step 3: Present Merge Readiness

```
✅ Pre-merge Validation Complete

PR #[PR_NUMBER]: [Title]
Branch: [branch_name]

Validation Results:
- CI Checks: ✅ Passing

The PR is ready for merge. Would you like me to **merge it now, checkout main, and pull latest**?
```

### Step 4: Merge PR

**If user confirms, execute:**

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull
```

### Step 5: Present Next Steps

```
✅ PR Merge Complete

PR #[PR_NUMBER]: [Title]
Branch: [branch_name]

Validation Results:
- PR merged successfully
- Now on main branch with latest updates
```

## Success Criteria

- [ ] PR identified and accessible
- [ ] All CI checks pass (lint, build, tests, coverage)
- [ ] PR merged successfully

## Critical Rules

- **Fix ALL issues** - Don't skip "minor" issues; they compound
- **Re-run after fixes** - Confirm issues are resolved before proceeding
- **Final validation required** - Confirm no regressions from fixes
