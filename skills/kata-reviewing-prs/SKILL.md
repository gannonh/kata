---
name: kata-reviewing-prs
description: Comprehensive pull request review using specialized agents covering code quality, test coverage, error handling, type design, comment accuracy, and code simplification. Use when reviewing PRs, checking code before committing, validating changes before creating PRs, or when the user asks to "review my PR", "check code quality", "review changes", "code review", "PR review", "check tests", "review before commit", "review before PR", "check error handling", "analyze types", "simplify code", "review this phase", "analyze test coverage", "review types", or "simplify the code". Supports targeted reviews (tests, errors, types, comments, code, simplify) or full review (all aspects).
version: 0.1.0
argument-hint: "[aspects...] [--staged|--pr|--branch <ref>]"
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git:*)
  - Bash(gh:*)
---

<user_command>/kata:reviewing-prs</user_command>

# PR Reviews

Run comprehensive pull request reviews using specialized agents, each analyzing a different aspect of code quality.

## Review Aspects

| Aspect | Agent | Focus |
|--------|-------|-------|
| `code` | code-reviewer | Project guidelines, bugs, code quality |
| `tests` | test-analyzer | Test coverage quality and completeness |
| `errors` | silent-failure-hunter | Silent failures, error handling |
| `types` | type-design-analyzer | Type encapsulation and invariants |
| `comments` | comment-analyzer | Comment accuracy and maintainability |
| `simplify` | code-simplifier | Clarity and maintainability |
| `all` | All applicable | Full review (default) |

## Context Detection

When invoked, the skill automatically detects context:

**On a PR branch:**
```bash
# Check if current branch has an open PR
gh pr view --json number,baseRefName 2>/dev/null
```
If a PR exists, use `gh pr diff` for scope instead of `git diff`.

**During phase execution:**
When `pr_workflow: true` in `.planning/config.json`, the skill knows to review phase-specific changes.

**Standalone:**
Falls back to `git diff` for unstaged changes, or `git diff --staged` for staged changes.

## Workflow

1. **Determine scope**
   - If on a branch with open PR, use `gh pr diff --name-only`
   - If `--staged` flag, use `git diff --staged --name-only`
   - Default to `git diff --name-only` for unstaged changes
2. **Select aspects** - Parse user request or default to all applicable
3. **Launch agents** - Sequential (default) or parallel (if requested)
4. **Aggregate results** - Combine findings by severity
5. **Provide action plan** - Prioritized fixes

## Usage

**Full review (plugin):**
```
/kata:reviewing-prs
```

**Full review (npx):**
```
/kata-reviewing-prs
```

**Targeted reviews:**
```
/kata:reviewing-prs tests errors    # Test coverage and error handling only
/kata:reviewing-prs comments        # Comment accuracy only
/kata:reviewing-prs simplify        # Code simplification only
```

**Parallel execution:**
```
/kata:reviewing-prs all parallel    # Launch all agents simultaneously
```

**Scope modifiers:**
```
/kata:reviewing-prs --staged        # Review staged changes only
/kata:reviewing-prs --pr            # Force PR diff mode (auto-detected normally)
/kata:reviewing-prs --branch main   # Compare against specific branch
```

**Combined usage:**
```
/kata:reviewing-prs code tests --staged    # Review staged code and tests
/kata:reviewing-prs all --pr               # Full review of PR changes
```

### Scope Resolution

Scope precedence (highest to lowest):
1. Explicit `--pr` or `--staged` takes precedence
2. Auto-detect PR if on branch with open PR
3. Default to unstaged `git diff`

## Applicability by Change Type

| Change Type | Applicable Agents |
|-------------|-------------------|
| Any code | code-reviewer (always) |
| Test files | test-analyzer |
| Comments/docs | comment-analyzer |
| Error handling | silent-failure-hunter |
| New/modified types | type-design-analyzer |
| After passing review | code-simplifier |

## Output Format

```markdown
# PR Review Summary

## Critical Issues (X found)
- [agent-name]: Issue description [file:line]

## Important Issues (X found)
- [agent-name]: Issue description [file:line]

## Suggestions (X found)
- [agent-name]: Suggestion [file:line]

## Strengths
- What's well-done in this PR

## Recommended Action
1. Fix critical issues first
2. Address important issues
3. Consider suggestions
4. Re-run review after fixes
```

## Agent Details

See references for detailed agent specifications:
- [code-reviewer.md](./references/code-reviewer.md) - Guidelines compliance and bug detection
- [test-analyzer.md](./references/test-analyzer.md) - Behavioral coverage analysis
- [silent-failure-hunter.md](./references/silent-failure-hunter.md) - Error handling audit
- [type-design-analyzer.md](./references/type-design-analyzer.md) - Type invariant analysis
- [comment-analyzer.md](./references/comment-analyzer.md) - Comment accuracy verification
- [code-simplifier.md](./references/code-simplifier.md) - Code clarity refinement

## Kata Workflow Usage

**During phase execution (`pr_workflow: true`):**
Review phase changes before marking PR ready. Invoke between plan execution and phase completion.

**After plan completion:**
Quick review of individual plan changes:
`/kata:reviewing-prs code errors`

**Before milestone audit:**
Full review of all milestone changes:
`/kata:reviewing-prs all`

**Pre-commit hook pattern:**
Add to your workflow before committing:
1. Stage changes
2. `/kata:reviewing-prs code errors --staged`
3. Fix critical issues
4. Commit

## Workflow Integration

**Before committing:**
1. Write code
2. Run: `/kata:reviewing-prs code errors`
3. Fix critical issues
4. Commit

**Before creating PR:**
1. Stage changes
2. Run: `/kata:reviewing-prs all`
3. Address critical and important issues
4. Re-run targeted reviews
5. Create PR

**After PR feedback:**
1. Make requested changes
2. Run targeted reviews based on feedback
3. Verify issues resolved
4. Push updates

## Tips

- **Run early** - Review before creating PR, not after
- **Focus on changes** - Agents analyze git diff by default
- **Address critical first** - Fix high-priority issues before lower priority
- **Re-run after fixes** - Verify issues are resolved
- **Use targeted reviews** - Focus on specific aspects when you know the concern
