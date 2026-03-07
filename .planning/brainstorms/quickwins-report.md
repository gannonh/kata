# Quick-Win Features: Consolidated Report

Four proposals survived debate between explorer and challenger. Total estimated effort: 1.5-2 days. Each builds on existing infrastructure with minimal new code.

---

## Recommended (Priority Order)

### 1. Copy Conversation as Markdown

**Effort:** 4-6 hours
**Risk:** Low

Export the full conversation to clipboard as formatted Markdown. Each turn gets a role header (`## User` / `## Assistant`), tool use sections wrap in `<details>` tags.

**Why it works:**
- `formatTurnAsMarkdown` and `formatActivityAsMarkdown` already exist in `packages/ui/src/components/chat/turn-utils.ts` (lines ~680, ~788)
- `groupMessagesByTurn` handles message-to-turn conversion
- Individual turn copy already exists via TurnCard context menu; this adds full-conversation export

**Implementation:**
- Add a "Copy as Markdown" icon button in the ChatDisplay header area (not SessionMenu -- this is a content action, not a session-management action)
- Iterate over grouped turns, concatenate formatted markdown, write to clipboard via `navigator.clipboard.writeText()`
- Truncate with warning toast if output exceeds 100KB

**Key files:**
- `packages/ui/src/components/chat/turn-utils.ts` -- existing format utilities
- `apps/electron/src/renderer/components/app-shell/ChatDisplay.tsx` -- add button
- `apps/electron/src/renderer/components/app-shell/PanelHeader.tsx` -- header placement

---

### 2. Session Cost Dashboard

**Effort:** 4-8 hours
**Risk:** Low

Display token usage and estimated USD cost in the right sidebar's SessionMetadataPanel.

**Why it works:**
- `tokenUsage` (inputTokens, outputTokens, totalTokens, costUsd, contextTokens) is already persisted in JSONL session headers (`packages/shared/src/sessions/jsonl.ts`, line 138)
- Data loads with session list without reading full messages (header-only read at line 78)
- SessionMetadataPanel currently shows Name, Notes, and Files -- adding a "Usage" section is a clean extension

**Implementation:**
- Add a "Usage" section to `SessionMetadataPanel` below Notes
- Display: input tokens, output tokens, total tokens, estimated cost (formatted as USD)
- Context window utilization bar: show only when `getModelContextWindow(modelId)` returns a value (Claude models). Omit bar for custom/third-party models; show raw token counts only.
- Model pricing: simple lookup object keyed by model ID, labeled "estimated" to account for drift

**Key files:**
- `apps/electron/src/renderer/components/right-sidebar/SessionMetadataPanel.tsx` -- add Usage section
- `apps/electron/src/renderer/atoms/sessions.ts` -- tokenUsage on SessionMeta (lines 58-64)
- `packages/shared/src/config/models.ts` -- `getModelContextWindow`, model definitions

---

### 3. Flagged Sessions Pinned to Top

**Effort:** 2-4 hours
**Risk:** Low

Display flagged sessions in a dedicated group at the top of the session list, above date-grouped chronological items.

**Why it works:**
- `isFlagged` already exists on SessionMeta with full persistence, UI (Flag icon, menu items, keyboard shortcut), and a dedicated "Flagged" sidebar filter
- No new data model or persistence changes required
- Solves the "important sessions scroll out of view" problem without introducing a competing Pin concept

**Implementation:**
- Modify `groupSessionsByDate` in `SessionList.tsx` to partition sessions into flagged and unflagged before date-grouping
- Render a "Flagged" section header above the date groups
- Flagged sessions appear in the Flagged section only (not duplicated in date groups below)
- When viewing the "Flagged" filter specifically, behavior is unchanged (all shown, no special grouping)

**Key files:**
- `apps/electron/src/renderer/components/app-shell/SessionList.tsx` -- grouping logic (~line 91), rendering (~line 1009)

**Design note:** This was originally proposed as a separate "Pin" feature. The challenger identified that Pin and Flag would be confusingly similar boolean markers. Using Flag for positional pinning eliminates the overlap and reuses all existing infrastructure.

---

### 4. Keyboard Shortcut: Quick Model Switch

**Effort:** 30 minutes
**Risk:** Minimal

Register `Cmd+Shift+M` (Mac) / `Ctrl+Shift+M` (Windows/Linux) to programmatically open the existing model selection dropdown in FreeFormInput.

**Why it works:**
- A model dropdown already exists in FreeFormInput (the `modelDropdownOpen` state at ~line 1436)
- Three models are already listed (Opus, Sonnet, Haiku) with descriptions and current selection highlighting
- The keyboard shortcuts registry in `KeyboardShortcutsDialog.tsx` provides the pattern for adding new shortcuts

**Implementation:**
- Add keyboard shortcut handler for Cmd+Shift+M
- Call `setModelDropdownOpen(true)` on the existing FreeFormInput dropdown
- Add entry to KeyboardShortcutsDialog's shortcuts list
- Use `Cmd+Shift+M` to avoid conflict with `Cmd+M` (macOS minimize window)

**Key files:**
- `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx` -- existing dropdown
- `apps/electron/src/renderer/components/KeyboardShortcutsDialog.tsx` -- shortcut registry

**Design note:** Originally proposed as a full command-palette-style overlay (4-6 hours). The challenger pointed out this would create a redundant second model switcher. Rescoped to wiring a keyboard shortcut to the existing dropdown.

---

## Deferred (Not Quick Wins)

### Session Templates
Pre-configured session setups (permission mode, sources, initial prompt). Requires new data type, CRUD, two new UI flows, and edge case handling (stale references to deleted sources/models). Estimated 3-5 days of real effort. Deferred to a dedicated feature cycle.

### Cross-Workspace Session Search
Search sessions across all workspaces. Requires loading session metadata from all workspace directories (I/O + memory concerns), and raises unresolved product questions (does clicking a cross-workspace result switch workspaces? open a new window?). Estimated 2-3 days including product decisions. Deferred.

### Inline Token Counter
Live token estimate in chat input. Dropped due to: (1) chars/4 heuristic is inaccurate by 2-3x for code and non-English text, (2) FreeFormInput is already crowded with model selector, thinking level, permissions badge, git status, sources, and attachments. Token awareness is better served by the Cost Dashboard (#2) in the right sidebar.

---

## Summary

| # | Feature | Effort | New Persistence | New IPC | Status |
|---|---------|--------|-----------------|---------|--------|
| 1 | Copy as Markdown | 4-6h | No | No | Recommended |
| 2 | Cost Dashboard | 4-8h | No | No | Recommended |
| 3 | Flagged to Top | 2-4h | No | No | Recommended |
| 4 | Model Shortcut | 30min | No | No | Recommended |

Total: ~11-19 hours of engineering work. All four features require zero backend changes, zero new IPC handlers, and zero persistence schema changes. They compose well: a user flags an important session (#3), sees its cost at a glance (#2), exports the conversation for documentation (#1), and switches models mid-session with a keystroke (#4).
