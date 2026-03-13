---
estimated_steps: 5
estimated_files: 2
---

# T04: Register `kata_review_pr` tool and validate TypeScript

**Slice:** S02 — Bundled Reviewer Subagents & Parallel Dispatch
**Milestone:** M003

## Description

Extend `src/resources/extensions/pr-lifecycle/index.ts` with the `kata_review_pr` tool. The tool pre-flights `gh` CLI availability, fetches PR context via `fetchPRContext`, scopes reviewers via `scopeReviewers`, builds per-reviewer task prompts by reading the bundled `.md` agent files and calling `buildReviewerTaskPrompt`, and returns a structured dispatch plan `{ ok: true, prNumber, selectedReviewers, reviewerTasks }`. The agent then uses this plan with the `subagent` pi tool (parallel mode) to run the reviewers and collect findings.

This task closes S02's contract proof: `kata_review_pr` tool exists, returns the right shape, TypeScript is clean, all tests pass.

## Steps

1. Add imports at the top of `src/resources/extensions/pr-lifecycle/index.ts`:
   ```ts
   import { readFileSync } from "node:fs";
   import {
     fetchPRContext,
     scopeReviewers,
     buildReviewerTaskPrompt,
   } from "./pr-review-utils.js";
   ```

2. Before the `export default function(pi)` body (module top-level), build the `REVIEWER_INSTRUCTIONS` map by reading each of the 6 agent `.md` files:
   ```ts
   const agentsDir = join(
     dirname(fileURLToPath(import.meta.url)),
     "..", "..", "..", "agents"
   );
   
   function loadReviewerInstructions(agentName: string): string {
     try {
       const raw = readFileSync(join(agentsDir, `${agentName}.md`), "utf8");
       // Strip YAML frontmatter (everything between the first two --- delimiters)
       const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
       return match ? match[1].trim() : raw.trim();
     } catch {
       return `You are a ${agentName} reviewer. Review the provided diff for issues.`;
     }
   }
   
   const REVIEWER_INSTRUCTIONS: Record<string, string> = {
     "pr-code-reviewer": loadReviewerInstructions("pr-code-reviewer"),
     "pr-failure-finder": loadReviewerInstructions("pr-failure-finder"),
     "pr-test-analyzer": loadReviewerInstructions("pr-test-analyzer"),
     "pr-code-simplifier": loadReviewerInstructions("pr-code-simplifier"),
     "pr-type-design-analyzer": loadReviewerInstructions("pr-type-design-analyzer"),
     "pr-comment-analyzer": loadReviewerInstructions("pr-comment-analyzer"),
   };
   ```
   Note: The `agentsDir` path must resolve correctly from the runtime location. At dev time (`src/resources/extensions/pr-lifecycle/index.ts`), `import.meta.url` points to `src/resources/extensions/pr-lifecycle/` — three levels up gives `src/resources/`, then `agents/`. Verify this path with a quick `ls` check during implementation.

3. Add the `kata_review_pr` tool via `pi.addTool()` inside the `export default function(pi)` body (after `kata_create_pr`):
   ```ts
   pi.addTool({
     name: "kata_review_pr",
     description: [
       "Prepares a parallel PR review dispatch plan.",
       "Pre-flights gh CLI, fetches the open PR diff for the current branch,",
       "scopes which of the 6 bundled reviewer subagents to run based on diff content,",
       "and builds a per-reviewer task prompt.",
       "Returns { ok: true, prNumber, selectedReviewers, reviewerTasks } on success —",
       "pass reviewerTasks to the `subagent` tool in parallel mode to dispatch reviewers.",
       "Returns { ok: false, phase, error, hint } for: gh-missing, gh-unauth, not-in-pr, diff-empty.",
     ].join(" "),
     parameters: {
       type: "object" as const,
       properties: {
         cwd: {
           type: "string",
           description: "Project root directory. Defaults to process.cwd().",
         },
         reviewers: {
           type: "array",
           items: { type: "string" },
           description:
             "Override reviewer list. When omitted, scopeReviewers auto-selects based on diff content.",
         },
       },
       required: [],
     },
     handler: async (params: { cwd?: string; reviewers?: string[] }) => {
       const cwd = params.cwd ?? process.cwd();
   
       if (!isGhInstalled()) {
         return { ok: false, phase: "gh-missing", error: "gh CLI not found in PATH", hint: "Install gh CLI: https://cli.github.com" };
       }
       if (!isGhAuthenticated()) {
         return { ok: false, phase: "gh-unauth", error: "gh CLI not authenticated", hint: "Run: gh auth login" };
       }
   
       const ctx = fetchPRContext(cwd);
       if (!ctx) {
         return { ok: false, phase: "not-in-pr", error: "No open PR found for current branch", hint: "Ensure the branch has been pushed and has an open PR on GitHub." };
       }
       if (!ctx.diff.trim()) {
         return { ok: false, phase: "diff-empty", error: "PR diff is empty — no changes to review", hint: "Ensure the PR branch has commits not in the base branch." };
       }
   
       const selectedReviewers = params.reviewers ?? scopeReviewers(ctx.diff, ctx.changedFiles);
   
       const reviewerTasks = selectedReviewers.map((reviewerName) => ({
         agent: reviewerName,
         task: buildReviewerTaskPrompt(ctx, reviewerName, REVIEWER_INSTRUCTIONS[reviewerName] ?? `Review the PR diff as ${reviewerName}.`),
       }));
   
       return {
         ok: true,
         prNumber: ctx.prNumber,
         title: ctx.title,
         diff: ctx.diff,
         selectedReviewers,
         reviewerTasks,
       };
     },
   });
   ```

4. Run `npx tsc --noEmit` and resolve any type errors. Common issues to watch for:
   - `agentsDir` path might need adjustment if TypeScript complains about `import.meta.url` usage (it's already used in `index.ts` for the scripts path — replicate the same pattern).
   - `PrContext` import: import the interface from `./pr-review-utils.js` if needed for explicit typing.

5. Run the full test suite and confirm nothing regressed:
   ```bash
   npm test
   ```
   All tests must pass (pr-review.test.ts 8/8, pr-body-composer.test.ts 4/4, pr-preferences.test.mjs 3/3, and all existing tests).

## Must-Haves

- [ ] `kata_review_pr` tool registered in `pr-lifecycle/index.ts`
- [ ] Returns `{ ok: false, phase }` for `gh-missing`, `gh-unauth`, `not-in-pr`, `diff-empty`
- [ ] Returns `{ ok: true, prNumber, selectedReviewers, reviewerTasks }` on success — `reviewerTasks` is `{ agent: string, task: string }[]`
- [ ] `REVIEWER_INSTRUCTIONS` map reads all 6 agent `.md` files; falls back to a minimal prompt if file is missing (never throws)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` all tests pass (no regressions)

## Verification

```bash
# TypeScript clean
npx tsc --noEmit

# All tests pass
npm test

# Tool is registered
grep "kata_review_pr" src/resources/extensions/pr-lifecycle/index.ts

# Module loads without error
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"
```

## Observability Impact

- Signals added/changed: `kata_review_pr` returns structured `{ ok, phase, error, hint }` — same D037 pattern as `kata_create_pr`. `phase` enum (`gh-missing / gh-unauth / not-in-pr / diff-empty`) distinguishes all pre-flight failure modes without prose parsing. `selectedReviewers` is machine-readable — agent can report exactly which reviewers were dispatched.
- How a future agent inspects this: Call `kata_review_pr` → inspect `phase` field for pre-flight failures; inspect `reviewerTasks` array for the dispatch plan; `reviewerTasks[].agent` names identify which reviewer subagents to dispatch
- Failure state exposed: `not-in-pr` vs `diff-empty` are separate phases — a future agent can distinguish "wrong branch" from "PR exists but is empty"

## Inputs

- `src/resources/extensions/pr-lifecycle/index.ts` — existing extension file to extend (kata_create_pr is already there)
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — exports to import (from T02)
- `src/resources/agents/pr-*.md` — 6 agent files to read at module load time (from T03)
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — `isGhInstalled`, `isGhAuthenticated` already imported; reuse

## Expected Output

- `src/resources/extensions/pr-lifecycle/index.ts` — modified to add `kata_review_pr` tool; TypeScript clean
- All 8 pr-review.test.ts tests pass (these test `pr-review-utils.ts` directly, not the tool — but TypeScript clean confirms the wiring compiles)
