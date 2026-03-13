---
id: T01
parent: S06
milestone: M002
provides:
  - "src/resources/LINEAR-WORKFLOW.md — 265-line workflow protocol for Linear mode with 7 sections"
  - "loader.ts sets LINEAR_WORKFLOW_PATH env var pointing to bundled LINEAR-WORKFLOW.md"
  - "before_agent_start in index.ts injects LINEAR-WORKFLOW.md content into system prompt when protocol.ready"
  - "mode-switching.test.ts status assertions fixed to match S05 reality (allow:true, live progress notice)"
  - "linear-tools.ts broken import path fixed (../../kata → ../kata)"
key_files:
  - src/resources/LINEAR-WORKFLOW.md
  - src/loader.ts
  - src/resources/extensions/kata/index.ts
  - src/resources/extensions/kata/tests/mode-switching.test.ts
  - src/resources/extensions/linear/linear-tools.ts
key_decisions:
  - "Workflow doc injected as workflowDocBlock appended after newSkillsBlock in system prompt — keeps existing blocks intact and additive"
  - "readFileSync wrapped in try/catch so a race between existsSync and read silently skips injection rather than crashing"
  - "D028 normalization (asterisk bullets, no trailing newline) documented in LINEAR-WORKFLOW.md Artifact Storage section"
patterns_established:
  - "protocol.ready && protocol.path gate pattern for conditional workflow doc injection in before_agent_start"
observability_surfaces:
  - "System prompt now contains LINEAR-WORKFLOW.md content in every Linear-mode session; inspect via modeGate.protocol.ready + LINEAR_WORKFLOW_PATH env var"
  - "workflowDocBlock injection is silent on failure (file race); workflowModeBlock still names the mode — workflowDocBlock absent means protocol.ready was false at hook time"
duration: 25min
verification_result: passed
completed_at: 2026-03-12T18:58:00Z
blocker_discovered: false
---

# T01: Write LINEAR-WORKFLOW.md, wire loader env var, inject into system prompt, fix stale test

**265-line `LINEAR-WORKFLOW.md` written and injected into the system prompt for every Linear-mode session; stale test assertions fixed; full suite now 64 pass / 0 fail.**

## What Happened

Created `src/resources/LINEAR-WORKFLOW.md` with all 7 required sections: Quick Start (calls `kata_derive_state` first), The Hierarchy (entity mapping table), Entity Title Convention (D021 bracket format), Phase Transitions (including `verifying` = same as `executing`, no UAT gate), Artifact Storage (D028 normalization, `* ` bullets, `requirements` always `undefined` in Linear mode), Auto-Mode Contract (session start/end obligations), and Tool Reference (full `kata_*` table).

Added `process.env.LINEAR_WORKFLOW_PATH` to `loader.ts` immediately after the existing `KATA_WORKFLOW_PATH` line, pointing at `src/resources/LINEAR-WORKFLOW.md`.

Wired system prompt injection in the `before_agent_start` hook in `index.ts`: after the `workflowModeBlock` is built, if `modeGate.protocol.ready && modeGate.protocol.path`, reads the file with `readFileSync` and appends the content as `workflowDocBlock` to the final `systemPrompt`. Added `readFileSync` to the existing `"node:fs"` import.

Fixed the two stale assertions in `mode-switching.test.ts` for the `status` entrypoint guard: `allow: false → true` and notice pattern `/\/kata prefs status/i → /live progress/i`. These were left stale from S05 which changed `status` to `allow: true` with notice "Showing live progress derived from Linear API." but didn't update the test.

Also fixed a pre-existing broken import in `linear-tools.ts` (`../../kata/linear-config.js` → `../kata/linear-config.js`) that was causing `review-comment-regressions.test.ts` and the smoke test to fail. Both failures predated this task.

## Verification

```
# mode-switching tests: 3 pass, 0 fail
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
→ ✔ file mode remains the default...
→ ✔ linear mode selects LINEAR-WORKFLOW.md and blocks file-backed entrypoints
→ ✔ system prompt wiring stays mode-aware and becomes ready when LINEAR-WORKFLOW.md exists

# Full suite: 64 pass, 0 fail (was 2 fail before this task)
npm test → pass

# TypeScript: clean
npx tsc --noEmit → no output

# File line count: 265 (within 200-500 range)
wc -l src/resources/LINEAR-WORKFLOW.md → 265

# Env var wired
grep "LINEAR_WORKFLOW_PATH" src/loader.ts → process.env.LINEAR_WORKFLOW_PATH = ...

# Injection wired
grep -n "protocol.ready" src/resources/extensions/kata/index.ts → line 179
```

## Diagnostics

System prompt injection is observable by inspecting `modeGate.protocol.ready` and `modeGate.protocol.path` at `before_agent_start` time. `LINEAR_WORKFLOW_PATH` env var holds the bundled path. Injection silently skips if the file disappears between `resolveWorkflowProtocol` and the `readFileSync` call; `workflowModeBlock` still names the mode in that case.

## Deviations

Fixed `linear-tools.ts` broken import (`../../kata` → `../kata`) — not in the task plan, but was causing 2 pre-existing test failures that would have blocked the `npm test → no failures` slice-level check. Treated as a related fix in the same commit.

## Known Issues

`/kata auto` in Linear mode still returns `allow: false` — unblocking `auto` is planned for a later S06 task. The `linear-auto.test.ts` referenced in the slice verification does not exist yet.

## Files Created/Modified

- `src/resources/LINEAR-WORKFLOW.md` — 265-line Linear mode workflow protocol document (7 sections)
- `src/loader.ts` — one added line: `process.env.LINEAR_WORKFLOW_PATH = join(resourcesDir, "LINEAR-WORKFLOW.md")`
- `src/resources/extensions/kata/index.ts` — `readFileSync` added to import; `workflowDocBlock` injection in `before_agent_start`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — 2 assertion fixes for `status` entrypoint
- `src/resources/extensions/linear/linear-tools.ts` — fixed broken import path (`../../kata` → `../kata`)
