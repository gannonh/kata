# PR Review Pipeline Eval — 2026-03-16

## Goal

Test and debug `/kata pr review` end-to-end using PR #78 as the target. PR #78 is the "refactor(kata): unified KataBackend architecture" PR on branch `refactor/unified-backend`. We are NOT actually reviewing PR #78 — we're using it to validate the review pipeline we built.

## What We've Done

### Bug 1: Large diffs crash subagent prompts (FIXED)
**File:** `apps/cli/src/resources/extensions/pr-lifecycle/pr-review-utils.ts`
**File:** `apps/cli/src/resources/extensions/pr-lifecycle/index.ts`
**Commit:** `98090b8` on `refactor/unified-backend`, pushed.

**Problem:** `buildReviewerTaskPrompt` embedded the entire PR diff into each reviewer's prompt. PR #78 has a 3.7M+ char diff → each subagent got ~925K tokens → Anthropic API returned `prompt is too long: 1308058 tokens > 1000000 maximum`.

**Fix:**
- Added `MAX_DIFF_CHARS = 400_000` (~100K tokens) budget for embedded diffs
- When diff exceeds limit, truncate at newline boundary and add instructions telling reviewer to use `bash("gh pr diff -- path/to/file.ts")` and `read()` tools for remaining files
- Replaced `diff: prCtx.diff` in tool result with compact `diffStats: { lines, files, chars, truncatedInReviewerPrompts }`

### Bug 2: reviewerTasks floods parent context (NOT FIXED)
**File:** `apps/cli/src/resources/extensions/pr-lifecycle/index.ts` (kata_review_pr tool, ~line 270)

**Problem:** The `kata_review_pr` tool returns `reviewerTasks` in its result. Each task contains the full ~400K-char truncated diff embedded in the prompt. With 6 reviewers, that's ~2.4M chars ≈ ~600K tokens dumped into the PARENT agent's context window. This filled the Opus 1M context to 96% before any review work happened.

**Root cause:** The tool result includes the full task prompts meant for subagents. The parent agent doesn't need these — it just needs to pass them to the `subagent` tool.

**Fix needed:** Don't include full task prompts in the tool result returned to the parent. Options:
1. **Return only metadata** — `reviewerTasks` contains just `{ agent, taskSummary }` (no diff). Write full tasks to temp files and have the subagent tool read them.
2. **Dispatch internally** — Have `kata_review_pr` dispatch the subagents itself instead of returning tasks for the parent to dispatch. Return just the reviewer results.
3. **Streaming/reference approach** — Return a reference ID that the subagent tool can use to fetch the full task without putting it in the conversation.

Option 2 is probably cleanest — the parent agent calls `kata_review_pr`, which internally calls the subagent tool, and returns aggregated findings. The parent never sees the diff.

### Bug 3: YAML parsing error in agent file (NOT FIXED)
**File:** `~/.kata-cli/agent/agents/pr-comment-analyzer.md`

**Problem:** The description field contains a colon — `description: Identifies comment rot: inaccurate, outdated...` — which breaks YAML frontmatter parsing. Error: `Nested mappings are not allowed in compact mappings`.

**Impact:** Blocks ALL subagent dispatch, not just the comment analyzer. The subagent system loads all agent files on init and fails on the bad one.

**Fix needed:** Quote the description string:
```yaml
description: "Identifies comment rot: inaccurate, outdated, misleading, or redundant code comments and docstrings."
```

This same issue likely affects any agent file with colons in the description. Should audit all agent files and either:
- Quote all descriptions that contain colons
- Make the YAML parser more lenient (use a library that handles this)

**Where these files come from:** Agent .md files are synced from `src/resources/agents/` to `~/.kata-cli/agent/agents/` by `resource-loader.ts` on startup. Fix the source files in `src/resources/agents/`.

## Current State

- Branch: `refactor/unified-backend`  
- PR: #78 (open, target: main)
- Bug 1 fix committed and pushed
- Bugs 2 and 3 NOT fixed
- Tests: 152/152 passing, TypeScript clean
- The Greptile and CodeRabbit reviews are already on PR #78 with substantive findings

## Files to Read

- `apps/cli/src/resources/extensions/pr-lifecycle/index.ts` — the `kata_review_pr` tool implementation (~line 200-290)
- `apps/cli/src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — `buildReviewerTaskPrompt`, `scopeReviewers`, `aggregateFindings`, `MAX_DIFF_CHARS`
- `src/resources/agents/pr-*.md` — the 6 bundled reviewer agent definitions (check for YAML issues)

## Next Steps

1. ~~**Fix Bug 3 first** (YAML quoting) — it blocks all subagent dispatch. Quick fix, high impact.~~ ✅ DONE
2. ~~**Fix Bug 2** (reviewerTasks flooding parent context) — architectural change to `kata_review_pr` tool.~~ ✅ DONE
3. ~~**Re-run the eval** — verify the full pipeline works end-to-end.~~ ✅ DONE (see below)
4. **Commit and push** all fixes to `refactor/unified-backend` branch.

## Eval Run — 2026-03-16 (successful)

**Target:** PR #2 "Workflow Loader and Config Layer" on a separate project (Rust codebase)
**Diff:** 2,660 lines, 25 files, 136K chars (not truncated)
**Reviewers:** 5 (pr-code-reviewer, pr-failure-finder, pr-code-simplifier, pr-type-design-analyzer, pr-comment-analyzer)
**Result:** 5 critical, 6 important, 15 suggestions — all substantive with file:line references and concrete fixes

### Additional bugs found and fixed during eval

**Bug 4: `cli.ts` didn't route `--mode json` to print mode (FIXED)**
Kata's custom `cli.ts` called `InteractiveMode` unconditionally. Subagent spawns with `--mode json` launched full TUI instead of JSON mode. Added `parseCliFlags()` and mode routing to `runPrintMode`.

**Bug 5: Concurrent `initResources()` causes ENOENT races (FIXED)**
Multiple subagent processes calling `initResources()` simultaneously race on file copy/delete operations. Skip `initResources()` in print mode — subagents inherit the already-synced agent directory.

**Bug 6: Subprocess hangs after `runPrintMode` completes (FIXED)**
Open handles (MCP adapter, timers) keep the Node event loop alive. Added `process.exit(0)` after `runPrintMode`.

**Bug 7: Opus 4.6 context window set to 200K instead of 1M (FIXED)**
Upstream `pi-ai` has wrong `contextWindow: 200000`. Patched in `cli.ts`. Tracked as KAT-487.

### Feature additions during eval

- **Observability:** `setWorkingMessage` shows live per-reviewer activity (tool calls, thinking, completion progress)
- **Model config:** `models.review` preference controls reviewer subagent model
- **Docs:** Updated preferences template, preferences-reference.md, README.md, AGENTS.md

## Test Command

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'
```

## Build Command

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-cli/apps/cli
npx tsc --noEmit
```
