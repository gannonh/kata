---
estimated_steps: 5
estimated_files: 2
---

# T03: Build `gh-utils.ts` and `pr-body-composer.ts`

**Slice:** S01 — PR Creation & Body Composition
**Milestone:** M003

## Description

Implement the two core modules that `kata_create_pr` (T04) depends on:

- `gh-utils.ts` — five pure detection/parsing functions that check `gh` CLI presence/auth, parse the current branch into `milestoneId`/`sliceId`, read the current git branch, and detect the GitHub remote. No throws — all return `null`/`false` on failure.
- `pr-body-composer.ts` — `composePRBody(milestoneId, sliceId, cwd)` reads slice artifacts via the existing `kata/paths.ts` + `kata/files.ts` utilities and composes a markdown PR body. Gracefully handles missing summaries and thin slices.

After this task, `pr-body-composer.test.ts` passes.

## Steps

1. Create `src/resources/extensions/pr-lifecycle/gh-utils.ts`:

   ```ts
   import { execSync } from "node:child_process";

   export function isGhInstalled(): boolean { ... }
   export function isGhAuthenticated(): boolean { ... }
   export function getCurrentBranch(cwd: string): string | null { ... }
   export function parseBranchToSlice(branch: string): { milestoneId: string; sliceId: string } | null { ... }
   export function detectGitHubRepo(cwd: string): { owner: string; repo: string } | null { ... }
   ```

   Implementation notes:
   - `isGhInstalled`: `execSync("gh --version", { stdio: ['pipe','pipe','pipe'] })` — return `false` on error
   - `isGhAuthenticated`: `execSync("gh auth status", { stdio: ['pipe','pipe','pipe'] })` — return `false` on error (exit code 1 means unauthenticated)
   - `getCurrentBranch`: `execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8", stdio: ['pipe','pipe','pipe'] }).trim()`
   - `parseBranchToSlice`: match `/^kata\/([A-Z]\d+)\/([A-Z]\d+)$/` against the branch string; return `{ milestoneId, sliceId }` on match or `null` on no match
   - `detectGitHubRepo`: `git remote get-url origin` → parse SSH (`git@github.com:owner/repo.git`) or HTTPS (`https://github.com/owner/repo.git`) — return `{ owner, repo }` or `null`

2. Create `src/resources/extensions/pr-lifecycle/pr-body-composer.ts`:

   ```ts
   import { resolveSliceFile, resolveTaskFiles } from "../kata/paths.js";
   import { parsePlan, parseSummary, loadFile } from "../kata/files.js";

   export async function composePRBody(
     milestoneId: string,
     sliceId: string,
     cwd: string,
   ): Promise<string> { ... }
   ```

   Implementation logic:
   - Resolve slice plan path via `resolveSliceFile(milestoneId, sliceId, "PLAN", cwd)` and load with `loadFile`
   - Parse the loaded plan via `parsePlan` to get must-haves and task entries
   - Resolve slice summary path via `resolveSliceFile(milestoneId, sliceId, "SUMMARY", cwd)` and load if present (graceful null check — summary may not exist yet)
   - Parse summary via `parseSummary` to get `oneLiner` if present
   - Resolve task files via `resolveTaskFiles(milestoneId, sliceId, cwd)` and load each plan
   - Compose output markdown:
     ```
     ## What Changed
     <slice summary oneLiner, or "See plan below" if absent>

     ## Must-Haves
     <bullet list from plan.mustHaves or raw plan content>

     ## Tasks
     <task titles from plan.tasks>
     ```
   - Return complete markdown string (never empty — fall back to raw plan content if parsing yields nothing)

3. Handle the edge cases explicitly:
   - Slice summary missing → skip "What Changed" details, use plan title
   - No must-haves parsed → include a generic "See slice plan" fallback line
   - No task files found → just include task entries from the slice plan

4. Verify `composePRBody` handles a minimal fixture (the one written in T01's test): the temp `.kata/` tree with a single-task plan and a stub task plan file should produce a non-empty string with `##` headings.

5. Run the test and fix any type errors until clean.

## Must-Haves

- [ ] `gh-utils.ts` exports all 5 functions with correct signatures
- [ ] All `gh-utils.ts` functions return `null`/`false` on error — never throw
- [ ] `parseBranchToSlice` matches `kata/M001/S01` → `{ milestoneId: "M001", sliceId: "S01" }`; returns `null` for non-kata branches
- [ ] `composePRBody` imports from `../kata/paths.js` and `../kata/files.js` (`.js` extension — Node ESM)
- [ ] `composePRBody` returns non-empty string even when slice summary is absent
- [ ] `pr-body-composer.test.ts` passes with zero failures

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-body-composer.test.ts'` — all assertions pass, exit 0
- `npx tsc --noEmit` — no errors in `gh-utils.ts` or `pr-body-composer.ts`

## Observability Impact

- Signals added/changed: `gh-utils.ts` functions are pure (no side effects, no logging) — callers handle error surfacing; `pr-body-composer.ts` logs nothing — returns structured markdown
- How a future agent inspects this: `parseBranchToSlice(getCurrentBranch(cwd))` is the canonical way to derive milestone/slice from the current branch; result is `null` when branch format doesn't match, making failures explicit
- Failure state exposed: every `gh-utils.ts` function that returns `null`/`false` is a named signal that T04's tool handler converts to a structured error with `phase` field

## Inputs

- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` — from T01; the fixture structure and assertions that must pass
- `src/resources/extensions/github/gh-api.ts` — reference for `getCurrentBranch`/`detectRepo` implementations; re-implement the 30-line subset, do NOT import from `github/gh-api.ts` (avoids cross-extension coupling per research constraint)
- `src/resources/extensions/kata/paths.ts` — `resolveSliceFile`, `resolveTaskFiles` signatures
- `src/resources/extensions/kata/files.ts` — `parsePlan`, `parseSummary`, `loadFile` signatures and return types

## Expected Output

- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — 5 exported detection/parsing functions
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — `composePRBody` async function
