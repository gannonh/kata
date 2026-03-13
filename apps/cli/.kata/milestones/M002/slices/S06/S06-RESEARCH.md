# S06: Workflow Prompt & Auto-Mode Integration — Research

**Date:** 2026-03-12

## Summary

S06 is the final delivery slice for M002. Its job is to wire up two things that earlier slices left intentionally blocked: the `LINEAR-WORKFLOW.md` prompt (R107) and `/kata auto` in Linear mode (R108). S02 set up protocol resolution and entrypoint guards but blocked all dispatch; S05 unblocked `status`/`dashboard` and proved state derivation. S06 must unblock `auto`, build the workflow document, and wire the two together into a functioning end-to-end loop.

The primary risk is the **UUID gap in `KataState`**: `deriveLinearState` returns `ActiveRef` with Kata IDs (`T01`, `S01`, `M001`) rather than Linear UUIDs, because that's what the file-mode interface expects. The auto-mode loop for Linear mode needs Linear UUIDs (specifically for slice issues, task sub-issues) to call `kata_update_issue_state`. Resolving this without changing the shared `KataState` type is the key design decision for T02.

The recommended approach for the auto loop is a **prompt-delegation model**: instead of the TypeScript loop resolving UUIDs and inlining Linear document content itself, each Linear-mode prompt tells the agent to call `kata_derive_state` at the start of its session to learn exactly where it is, then use `kata_read_document` / `kata_write_document` / `kata_update_issue_state` as instructed by `LINEAR-WORKFLOW.md`. This is lower complexity, aligns with how `LINEAR-WORKFLOW.md` is designed to work, and avoids duplicating document-fetch logic in the loop.

Secondary risk: a **stale test assertion** left from S05. `mode-switching.test.ts` still asserts `status.allow === false`, but S05 changed it to `true`. This test failure must be fixed before S06 verification can pass.

## Recommendation

Build S06 in three tasks:

**T01 — LINEAR-WORKFLOW.md + system prompt injection**
Create `src/resources/LINEAR-WORKFLOW.md` (analogous to KATA-WORKFLOW.md but instructs agents to use Linear tools). Update `loader.ts` to set `LINEAR_WORKFLOW_PATH`. Update `index.ts` `before_agent_start` to read the file from `protocol.path` and inject its content into the system prompt when in Linear mode (parallel to how KATA-WORKFLOW.md is referenced today via the workflow doc in guided-flow.ts / slash commands).

**T02 — Linear auto-mode loop**
Unblock `"auto"` in `linear-config.ts`. Update `auto.ts` `startAuto()` to use `deriveKataState()` (the mode-aware helper in `commands.ts`) instead of bare `deriveState()`. Create `src/resources/extensions/kata/linear-auto.ts` with Linear-mode prompt builders for each phase (`pre-planning`, `planning`, `executing`/`verifying`, `summarizing`). Wire `dispatchNextUnit()` to call the right builder based on mode. Skip git-branch operations (branch/merge) in Linear mode. Unit-test the new entry-gate and phase routing.

**T03 — Test fixes, integration, TypeScript clean**
Fix the stale mode-switching test assertion. Run the full test suite. Optionally run an end-to-end integration test verifying `/kata auto` dispatches all phases against real Linear data.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| State derivation in Linear mode | `deriveKataState()` in `commands.ts` | Already mode-aware, handles API key / config errors as `phase:"blocked"` — copy this pattern into `auto.ts` not the raw `deriveLinearState()` call |
| Phase → Linear state transition | `kata_update_issue_state({ issueId, phase })` tool + `getLinearStateForKataPhase()` | Built and tested in S05; teamId resolved automatically from preferences |
| Document read for plan content | `readKataDocument(client, title, attachment)` from `linear-documents.ts` | Handles `null`-on-miss; correct `* [ ]` bullet normalization (D028) already baked in |
| Document write for summaries | `writeKataDocument(client, title, content, attachment)` | Title-scoped upsert; idempotent; tested in S04 |
| Entity IDs → Linear UUIDs | `listKataSlices()` / `listKataTasks()` from `linear-entities.ts` | Returns full `LinearIssue[]` with `.id` UUID + `.title` for Kata ID extraction |
| System prompt injection | `before_agent_start` hook in `index.ts` + `resolveWorkflowProtocol()` | Protocol path resolution already handles both KATA and LINEAR workflow docs; just read from `protocol.path` |

## Existing Code and Patterns

- `src/resources/extensions/kata/linear-config.ts` — `resolveWorkflowProtocol()` already returns `{ path, ready, documentName }` for `LINEAR-WORKFLOW.md`; `buildLinearEntrypointGuard("auto", ...)` is the function to change to `allow:true`; the `"system-prompt"` case already returns `allow:true` with notice; `"status"`/`"dashboard"` set `allow:true` in S05 — the pattern for unblocking is clear
- `src/resources/extensions/kata/index.ts:before_agent_start` — injects system prompt and `workflowModeBlock`; today only a notice is injected for Linear mode; to inject the workflow doc, read `protocol.path` when `protocol.ready` is true and prepend/append it to the system prompt (or inject as a non-display message, same as `kata-guided-context`)
- `src/resources/extensions/kata/auto.ts:startAuto()` — calls `getWorkflowEntrypointGuard("auto")` (will unblock in T02); calls `deriveState(base)` (file-backed — must switch to `deriveKataState(base)` from commands.ts); calls git operations that must be skipped in Linear mode
- `src/resources/extensions/kata/commands.ts:deriveKataState()` — mode-aware; handles missing API key and config errors as `phase:"blocked"` with human-readable `blockers[]`; import and reuse in `auto.ts` rather than duplicating
- `src/resources/extensions/kata/auto.ts:dispatchNextUnit()` — the core loop; dispatches based on `state.phase`; each dispatch builds a prompt and calls `pi.sendMessage()`; Linear mode needs a parallel dispatch path (or inline mode checks) for each phase
- `src/resources/extensions/linear/linear-entities.ts` — `listKataSlices(client, projectId, labelId)` and `listKataTasks(client, parentId)` return `LinearIssue[]` with full UUIDs; `parseKataEntityTitle()` extracts Kata IDs from Linear titles — use these in prompt builders to resolve UUIDs
- `src/resources/extensions/linear/linear-state.ts:deriveLinearState()` — returns `KataState` with `requirements: undefined` always; `activeTask.id` is Kata ID (T01) not UUID; `progress.tasks` is only populated when children exist
- `src/resources/linear/linear-tools.ts` — `kata_derive_state` (zero-args), `kata_update_issue_state`, `kata_list_milestones`, `kata_list_slices`, `kata_list_tasks`, `kata_read_document`, `kata_write_document` — these are the tools agents use in Linear mode; `LINEAR-WORKFLOW.md` should document them
- `src/resources/KATA-WORKFLOW.md` — the reference document for style and level of detail; `LINEAR-WORKFLOW.md` should match its structure: Quick Start, Hierarchy, Entity Mapping, Phase Transitions, Artifact Storage, Auto-Mode Contract
- `src/loader.ts` — sets `KATA_WORKFLOW_PATH` env var pointing to bundled `KATA-WORKFLOW.md`; must add `LINEAR_WORKFLOW_PATH` pointing to bundled `LINEAR-WORKFLOW.md` in same manner
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — currently has stale assertion at line 118: `assert.equal(status.allow, false)` — S05 changed `status` to `allow:true` but this test was not updated; **fix this in T01/T02** or the test suite will remain red

## Constraints

- `KataState.activeTask.id` in Linear mode is the Kata ID (`T01`) not the Linear UUID — for state advancement, the loop must call `listKataTasks(client, sliceIssueId)` to resolve the Linear UUID, OR delegate UUID resolution to the agent via the prompt
- `KataState.requirements` is always `undefined` in Linear mode (no REQUIREMENTS.md) — prompt templates must not assume it is set
- Linear mode has no git-branch-per-slice convention; `ensureSliceBranch`, `switchToMain`, `mergeSliceToMain` in `auto.ts` must be skipped in Linear mode (guard on `!isLinearMode()`)
- `LINEAR-WORKFLOW.md` must live at `src/resources/LINEAR-WORKFLOW.md` (not in extensions/) so the resource-loader pattern applies — `loader.ts` reads it directly via `LINEAR_WORKFLOW_PATH` env var (same as KATA-WORKFLOW.md)
- `resolveWorkflowProtocol()` in `linear-config.ts` reads `process.env.LINEAR_WORKFLOW_PATH` — loader.ts must set this before any session starts
- The `mode-switching.test.ts` test file uses a `withWorkflowEnv` helper that resets env vars — the stale `status.allow === false` assertion at line 118 must be changed to `assert.equal(status.allow, true)`
- Linear Document markdown normalization (D028): `* ` bullets, no trailing newline — `LINEAR-WORKFLOW.md` must mention this so agents don't write docs in a way that causes round-trip failure

## Common Pitfalls

- **Trying to inline Linear document content during prompt build** — `readKataDocument` is async and makes an API call; calling it for every prompt in the loop (task plan, roadmap, summaries) adds latency and complexity. Better: teach the agent in `LINEAR-WORKFLOW.md` to call `kata_read_document` itself; the prompt just provides IDs and context
- **Passing Kata IDs (T01) where Linear UUIDs are needed** — `kata_update_issue_state({ issueId })` expects the Linear UUID not "T01". Always resolve UUIDs before calling it; use `listKataTasks(client, sliceIssueId)` to get the full issue list and find the UUID by matching the title
- **Double-advancing already-transitioned issues** — linear workspace automations may auto-complete parent issues when all children complete (S05 integration test noted this). Before calling `kata_update_issue_state`, check that the issue's current state isn't already terminal
- **Using `deriveState(basePath)` instead of `deriveKataState(basePath)` in auto** — the current `auto.ts` calls the file-backed function directly; after the change, always use `deriveKataState` (mode-aware helper from commands.ts) which handles both modes and surfaces errors as `phase:"blocked"` instead of throwing
- **Forgetting `requirements: undefined`** — file-mode auto prompts may reference `state.requirements.active` etc. New Linear-mode prompts must not assume this field is populated; check before use
- **Phase "verifying" in linear mode** — `deriveLinearState` returns `"verifying"` when some but not all tasks are terminal; the auto loop must treat it like `"executing"` and continue running tasks — don't stop or ask for UAT in Linear mode for "verifying" phase; just pick the first non-terminal task

## Open Risks

- **`kata_update_issue_state` auto-advance race**: if the agent advances the last task to "done" and a Linear workspace automation also advances the slice to "done", `deriveLinearState` on the next loop iteration will return `phase:"summarizing"` which is correct — but if it returns `phase:"complete"` (all milestones done), auto-mode stops prematurely. Mitigation: the integration test in S05 already handles `"summarizing" | "complete"` — follow the same pattern in S06 integration test assertions
- **No `complete-slice` equivalent in Linear**: file-mode `complete-slice` writes the slice summary, marks roadmap checkbox, and commits to git branch. In Linear mode, the equivalent is: write summary document (`kata_write_document`), advance slice to `completed` state (`kata_update_issue_state`). The slice branch / merge is N/A. If the agent doesn't do both steps, `deriveLinearState` will show the slice as still active next iteration
- **`LINEAR-WORKFLOW.md` content quality**: the document must be high enough quality to guide an agent through the full cycle (plan → execute → summarize → advance) using only Linear tools. If it's vague or omits tool names, agents will fall back to guessing. Read KATA-WORKFLOW.md carefully before writing it
- **System prompt size**: injecting the full `LINEAR-WORKFLOW.md` into every session's system prompt adds tokens. KATA-WORKFLOW.md is ~800 lines; aim for 300-500 lines for the Linear equivalent to keep context cost reasonable

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript Node.js | — | No relevant skill needed — existing extension patterns sufficient |

## Sources

- S02 Summary (`.kata/milestones/M002/slices/S02/S02-SUMMARY.md`) — forward intelligence: protocol resolution wired, auto blocked intentionally pending S06
- S05 Summary (`.kata/milestones/M002/slices/S05/S05-SUMMARY.md`) — forward intelligence: `kata_derive_state` is the canonical state call; `kata_update_issue_state` is the advancement primitive; `requirements: undefined` always; stale mode-switching test must be fixed
- `src/resources/extensions/kata/linear-config.ts` — `resolveWorkflowProtocol()`, `buildLinearEntrypointGuard()` — source of truth for protocol path resolution and entrypoint guards
- `src/resources/extensions/kata/auto.ts` — full auto-mode loop (2797 lines); key: `startAuto()` mode gate, `dispatchNextUnit()` phase dispatch, git operations that need Linear-mode guards
- `src/resources/extensions/kata/commands.ts:deriveKataState()` — the mode-aware state helper to reuse in auto.ts
- `src/resources/extensions/kata/index.ts:before_agent_start` — system prompt injection hook; where LINEAR-WORKFLOW.md content injection goes
- `src/loader.ts` — where `KATA_WORKFLOW_PATH` is set; `LINEAR_WORKFLOW_PATH` must be added here
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — stale assertion at line 118 confirmed by test run: `true !== false` for `status.allow`
