---
phase: 06-ai-context-injection
plan: 01
subsystem: agent-prompt
tags: [git, context-injection, prompt, ai-awareness]
requires: [05-real-time-updates]
provides: [git-context-in-agent-messages, ai-git-awareness]
affects: [07-polish-edge-cases]
tech-stack:
  added: []
  patterns: [xml-tagged-context-injection, per-message-context-refresh]
key-files:
  created:
    - packages/shared/src/prompts/__tests__/git-context.test.ts
  modified:
    - packages/shared/src/prompts/system.ts
    - packages/shared/src/agent/craft-agent.ts
    - apps/electron/src/main/sessions.ts
    - packages/shared/src/prompts/print-system-prompt.ts
decisions:
  - id: CTX-FORMAT
    description: XML-tagged git context (~100-200 chars) injected per user message
    outcome: Compact format matching existing patterns (working_directory, session_state)
metrics:
  duration: 3m 47s
  completed: 2026-02-03
---

# Phase 6 Plan 01: Git Context Injection Summary

Git context (branch name, PR info) injected into every agent user message via XML-tagged `<git_context>` block, fetched fresh before each `agent.chat()` call using the session's working directory.

## What Was Built

### formatGitContext function (system.ts)
- Accepts `GitState` and `PrInfo` (both optional/nullable)
- Returns empty string for non-git directories (graceful absence)
- Produces compact XML: `<git_context>\nCurrent branch: ...\nPR #N: title (STATE)\n</git_context>`
- Handles detached HEAD, draft PRs, all PR states (OPEN/CLOSED/MERGED)
- Stays under 300 characters with PR info

### CraftAgent integration (craft-agent.ts)
- `gitContext` private property caches formatted context string
- `updateGitContext(gitState, prInfo)` public method called by SessionManager
- Both `buildTextPrompt()` and `buildSDKUserMessage()` inject git context after working directory context
- Context placed between working directory and file attachments in message structure

### SessionManager wiring (sessions.ts)
- Imports `getGitStatus` and `getPrStatus` from `@craft-agent/shared/git`
- Fetches git state + PR info in parallel via `Promise.all` before each `agent.chat()` call
- Uses `managed.workingDirectory` for workspace-specific context
- Refreshes git context on `updateWorkingDirectory()` calls
- All git fetching wrapped in try/catch as non-fatal (agent works without git context)

### Debug tooling (print-system-prompt.ts)
- Git context added as component 6 in user message breakdown
- Example output with branch + PR shown
- Summary section updated with 9 dynamic user message components

## Verification Results

- `bun run typecheck:all` -- passes (all 4 packages)
- `bun test packages/shared/src/prompts/__tests__/git-context.test.ts` -- 10/10 tests pass
- `bun run print:system-prompt` -- shows git context section
- Grep confirms wiring across all files

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 928dfb5 | formatGitContext + CraftAgent gitContext property and injection |
| 2 | 665de8d | SessionManager git fetch wiring + print-system-prompt update |
| 3 | 6e35fa4 | Unit tests for formatGitContext (10 test cases) |

## Requirements Coverage

| Requirement | Status | How |
|-------------|--------|-----|
| CTX-01: Agent references git branch | Met | `formatGitContext` formats branch name, injected per-message |
| CTX-02: Agent references PR info | Met | `formatGitContext` includes PR number/title/state/draft |

## Next Phase Readiness

Phase 7 (Polish and Edge Cases) can proceed. The git context injection is complete and workspace-specific. No blockers.
