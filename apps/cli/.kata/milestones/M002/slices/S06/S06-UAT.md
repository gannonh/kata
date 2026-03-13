# S06: Workflow Prompt & Auto-Mode Integration — UAT

**Milestone:** M002
**Written:** 2026-03-12

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The slice plan explicitly set `real runtime required: no` and `human/UAT required: no`. All behavior (routing, prompt content, entrypoint gating, TypeScript types) is verifiable via unit tests and `npx tsc --noEmit`. The 22 `linear-auto.test.ts` tests and 3 `mode-switching.test.ts` tests cover every dispatch path without requiring a live Linear workspace.

## Preconditions

- Node.js with `--experimental-strip-types` support available
- `npm install` completed (dependencies present)
- Project at `/Volumes/EVO/kata/kata-mono/apps/cli`

## Smoke Test

```bash
# Auto unblocked + routing + TypeScript in one pass
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts && \
npx tsc --noEmit && echo "SMOKE PASS"
```
Expected: 22 tests pass, `npx tsc` is silent, output ends with `SMOKE PASS`.

## Test Cases

### 1. LINEAR-WORKFLOW.md is bundled and env var is wired

```bash
ls src/resources/LINEAR-WORKFLOW.md
grep "LINEAR_WORKFLOW_PATH" src/loader.ts
wc -l src/resources/LINEAR-WORKFLOW.md
```
**Expected:** file exists; grep returns the `process.env.LINEAR_WORKFLOW_PATH = ...` line; line count is 265.

### 2. Mode-switching tests pass (3/3)

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
```
**Expected:** `pass 3, fail 0`. Tests confirm: (a) file mode resolves KATA-WORKFLOW.md; (b) linear mode selects LINEAR-WORKFLOW.md and status/auto are allowed; (c) system prompt wiring is mode-aware and becomes ready when LINEAR-WORKFLOW.md exists.

### 3. Auto entrypoint is unblocked in Linear mode

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --eval \
  "import { getWorkflowEntrypointGuard } from './src/resources/extensions/kata/linear-config.ts';
   const g = getWorkflowEntrypointGuard('auto', { path: '/tmp/p', scope: 'project', preferences: { workflow: { mode: 'linear' } } });
   console.log(g.allow);"
```
**Expected:** `true`

### 4. Linear auto routing covers all 5 phases (22 unit tests)

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts
```
**Expected:** `pass 22, fail 0`. Tests cover:
- `resolveLinearKataState` returns `phase:blocked` when `LINEAR_API_KEY` is not set
- `resolveLinearKataState` falls back to `deriveState` in file mode
- `selectLinearPrompt` returns null for `complete`, `blocked`, unknown phases
- `selectLinearPrompt` returns execute prompt for both `executing` and `verifying`
- `selectLinearPrompt` returns plan-slice for `planning`, plan-milestone for `pre-planning`, complete-slice for `summarizing`
- All 4 prompt builders include correct entity IDs and `kata_*` tool references

### 5. Full test suite passes (86/86)

```bash
npm test
```
**Expected:** `pass 86, fail 0` — no regressions in any existing tests.

### 6. TypeScript compiles clean

```bash
npx tsc --noEmit
```
**Expected:** no output (zero errors, zero warnings).

## Edge Cases

### File-mode projects are unaffected

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --eval \
  "import { getWorkflowEntrypointGuard } from './src/resources/extensions/kata/linear-config.ts';
   const g = getWorkflowEntrypointGuard('auto', { path: '/tmp/p', scope: 'project', preferences: {} });
   console.log(g.mode, g.isLinearMode);"
```
**Expected:** `file false` — file mode is unchanged; auto entrypoint behavior in file mode is unaffected by this slice.

### Missing LINEAR_API_KEY produces blocked state, not crash

Tested by `linear-auto.test.ts` test "resolveLinearKataState returns blocked when LINEAR_API_KEY is not set".
**Expected:** `phase: "blocked"`, `blockers` array contains a message referencing `LINEAR_API_KEY`.

### verifying phase dispatches to execute-task (no UAT pause)

Tested by `linear-auto.test.ts` test "selectLinearPrompt returns execute prompt for phase=verifying".
**Expected:** `selectLinearPrompt({ phase: "verifying", ... })` returns the same string as `buildLinearExecuteTaskPrompt`.

## Failure Signals

- `npm test` exits non-zero → regression in existing suite; check which test file failed
- `npx tsc --noEmit` produces output → TypeScript error introduced; check `auto.ts`, `linear-auto.ts`, or `linear-config.ts`
- `getWorkflowEntrypointGuard("auto").allow` returns `false` → `buildLinearEntrypointGuard` `"auto"` case was reverted; check `linear-config.ts`
- `selectLinearPrompt` returns null for `executing` → `linear-auto.ts` dispatcher broken; check phase string spelling
- `workflowDocBlock` absent from system prompt despite `protocol.ready` being true → `readFileSync` path in `index.ts` `before_agent_start` is not reached; check that `LINEAR_WORKFLOW_PATH` env var is set at load time

## Requirements Proved By This UAT

- R107 — LINEAR-WORKFLOW.md exists, is bundled via `LINEAR_WORKFLOW_PATH`, and is injected into the system prompt when `protocol.ready`; content covers all required sections
- R108 — `/kata auto` returns `allow: true` in Linear mode; `dispatchNextUnit` routes to correct prompt builders for all 5 phases; `resolveLinearKataState` surfaces blocked state on missing credentials; git operations are skipped

## Not Proven By This UAT

- End-to-end `/kata auto` run against a real Linear workspace (executing a task, writing a summary, advancing issue state in Linear UI) — the slice plan marked this as optional; R108 is proven at the routing/dispatch layer via unit tests
- Human visual confirmation that `LINEAR-WORKFLOW.md` content is useful and complete for agent operations — the document structure is validated by inspection, not by running an agent against it
- Performance of `deriveLinearState` at auto-mode loop frequency — R109 (validated in S05) covers the latency question; S06 builds on that foundation

## Notes for Tester

- The `resolveLinearKataState` blocked-path test temporarily writes to `.kata/preferences.md` and restores it in try/finally. If a test run is interrupted mid-execution, the preferences file may be left in a linear-mode override state. If tests behave strangely after an interrupted run, check `.kata/preferences.md` and restore from git (`git checkout HEAD -- .kata/preferences.md`).
- All 6 S06 verification commands are independently reproducible. Run them in any order.
- `npm test` takes ~60 seconds due to 2 slow smoke tests (kata-startup and mcp-adapter install). The other 84 tests run in under 5 seconds.
