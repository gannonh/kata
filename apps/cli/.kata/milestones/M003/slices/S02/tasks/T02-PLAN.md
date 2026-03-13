---
estimated_steps: 6
estimated_files: 1
---

# T02: Implement `pr-review-utils.ts`

**Slice:** S02 — Bundled Reviewer Subagents & Parallel Dispatch
**Milestone:** M003

## Description

Create `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` with four named exports: `fetchPRContext`, `scopeReviewers`, `buildReviewerTaskPrompt`, and `aggregateFindings`. Makes T01's failing tests pass. This module is the core logic layer for S02 — it is called by the `kata_review_pr` tool (T04) and tested independently here.

## Steps

1. Create `src/resources/extensions/pr-lifecycle/pr-review-utils.ts`.

2. Define the `PrContext` interface and export it:
   ```ts
   export interface PrContext {
     prNumber: number;
     title: string;
     body: string;
     headBranch: string;
     baseBranch: string;
     diff: string;
     changedFiles: string[]; // basenames or relative paths from diff --stat
   }
   ```

3. Implement `fetchPRContext(cwd: string): PrContext | null`:
   - Call `gh pr view --json number,title,body,headRefName,baseRefName` via `execSync` with piped stdio, `encoding: 'utf8'`, and `cwd` option. Parse as JSON.
   - Call `gh pr diff` via `execSync` (same cwd + piped stdio) to get the raw diff string.
   - Parse changed file paths from `gh pr diff --stat` output: extract lines matching `^\s*(\S+)\s+\|` (the file column before the `|`), strip trailing whitespace.
   - Return null on any `execSync` failure (not on a PR branch, `gh` error, no open PR, etc.).
   - Never throw — wrap in try/catch returning null on any error.

4. Implement `scopeReviewers(diff: string, changedFiles: string[]): string[]`:
   - Always include `'pr-code-reviewer'` (baseline reviewer, never skipped).
   - Include `'pr-failure-finder'` if diff matches `/try\s*\{|catch\s*\(|async\s+|\.catch\(/`.
   - Include `'pr-test-analyzer'` if any `changedFiles` entry matches `/\.test\.|\.spec\./` OR diff matches `/describe\(|it\(|test\(/`.
   - Include `'pr-code-simplifier'` if `diff.split('\n').length > 100`.
   - Include `'pr-type-design-analyzer'` if diff matches `/^[+-].*\binterface\s|^[+-].*\btype\s+[A-Z]/m`.
   - Include `'pr-comment-analyzer'` if diff matches `/^[+-].*\/\*\*|^[+-].*\/\//m`.
   - Return a deduplicated array (order: code-reviewer first, then others in declaration order).

5. Implement `buildReviewerTaskPrompt(ctx: PrContext, reviewerName: string, reviewerInstructions: string): string`:
   - Build a single string that concatenates:
     ```
     You are reviewing PR #<prNumber>: "<title>"
     
     PR Description:
     <body or "(no description)">
     
     Changed files:
     <changedFiles joined by newline>
     
     Full diff:
     <diff>
     
     Review instructions:
     <reviewerInstructions>
     
     Focus your review on the PR diff. Flag only issues in changed code unless existing code creates a clear bug when combined with the changes.
     Report findings in this format: group by severity (Critical, Important, Suggestions). For each issue include: file path + line number in bold (**file:line**), description, and a concrete fix suggestion.
     ```
   - Use template literal for readability.

6. Implement `aggregateFindings(outputs: { reviewer: string; output: string }[]): string`:
   - For each output, extract findings by scanning for severity markers:
     - Critical: lines/paragraphs under `### 🔴 Critical`, `Critical:`, `**Critical**`, `critical` headers
     - Important: lines under `### 🟡 Important`, `Important:` headers
     - Suggestions: lines under `### 💡 Suggestions`, `Suggestion:` headers
     - Fallback: any line containing `**<file>:<line>**` pattern goes to "Suggestions" if no severity context
   - Deduplicate by `file:line` fingerprint: extract `**(\S+:\d+)**` from each finding; keep only the first occurrence across all reviewers.
   - Assemble output:
     ```
     ## PR Review Findings
     
     ## 🔴 Critical
     <findings or "(none)">
     
     ## 🟡 Important
     <findings or "(none)">
     
     ## 💡 Suggestions
     <findings or "(none)">
     
     ---
     Reviewers: <reviewer names joined by ", ">
     ```
   - If all sections are empty (no structured findings), include raw outputs under a `## Raw Findings` section with each reviewer's name as a subheading.

## Must-Haves

- [ ] `PrContext` interface exported
- [ ] `fetchPRContext` returns null on error — never throws
- [ ] `scopeReviewers` always includes `'pr-code-reviewer'`; heuristics for other 5 reviewers follow the scoping table
- [ ] `buildReviewerTaskPrompt` embeds PR number, title, diff, and reviewer instructions in its output
- [ ] `aggregateFindings` deduplicates `file:line` fingerprints across reviewer outputs
- [ ] All 8 tests in `pr-review.test.ts` pass
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
# All 8 new tests pass (plus all existing tests)
npm test 2>&1 | tail -20

# TypeScript clean
npx tsc --noEmit

# Module loads and exports are visible
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  -e "import('./src/resources/extensions/pr-lifecycle/pr-review-utils.ts').then(m => console.log(Object.keys(m)))"
```

Expected: `['fetchPRContext', 'scopeReviewers', 'buildReviewerTaskPrompt', 'aggregateFindings', 'PrContext']` (or similar list including the 4 function exports).

## Observability Impact

- Signals added/changed: `fetchPRContext` returns null (not throws) on failure — calling code (`kata_review_pr` in T04) maps null to `{ ok: false, phase: 'not-in-pr' }`; no silent failures
- How a future agent inspects this: Call `fetchPRContext(cwd)` directly to diagnose PR detection issues; `scopeReviewers(diff, changedFiles)` is pure and can be called with any fixture string for debugging
- Failure state exposed: `fetchPRContext` returning null pinpoints the failure to "not on PR branch or gh CLI failure" — `kata_review_pr` enriches this with the `phase` enum

## Inputs

- `src/resources/extensions/kata/tests/pr-review.test.ts` — the 8 tests this task must make pass (from T01)
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — reference for the no-throw `execSync` + piped stdio pattern (do NOT import from gh-utils; replicate the pattern inline for diff fetching since `fetchPRContext` needs multiple `gh` calls)
- `/Users/gannonhall/.agents/skills/pull-requests/references/reviewing-workflow.md` — source of the reviewer scoping heuristics table (Step 4 of the workflow)

## Expected Output

- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — new module with 4 named exports; all 8 T01 tests now pass
