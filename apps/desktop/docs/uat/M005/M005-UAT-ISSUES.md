# M005 UAT Issues

 M005 UAT Results

 12 of 13 criteria PASS, 1 PARTIAL

 ┌─────────────────┬────────────────────────────────────────────────────────────────────────────┬────────┐
 │ Slice           │ What was verified                                                          │ Status │
 ├─────────────────┼────────────────────────────────────────────────────────────────────────────┼────────┤
 │ S01 Kanban      │ Board scopes (Active/Project/Milestone), column collapse, "Open Linear     │ ✅     │
 │ Interaction     │ issue" deep links, task expansion, Symphony status banners                 │        │
 ├─────────────────┼────────────────────────────────────────────────────────────────────────────┼────────┤
 │ S02 Linear      │ Card status dropdown for column moves, "Add task" dialog with              │ ✅     │
 │ Read-Write      │ Title/Description, live Linear data with identifiers                       │        │
 ├─────────────────┼────────────────────────────────────────────────────────────────────────────┼────────┤
 │ S03 MCP         │ Settings → MCP tab showing servers from mcp.json, full server editor       │ ✅     │
 │ Management      │ dialog (name/transport/command/args/cwd/env),                              │        │
 │                 │ Refresh/Reconnect/Edit/Remove actions, "Add server"                        │        │
 ├─────────────────┼────────────────────────────────────────────────────────────────────────────┼────────┤
 │ S04 Integration │ All surfaces work together in one Electron session, keyboard shortcuts     │ ✅     │
 │                 │ displayed, board header shows rich context status                          │        │
 └─────────────────┴────────────────────────────────────────────────────────────────────────────┴────────┘

 The one PARTIAL is the session isolation fix (cold-start fallback shows all sessions as designed — the
 filtering kicks in once the bridge captures its first session ID).

 Manual Verification Steps

### Launch the app

 ```bash
   cd apps/desktop
   bun run desktop:dev
 ```

### What to verify

 1. Kanban board — Switch between Active/Project/Milestone scopes. Collapse columns. Click "Open Linear
 issue" on a card to verify it opens the right URL.
 2. Task expansion — Click "Show tasks" on a card. Check the task list and status dropdown.
 3. Add task — Click "Add task" on a card. Try creating a real task (it writes to Linear).
 4. MCP settings — Open Settings → MCP. Verify your configured servers appear. Click Edit on one and check
 the form. Try Add server.
 5. Session sidebar — Click "+ New Session". Verify it creates a clean session and doesn't jump to a
 random session.

Issues found during manual acceptance testing.

---

## 1. Active scope shows stale data when Symphony is not running

**Severity:** Medium
**Slice:** S01

When the app launches and Symphony is not running (the most common case — quitting Desktop also kills the integrated Symphony instance), the "Active" scope shows partial/stale project data instead of an accurate empty or disconnected state. Once Symphony is started and the server is polled, Active reports accurately.

**Expected:** Active scope should clearly indicate that Symphony is disconnected and show either no data or clearly-stale data with a visual indicator.

**Evidence:** [screenshot-01](../../../../../../var/folders/d7/p8j2hgrd7b7c89fxsxlbwptm0000gn/T/pi-clipboard-47ef0c01-0df5-4584-9c5e-7ccb909b8089.png)

---

## 2. "Symphony runtime unavailable" warning appears twice

**Severity:** Low
**Slice:** S01

Two identical "Symphony runtime unavailable." yellow warning banners are rendered stacked on top of each other in the board area. Should be deduplicated to one.

**Evidence:** Visible in issue 1 screenshot — two yellow banners.

---

## 3. "Return to auto mode" link color is hard to read

**Severity:** Low
**Slice:** S01

The "Return to auto mode" link text uses a color that has poor contrast against the dark board background. Difficult to read.

**Expected:** Link should use a higher-contrast color that's readable on the dark background.

---

## 4. Symphony warnings persist after start until next poll

**Severity:** Medium
**Slice:** S01 / S04

After Symphony is started from the app, the "Symphony runtime unavailable" warnings continue to appear for several seconds until the next automatic server poll completes. This creates a confusing state where the header shows "Symphony: Ready" but the board still shows warning banners.

**Expected:** Starting Symphony should trigger an immediate board refresh/poll, or the warnings should clear as soon as the runtime status transitions to Ready.

---

## 5. Empty columns should be collapsed by default

**Severity:** Medium
**Slice:** S01

Columns with no cards (e.g., Todo, In Progress, Agent Review, Human Review, Merging) are fully expanded showing "No slices", taking up horizontal space. Empty columns should auto-collapse to give more room to columns with content.

**Expected:** Columns with 0 cards should be collapsed by default. Users can expand them manually if needed.

---

## 6. Ticket identifiers should link to Linear

**Severity:** Medium
**Slice:** S01 / S02

Ticket numbers displayed on cards (e.g., "KAT-2326") are plain text. They should be clickable links that open the corresponding Linear issue in the browser, the same as the "Open Linear issue" button but more discoverable.

**Expected:** The `KAT-NNNN` identifier text on each card should be a clickable link to `https://linear.app/kata-sh/issue/KAT-NNNN`.

---

## 7. ~~Inconsistent card rendering between Project and Milestone views~~ (superseded by #10)

**Severity:** ~~High~~ N/A
**Slice:** S01

**Project view** shows cards collapsed to just the title (e.g., "KAT-2085 · [S01] App Shell with CLI Subprocess Chat"). **Milestone view** shows cards fully expanded with status, Symphony execution info, "Open Linear issue" / "Add task" buttons, "Current: Done" dropdown, and "Show tasks" toggle.

Cards should render the same regardless of scope mode. Additionally, each card should have a chevron to toggle between collapsed (title-only, like current Project view) and expanded (full detail, like current Milestone view).

**Expected:**

- Cards render identically in both Project and Milestone views
- Each card has a collapse/expand chevron
- Default state can be scope-dependent (e.g., collapsed in Project for density, expanded in Milestone for detail) but user can toggle either way

**Evidence:** Project view — cards are title-only. Milestone view — cards are fully expanded with all controls.

---

## 8. Use shadcn Spinner component for kanban loading states

**Severity:** Low
**Slice:** S01

Kanban board loading states (board refresh, scope switch, Symphony poll) should use a shadcn `Spinner` component for visual consistency with the rest of the UI rather than custom or missing loading indicators.

---

## 9. Surface Symphony controls near the status indicator

**Severity:** Medium
**Slice:** S04

The "Symphony: Idle" status indicator in the top nav bar is informational only. Users must navigate to Settings → Symphony to start/stop/restart Symphony. The controls should be accessible directly from the main surface — e.g., clicking the status indicator could open a popover with Start/Stop/Restart buttons, or the indicator itself could be a dropdown.

Currently starting Symphony requires: click Settings → click Symphony tab → click Start. This should be one or two clicks from the main surface since it's a frequent operation during active work.

**Expected:** Clicking the "Symphony: Idle" badge (or a control near it) should expose Start/Stop/Restart without leaving the current view.

---

## 10. Card height should not be dynamic based on viewport — use expand/collapse chevron

**Severity:** High
**Slice:** S01 / S07

Currently, card height changes dynamically based on the available viewport height. When the window is tall, cards show full detail (status, Symphony info, action buttons, task toggle). When the window is short, cards compress to just title + status badge, losing the action surface entirely.

This is unpredictable and means the user loses controls based on window size. Instead, each card should have an explicit expand/collapse chevron:

- **Collapsed:** 2 lines max — ticket identifier + title (e.g., "KAT-2362 · [S01] Kanban Interaction Closure")
- **Expanded (default):** Full card with status, Symphony execution info, action buttons (Open Linear issue, Add task), status dropdown, Show tasks toggle

The user toggles each card independently. Include an "Expand all / Collapse all" action in the board header (similar to the existing column expand/collapse). Collapse state could optionally persist per session.

---
