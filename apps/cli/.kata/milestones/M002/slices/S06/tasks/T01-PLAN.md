---
estimated_steps: 4
estimated_files: 4
---

# T01: Write LINEAR-WORKFLOW.md, wire loader env var, inject into system prompt, fix stale test

**Slice:** S06 — Workflow Prompt & Auto-Mode Integration
**Milestone:** M002

## Description

Creates `LINEAR-WORKFLOW.md` — the workflow protocol document that teaches agents how to plan, execute, and summarize work against Linear instead of local `.kata/` files. Wires it into the runtime: `loader.ts` sets the path, and `before_agent_start` in `index.ts` injects the content into the system prompt when the project is in Linear mode and the file exists. Also fixes the stale `mode-switching.test.ts` assertion left from S05 (which changed `status` to `allow: true` but didn't update the test).

This task delivers R107 end-to-end and unblocks the failing test that has been red since S05 landed.

## Steps

1. **Write `src/resources/LINEAR-WORKFLOW.md`** (~300-400 lines). Structure it analogously to `KATA-WORKFLOW.md` but for Linear tools. Required sections:
   - **Quick Start** — "Call `kata_derive_state` first; act on `phase` and `activeTask`; use these tools instead of reading files"
   - **The Hierarchy** — Kata-to-Linear entity mapping table (Milestone→LinearMilestone, Slice→ParentIssue, Task→SubIssue, Artifact→LinearDocument)
   - **Entity Title Convention** — `[M001] Title`, `[S01] Title`, `[T01] Title` bracket format (D021)
   - **Phase Transitions** — which `phase` means what action, and which `kata_update_issue_state` phase value to call when done
   - **Artifact Storage** — how to call `kata_read_document` / `kata_write_document`; title format (`M001-ROADMAP`, `S01-PLAN`, `T01-PLAN`, `T01-SUMMARY`, `S01-SUMMARY`); D028 normalization (`* ` bullets, no trailing newline)
   - **Auto-Mode Contract** — what the agent MUST do at start of each session (call `kata_derive_state`), what it MUST do at end (call `kata_update_issue_state` to advance state, call `kata_write_document` for summaries)
   - **Tool Reference** — table of `kata_*` tools with one-line descriptions: `kata_derive_state`, `kata_update_issue_state`, `kata_list_milestones`, `kata_list_slices`, `kata_list_tasks`, `kata_read_document`, `kata_write_document`, `kata_list_documents`, `kata_create_milestone`, `kata_create_slice`, `kata_create_task`, `kata_ensure_labels`
   - **Requirements field** — note that `state.requirements` is always `undefined` in Linear mode; do not assume it is populated
   - **`verifying` phase** — treat same as `executing`; pick first non-terminal task sub-issue; do not stop or request UAT

2. **Add `LINEAR_WORKFLOW_PATH` to `src/loader.ts`** — immediately after the existing `KATA_WORKFLOW_PATH` line (~line 82), add:
   ```ts
   process.env.LINEAR_WORKFLOW_PATH = join(resourcesDir, "LINEAR-WORKFLOW.md");
   ```
   `resourcesDir` is already resolved in that block.

3. **Wire system prompt injection in `src/resources/extensions/kata/index.ts`** `before_agent_start` hook — after the existing `workflowModeBlock` is built, and before `systemPrompt` is assembled:
   - If `modeGate.protocol.ready && modeGate.protocol.path`, read the file: `const workflowDoc = readFileSync(modeGate.protocol.path, "utf-8")`.
   - Add `readFileSync` import from `"node:fs"` if not already imported (check existing imports).
   - Inject the doc content by appending it to `systemContent`: e.g. `const systemWithWorkflow = modeGate.protocol.ready && modeGate.protocol.path ? systemContent + "\n\n" + workflowDoc : systemContent;` then use `systemWithWorkflow` in the final `systemPrompt` string.
   - This mirrors the pattern used for `KATA-WORKFLOW.md` in the file-mode `dispatchDoctorHeal` / `dispatchNextUnit` prompt builds — content is prepended to agent context.

4. **Fix stale assertion in `mode-switching.test.ts`** — in the test "linear mode selects LINEAR-WORKFLOW.md and blocks file-backed entrypoints":
   - Line ~118: `assert.equal(status.allow, false)` → `assert.equal(status.allow, true)`
   - Line ~119: `assert.match(status.notice ?? "", /\/kata prefs status/i)` → `assert.match(status.notice ?? "", /live progress/i)` (the S05 notice is "Showing live progress derived from Linear API.")

## Must-Haves

- [ ] `src/resources/LINEAR-WORKFLOW.md` file exists with all 7 sections; total line count ≤ 500
- [ ] Quick Start section instructs agent to call `kata_derive_state` first
- [ ] D028 normalization (`* ` bullets) mentioned in Artifact Storage section
- [ ] `requirements` field caveat noted (`undefined` in Linear mode)
- [ ] `verifying` phase handling documented (treat as `executing`)
- [ ] `loader.ts` sets `LINEAR_WORKFLOW_PATH` after `KATA_WORKFLOW_PATH`
- [ ] `before_agent_start` injects workflow doc content when `protocol.ready && protocol.path`
- [ ] `mode-switching.test.ts` test suite passes with 0 failures

## Verification

```bash
# Confirm file exists and is non-trivial
wc -l src/resources/LINEAR-WORKFLOW.md
# → 200-500 lines

# Confirm env var is set in loader
grep "LINEAR_WORKFLOW_PATH" src/loader.ts
# → process.env.LINEAR_WORKFLOW_PATH = ...

# Confirm injection is wired in index.ts
grep -n "protocol.ready\|workflowDoc\|LINEAR" src/resources/extensions/kata/index.ts
# → shows protocol.ready check

# Run mode-switching tests (previously failing)
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
# → 3 pass, 0 fail
```

## Observability Impact

- Signals added/changed: system prompt now contains `LINEAR-WORKFLOW.md` content when project is in Linear mode; this is visible to the LLM in every Linear-mode session start
- How a future agent inspects this: check `modeGate.protocol.ready` and `modeGate.protocol.path` via `resolveWorkflowProtocol()`; read `LINEAR_WORKFLOW_PATH` env var to confirm the bundled path
- Failure state exposed: if `protocol.ready === false` (file missing), the injection is skipped silently; the `workflowModeBlock` still mentions the mode but warns the file is pending — this is the pre-existing S02 behavior for missing prompt file

## Inputs

- `src/resources/KATA-WORKFLOW.md` — reference for structure, tone, and level of detail; `LINEAR-WORKFLOW.md` should match this document's quality
- `src/resources/extensions/kata/linear-config.ts` — `resolveWorkflowProtocol()` already returns `{ path, ready, documentName }` for `LINEAR-WORKFLOW.md`; reads `process.env.LINEAR_WORKFLOW_PATH`
- `src/resources/extensions/kata/index.ts` `before_agent_start` — current injection pattern; `modeGate.protocol` is already available
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — contains the stale assertion at ~line 118

## Expected Output

- `src/resources/LINEAR-WORKFLOW.md` — complete workflow document for Linear mode, ≤500 lines, 7 sections
- `src/loader.ts` — one added line: `process.env.LINEAR_WORKFLOW_PATH = join(resourcesDir, "LINEAR-WORKFLOW.md")`
- `src/resources/extensions/kata/index.ts` — `before_agent_start` reads and injects workflow doc when `protocol.ready`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — 2 assertion fixes; all 3 tests pass
