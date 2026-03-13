# S02: Bundled Reviewer Subagents & Parallel Dispatch

**Goal:** Ship 6 bundled reviewer subagent definitions, a `pr-review-utils.ts` module for PR diff fetching and reviewer scoping, and a `kata_review_pr` tool that prepares a structured parallel-dispatch plan. The agent uses this plan with the `subagent` pi tool to run reviewers in parallel and aggregate severity-ranked findings.

**Demo:** Agent calls `kata_review_pr` → tool returns `{ ok: true, prNumber, reviewerTasks }` → agent dispatches 6 subagents in parallel via `subagent({ tasks: [...] })` → each reviewer (using a bundled `.md` agent definition) returns structured findings → agent presents aggregated `## 🔴 Critical / ## 🟡 Important / ## 💡 Suggestions` report. Contract proof: unit tests verify `scopeReviewers`, `buildReviewerTaskPrompt`, and `aggregateFindings` with fixture data; 6 agent `.md` files present with correct frontmatter; TypeScript clean.

## Must-Haves

- 6 reviewer agent definition files exist in `src/resources/agents/`: `pr-code-reviewer.md`, `pr-failure-finder.md`, `pr-test-analyzer.md`, `pr-type-design-analyzer.md`, `pr-comment-analyzer.md`, `pr-code-simplifier.md` — each with `name:` + `description:` frontmatter and a full reviewer system-prompt body
- `pr-review-utils.ts` exports `fetchPRContext`, `scopeReviewers`, `buildReviewerTaskPrompt`, `aggregateFindings` as named exports
- `scopeReviewers` always includes `pr-code-reviewer`; applies diff-content heuristics to include/skip the other 5 reviewers
- `buildReviewerTaskPrompt` returns a non-empty task string embedding PR title, body, diff, and reviewer-specific instructions
- `aggregateFindings` accepts `{reviewer, output}[]`, returns a severity-ranked markdown string with Critical / Important / Suggestions sections; deduplicates identical `file:line` findings across reviewers
- `kata_review_pr` tool registered in `pr-lifecycle/index.ts`: pre-flights gh CLI, calls `fetchPRContext`, calls `scopeReviewers`, builds per-reviewer task prompts, returns `{ ok: true, prNumber, diff, selectedReviewers, reviewerTasks }` — a machine-readable dispatch plan
- `kata_review_pr` returns `{ ok: false, phase, error, hint }` (never throws) for: `gh-missing`, `gh-unauth`, `not-in-pr` (not on a PR branch or no open PR), `diff-empty`
- Unit tests in `pr-review.test.ts` all pass; all existing 87+ tests still pass
- `npx tsc --noEmit` exits 0

## Proof Level

- This slice proves: contract
- Real runtime required: no (unit tests use fixture diff strings; `fetchPRContext` is excluded from unit test scope — it wraps `gh` CLI calls)
- Human/UAT required: no (UAT checklist included for optional live validation but not required to mark S02 complete)

## Verification

- `npm test` — all tests pass, including new `pr-review.test.ts`
- `npx tsc --noEmit` — exits 0
- `ls src/resources/agents/pr-*.md | wc -l` — outputs `6`
- `grep -l '"name"' src/resources/agents/pr-*.md | wc -l` — all 6 have frontmatter (verified by task T03)
- `grep "kata_review_pr" src/resources/extensions/pr-lifecycle/index.ts` — tool is registered
- Contract tests assert:
  - `scopeReviewers` on a diff with `try { ... } catch` includes `pr-failure-finder`
  - `scopeReviewers` on a docs-only diff returns only `["pr-code-reviewer"]`
  - `buildReviewerTaskPrompt` output contains the PR title string
  - `aggregateFindings` output for two fixture outputs contains at least one of the severity heading strings

## Observability / Diagnostics

- Runtime signals: `kata_review_pr` returns structured `{ ok, phase, error, hint }` — same pattern as `kata_create_pr` (D037). `phase` distinguishes `gh-missing / gh-unauth / not-in-pr / diff-empty / success` without prose parsing.
- Inspection surfaces: `kata_review_pr` return value → agent branches on `ok` + `phase`; `reviewerTasks[].agent` identifies which reviewers were dispatched; `selectedReviewers[]` is the machine-readable reviewer list for diagnostics
- Failure visibility: `not-in-pr` phase distinguishes "no PR open for branch" from auth failures; `diff-empty` phase is distinct from `not-in-pr`
- Redaction constraints: diff content may contain secrets — do not log diff to console outside tool return value; reviewer task prompts contain diff inline (acceptable, bounded to agent context)

## Integration Closure

- Upstream surfaces consumed: `gh-utils.ts` (`isGhInstalled`, `isGhAuthenticated` for pre-flight); `src/resources/agents/` sync path (already handled by `resource-loader.ts`); `subagent` pi tool (used by the agent at runtime to dispatch reviewer tasks — not wired inside the tool handler itself)
- New wiring introduced in this slice: `pr-review-utils.ts` (new module); 6 reviewer `.md` agent definitions; `kata_review_pr` tool registration in `pr-lifecycle/index.ts`
- What remains before the milestone is truly usable end-to-end: S03 (address comments), S04 (merge), S05 (`/kata pr` command surface with `review` subcommand wiring + `resource-loader` scripts/ sync + auto-create hook)

## Tasks

- [x] **T01: Write failing tests for reviewer scoping and aggregation** `est:30m`
  - Why: Establishes the API contract (`scopeReviewers`, `buildReviewerTaskPrompt`, `aggregateFindings`) before implementation. Tests fail until T02 ships the module.
  - Files: `src/resources/extensions/kata/tests/pr-review.test.ts`
  - Do: Create `pr-review.test.ts` in the existing test directory. Top-level `await import('../../pr-lifecycle/pr-review-utils.js')` — fails with MODULE_NOT_FOUND until T02. Write 8 tests: (1) `scopeReviewers` always includes `pr-code-reviewer`; (2) includes `pr-failure-finder` when diff contains `try {`; (3) includes `pr-test-analyzer` when changedFiles includes a `.test.ts`; (4) excludes `pr-code-simplifier` on a small diff (<30 lines); (5) includes `pr-code-simplifier` on a large diff (>100 lines); (6) `buildReviewerTaskPrompt` returns a non-empty string containing the PR title; (7) `aggregateFindings` with two fixture outputs returns a string containing `Critical`; (8) `aggregateFindings` deduplicates identical `file:line` fingerprints (appears once, not twice). Use Node.js built-in `test` + `assert/strict`. Do not suppress the import failure — it is intentional.
  - Verify: `npm test 2>&1 | grep "pr-review"` shows the suite starting and failing (MODULE_NOT_FOUND, not syntax error)
  - Done when: `pr-review.test.ts` exists with 8 named tests; running `npm test` shows those tests failing with module-not-found, not with a parse error
- [x] **T02: Implement `pr-review-utils.ts`** `est:1h`
  - Why: Core logic layer — diff fetching, reviewer scoping heuristics, task prompt assembly, finding aggregation. Makes T01's tests pass.
  - Files: `src/resources/extensions/pr-lifecycle/pr-review-utils.ts`
  - Do: 1) Define `PrContext` interface: `{ prNumber: number; title: string; body: string; headBranch: string; baseBranch: string; diff: string; changedFiles: string[]; }`. 2) Implement `fetchPRContext(cwd: string): PrContext | null` — calls `gh pr view --json number,title,body,headRefName,baseRefName` and `gh pr diff` via `execSync` with piped stdio; parses changedFiles from `gh pr diff --stat` output; returns null on any failure (not on PR branch, gh error, etc.). 3) Implement `scopeReviewers(diff: string, changedFiles: string[]): string[]` — always returns `['pr-code-reviewer']` in the list; adds `pr-failure-finder` if diff matches `try\s*\{|catch\s*\(|async\s|\.catch\(`; adds `pr-test-analyzer` if changedFiles has any `.test.` or `.spec.` file or diff adds logic; adds `pr-code-simplifier` if diff line count > 100; adds `pr-type-design-analyzer` if diff matches `interface |type [A-Z]|: [A-Z]`; adds `pr-comment-analyzer` if diff matches `/\*\*|\/\/`. 4) Implement `buildReviewerTaskPrompt(ctx: PrContext, reviewerName: string, reviewerInstructions: string): string` — assembles a single task string with PR number/title/body/diff embedded plus reviewer instructions. 5) Implement `aggregateFindings(outputs: {reviewer: string; output: string}[]): string` — extracts severity-labelled lines (Critical / Important / Suggestion patterns), deduplicates by `file:line` fingerprint (regex `\*\*([\w./]+:\d+)\*\*`), groups into `## 🔴 Critical` / `## 🟡 Important` / `## 💡 Suggestions` sections. Export all as named exports. No default export.
  - Verify: `npm test 2>&1 | grep -E "pr-review|pass|fail"` — all 8 tests in `pr-review.test.ts` now pass
  - Done when: 8/8 tests pass; `npx tsc --noEmit` exits 0
- [x] **T03: Write 6 reviewer agent definition files** `est:45m`
  - Why: R207 — Kata ships bundled reviewer subagents as proper `.md` agent definitions (D013). `resource-loader.ts` already syncs `src/resources/agents/` to `~/.kata-cli/agent/agents/` on every launch.
  - Files: `src/resources/agents/pr-code-reviewer.md`, `src/resources/agents/pr-failure-finder.md`, `src/resources/agents/pr-test-analyzer.md`, `src/resources/agents/pr-type-design-analyzer.md`, `src/resources/agents/pr-comment-analyzer.md`, `src/resources/agents/pr-code-simplifier.md`
  - Do: For each file, write YAML frontmatter with `name:` (matching the reviewer ID used in `scopeReviewers`) and `description:` (one sentence for the agent registry), then a blank line, then the full reviewer system prompt body ported from the corresponding reference file in `/Users/gannonhall/.agents/skills/pull-requests/references/`. File-to-reference mapping: `pr-code-reviewer.md` → `code-reviewer-instructions.md`; `pr-failure-finder.md` → `failure-finder-instructions.md`; `pr-test-analyzer.md` → `pr-test-analyzer-instructions.md`; `pr-type-design-analyzer.md` → `type-design-analyzer-instructions.md`; `pr-comment-analyzer.md` → `comment-analyzer-instructions.md`; `pr-code-simplifier.md` → `code-simplifier-instructions.md`. Keep existing reviewer content verbatim — do not summarize or shorten. Match the frontmatter format of `src/resources/agents/worker.md` (triple-dash delimiters).
  - Verify: `ls src/resources/agents/pr-*.md | wc -l` outputs `6`; `head -3 src/resources/agents/pr-code-reviewer.md` shows `---` / `name: pr-code-reviewer`
  - Done when: 6 files present with correct frontmatter name fields; existing `worker.md`, `scout.md`, `researcher.md` files unmodified
- [x] **T04: Register `kata_review_pr` tool and validate TypeScript** `est:45m`
  - Why: Exposes the reviewer dispatch infrastructure as a callable agent tool in the `pr-lifecycle` extension — the same extension that hosts `kata_create_pr`. Completes the S02 contract proof.
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`
  - Do: 1) Import `fetchPRContext`, `scopeReviewers`, `buildReviewerTaskPrompt` from `./pr-review-utils.js`. 2) At tool registration time (top of the handler, outside hot path), read the 6 reviewer `.md` files via `readFileSync` relative to `import.meta.url` — resolve path as `join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'agents', '<file>.md')`. Parse out the body (strip YAML frontmatter lines). Store in a `REVIEWER_INSTRUCTIONS` map keyed by reviewer name. 3) Add `kata_review_pr` tool via `pi.addTool()` with params `{ cwd?: string, reviewers?: string[] }`. Handler: (a) pre-flight `isGhInstalled` → `{ ok: false, phase: 'gh-missing', ... }`; (b) pre-flight `isGhAuthenticated` → `{ ok: false, phase: 'gh-unauth', ... }`; (c) call `fetchPRContext(cwd)` → if null return `{ ok: false, phase: 'not-in-pr', error: 'No open PR found for current branch', hint: 'Ensure the branch has an open PR on GitHub' }`; (d) if `ctx.diff.trim() === ''` return `{ ok: false, phase: 'diff-empty', ... }`; (e) call `scopeReviewers(ctx.diff, ctx.changedFiles)` — override with `params.reviewers` if provided; (f) for each selected reviewer, call `buildReviewerTaskPrompt(ctx, reviewerName, REVIEWER_INSTRUCTIONS[reviewerName])`; (g) return `{ ok: true, prNumber: ctx.prNumber, diff: ctx.diff, selectedReviewers, reviewerTasks: [{agent: reviewerName, task: prompt}, ...] }`. 4) Run `npx tsc --noEmit` and fix any type errors. 5) Run `npm test` and confirm all pass.
  - Verify: `npx tsc --noEmit` exits 0; `npm test` all pass; `grep "kata_review_pr" src/resources/extensions/pr-lifecycle/index.ts` matches; `node -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` prints `ok`
  - Done when: TypeScript clean; all unit tests pass; `kata_review_pr` tool present in extension

## Files Likely Touched

- `src/resources/extensions/kata/tests/pr-review.test.ts` — new, 8 tests
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — new module
- `src/resources/extensions/pr-lifecycle/index.ts` — add `kata_review_pr` tool
- `src/resources/agents/pr-code-reviewer.md` — new
- `src/resources/agents/pr-failure-finder.md` — new
- `src/resources/agents/pr-test-analyzer.md` — new
- `src/resources/agents/pr-type-design-analyzer.md` — new
- `src/resources/agents/pr-comment-analyzer.md` — new
- `src/resources/agents/pr-code-simplifier.md` — new
