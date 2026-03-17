# PR Review Pipeline — Bug 2 & Bug 3 Fix Plan

**Date:** 2026-03-16  
**Related:** `.kata/evals/2026-03-16-pr-review-eval.md`, KAT-484

---

## Bug 3: YAML Quoting in Agent Files

**Problem:** `pr-comment-analyzer.md` has `description: Identifies comment rot: inaccurate...` — the colon after "rot" breaks YAML parsing. Blocks all subagent dispatch.

**Scope:** All 6 `pr-*.md` agent files in `src/resources/agents/`.

**Steps:**
1. Audit all 6 files for unquoted colons in description fields
2. Only `pr-comment-analyzer.md` has the issue (confirmed — `description: Identifies comment rot: inaccurate...`)
3. Quote that description with double quotes
4. While we're there, quote all 6 descriptions defensively — colons in YAML values are a recurring footgun
5. Verify: run the test suite, confirm TypeScript compiles

**Files changed:** `src/resources/agents/pr-comment-analyzer.md` (required), optionally all 5 others (defensive quoting)

**Risk:** Near zero. Only changes YAML frontmatter string quoting.

---

## Bug 2: Internal Subagent Dispatch in `kata_review_pr`

**Problem:** `kata_review_pr` returns `reviewerTasks` (each containing ~400K char diff) in its tool result. With 6 reviewers, ~2.4M chars flood the parent's context window.

**Root cause:** The tool was designed as a two-step protocol: (1) `kata_review_pr` returns tasks, (2) parent calls `subagent({ tasks: reviewerTasks })`. This means the full task prompts round-trip through the parent's context.

**Fix:** Have `kata_review_pr` dispatch subagents internally and return only the aggregated findings. The parent never sees the diff.

**Steps:**

1. **Import subagent dispatch capability** into `pr-lifecycle/index.ts`. Options:
   - **Option A:** Import `discoverAgents` and `runSingleAgent` from the subagent extension (tight coupling)
   - **Option B:** Spawn kata child processes directly using the same pattern as the subagent extension (copy the spawn logic)
   - **Option C:** Use `ctx` to call the subagent tool programmatically if pi's extension API supports tool-to-tool calls

   → **Investigated:** `ExtensionContext` has no `callTool`/`executeTool` API. `ExtensionAPI.getAllTools()` returns metadata only (name/description/params), not execute functions. `sendUserMessage()` goes through LLM round-trip. **Option C is ruled out.**
   → **Decision:** Option B — copy spawn logic into pr-lifecycle. ~60 lines of self-contained spawn/JSONL parsing. No cross-extension coupling. Extract as `spawnReviewerAgent()` in `pr-review-utils.ts`.

2. **Refactor `kata_review_pr` execute function:**
   - Keep everything up to building `reviewerTasks` the same
   - Instead of returning `reviewerTasks`, spawn subagent processes in parallel (max concurrency 4)
   - Collect each reviewer's final output text
   - Run `aggregateFindings()` on the collected outputs (already exists in `pr-review-utils.ts`)
   - Return `{ ok, prNumber, selectedReviewers, findings: aggregatedFindings }` — no diff, no task prompts

3. **Update the tool's description** — it now returns findings directly, not tasks to dispatch.

4. **Update `/kata pr review` command handler** — it currently expects `reviewerTasks` in the result and dispatches via the `subagent` tool. After this change, it gets findings directly.

5. **Stream progress** via `onUpdate` callback — emit `"Reviewing: 2/6 complete..."` style updates so the parent sees progress.

6. **Verify:**
   - TypeScript compiles
   - Tests pass
   - Manually test against PR #78

**Files changed:**
- `src/resources/extensions/pr-lifecycle/index.ts` — main refactor
- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — possibly add a `spawnReviewerAgent` helper

**Risk:** Medium. Changes the tool's public contract (no longer returns `reviewerTasks`). Any code that reads `reviewerTasks` from the result needs updating.
