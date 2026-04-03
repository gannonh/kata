# M002B: Foundation Gaps — UAT Report

**Date:** 2026-04-03
**Milestone:** M002B Foundation Gaps
**Method:** agent-browser --cdp 9333 connected to Electron
**Environment:** Dev mode, apps/desktop, openai-codex/gpt-5.4 model

---

## Summary

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Session history loads on app startup | ✅ PASS | [01-startup-session-history.png](01-startup-session-history.png) |
| 2 | Clicking a session in the sidebar loads its chat history | ✅ PASS | [02-session-switched.png](02-session-switched.png), [03-session-switch-roundtrip.png](03-session-switch-roundtrip.png) |
| 3 | `kata_create_slice` detected and Slice View rendered | ✅ PASS | [05-slice-view-detected.png](05-slice-view-detected.png) |
| 4 | `kata_create_task` updates parent slice task list | ⚠️ NOT TESTED | Linear API usage limit hit during slice creation; could not create tasks to test |
| 5 | Proactive artifact loading from Linear on startup | ✅ PASS (after fix) | [04-proactive-loading-all-tabs.png](04-proactive-loading-all-tabs.png) |
| 6 | Planning pane persists across app restart | ✅ PASS | [06-restart-persistence.png](06-restart-persistence.png) |
| 7 | Session history persists across app restart | ✅ PASS | [06-restart-persistence.png](06-restart-persistence.png) |

---

## Detailed Observations

### ✅ Passing

#### 1. Session History on Startup (Criterion 1)
On fresh app launch, the most recent session's full conversation loaded automatically — user messages, assistant responses with thinking blocks (collapsible "Thought for N words" buttons), rendered markdown (bold, inline code, lists, tables, links), and tool call cards. The session sidebar showed 25 sessions with titles, model labels, providers, timestamps, and message counts.

#### 2. Session Switching (Criterion 2)
Clicking different sessions in the sidebar loaded their respective chat histories. Tested round-trip: Session A → Session B → Session C. Each switch cleared the previous session's messages and loaded the target session's full history. Content rendered correctly with markdown formatting, thinking blocks, and tool cards. The bridge respawned on each switch (visible via "Streaming response..." status).

**Issue found:** After loading a historical session, the chat input was stuck in disabled/"streaming" state. The session history hydration left `isStreamingAtom` set to `true` because the JSONL events didn't include a terminal event. Had to click "New Session" to get an interactive input. This is a real bug — see Known Issues.

#### 3. Slice Detection and Slice View (Criterion 3)
When `kata_create_slice` completed, the planning pane detected it and created a new tab "[S99] UAT Test Slice". The Slice View rendered with:
- Slice ID and title header ("S99 UAT Test Slice")
- DESCRIPTION section with the slice description text
- TASK CHECKLIST section showing "No tasks created yet." with "0 tasks" count

The first `kata_create_slice` attempt failed with a GraphQL argument validation error. The agent retried after provisioning labels via `kata_ensure_labels`, but then hit a Linear API usage limit. The detection and rendering worked correctly for the tool calls that did complete.

#### 5. Proactive Artifact Loading (Criterion 5)
After fixing two bugs in `LinearDocumentClient.listByProject()`:
- `$projectRef: ID!` → `String!` (project slugs need String type)
- `orderBy: { updatedAt: DESC }` → `orderBy: updatedAt` (Linear enum syntax)

The proactive loader successfully fetched all 11 project-scoped documents from Linear on startup: 3 ROADMAPs, REQUIREMENTS, DECISIONS, and 6 CONTEXT documents. Tabs populated without any chat interaction.

#### 6 & 7. Restart Persistence (Criteria 6 & 7)
After killing and relaunching the app:
- Planning pane was open with the same tabs and active tab (Decisions) as before restart
- Session history loaded for the most recent session
- All 11 artifact tabs visible and populated
- No error banners

### ❌ Bugs Found During UAT

#### BUG-1: Proactive loader GraphQL type mismatch (FIXED)
`LinearDocumentClient.resolveProjectId()` declared `$projectRef: ID!` but project slugs require `String!`. Fixed during UAT in `src/main/linear-document-client.ts`.

#### BUG-2: Proactive loader orderBy syntax error (FIXED)
`orderBy: { updatedAt: DESC }` is invalid — Linear's PaginationOrderBy is an enum, not an object. Fixed to `orderBy: updatedAt`.

#### BUG-3: Session history hydration leaves chat in stuck "streaming" state
After switching to a historical session, the chat input remains disabled with the Stop button active. The JSONL replay sets `isStreamingAtom` to true but never resets it, because the session may not have ended with a clean `turn_end` or `agent_end` event. User must click "New Session" to get interactive input.

#### BUG-4: ask_user_questions fails in Ask permission mode
When the agent tries to use `ask_user_questions` (for tool confirmation in Ask mode), the result returns `Cannot read properties of undefined (reading 'answers')`. This is an extension UI handler issue — the confirmation dialog doesn't render or its response isn't captured correctly.

### ⚠️ Known Issues
- BUG-3 and BUG-4 are pre-existing issues not introduced by M002B, but they interact with the new session switching feature.
- `kata_create_task` detection could not be validated due to Linear API usage limits during testing.

---

## Test Environment
- **Platform:** macOS, Electron dev mode
- **Method:** agent-browser connected via CDP on port 9333
- **Auth:** Pre-configured providers (Anthropic, OpenAI)
- **Model:** openai-codex/gpt-5.4
- **Linear API:** Connected via auth.json, fetching real project documents
- **Project:** Kata Desktop (ffaf4986-8e29-4178-85b1-91a58a0c34b2)
- **Project slug:** b0f5a7be6537

## Fixes Applied During UAT
Two bugs in `src/main/linear-document-client.ts` were fixed during UAT:
1. Line ~350: `$projectRef: ID!` → `$projectRef: String!`
2. Line ~232: `orderBy: { updatedAt: DESC }` → `orderBy: updatedAt`

These fixes should be committed as part of the UAT branch.
