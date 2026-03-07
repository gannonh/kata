I'm in Explore mode so I can't write files directly. Here's the complete PRD - you can switch to **Ask to Edit** mode (Shift+Tab) and I'll save it, or copy it directly:

---

# PRD: Expandable Message Content

## Introduction

Replace the fixed 540px max-height constraint on message content with full-height expansion by default. This eliminates the frustrating nested scrolling experience where users must scroll within individual messages AND scroll the conversation. Users on high-resolution monitors will see full message content without artificial truncation, while a per-message collapse toggle provides control for exceptionally long responses.

## Goals

- Eliminate nested scroll contexts within the conversation view
- Better utilize screen real estate, especially on high-resolution (4K) displays
- Provide user control via a global preference setting
- Add per-message collapse/expand toggle for long content
- Maintain performance with very long messages (large code blocks, PRDs)

## User Stories

### US-001: Add message display preference to user preferences schema
**Description:** As a developer, I need to store the user's message display preference so it persists across sessions.

**Acceptance Criteria:**
- [ ] Add `messageDisplay?: { expandContent?: boolean }` to `UserPreferences` interface
- [ ] Default value is `true` (expanded)
- [ ] Preference persists in `preferences.json`
- [ ] Typecheck passes

### US-002: Remove max-height constraint when expanded mode enabled
**Description:** As a user, I want messages to display at full height so I can read content without scrolling inside message cards.

**Acceptance Criteria:**
- [ ] When `expandContent: true`, response container has no `maxHeight` style
- [ ] When `expandContent: true`, `overflow-y-auto` is removed from response container
- [ ] When `expandContent: false`, current 540px max-height behavior is preserved
- [ ] Fade mask only appears when content is collapsed and truncated
- [ ] Typecheck passes
- [ ] Verify in browser: long message displays fully without internal scroll

### US-003: Add per-message collapse toggle for long content
**Description:** As a user, I want to collapse exceptionally long messages so they don't dominate my conversation view.

**Acceptance Criteria:**
- [ ] Messages exceeding ~1500px natural height show a "Show less" button at bottom
- [ ] Clicking "Show less" collapses message to 540px with fade mask
- [ ] Collapsed message shows "Show more" button to re-expand
- [ ] Collapse state persists per-message within the session (not globally)
- [ ] Toggle is subtle, does not clutter the UI
- [ ] Typecheck passes
- [ ] Verify in browser: toggle works on a long PRD or code block response

### US-004: Add settings UI toggle for message display mode
**Description:** As a user, I want to control whether messages expand by default so I can choose my preferred reading experience.

**Acceptance Criteria:**
- [ ] Toggle appears in Settings panel → Display section
- [ ] Label: "Expand message content"
- [ ] Description: "Show full message content without scrolling within messages"
- [ ] Toggle state reflects current preference value
- [ ] Changing toggle immediately updates preference and re-renders messages
- [ ] Typecheck passes
- [ ] Verify in browser: toggle changes message display behavior

### US-005: Ensure smooth conversation scroll with expanded content
**Description:** As a user, I want the main conversation to scroll smoothly even when messages are fully expanded.

**Acceptance Criteria:**
- [ ] Conversation scroll performance is acceptable with 10+ expanded messages
- [ ] No jank when scrolling past very long messages (5000+ px)
- [ ] Virtual scrolling considerations documented if performance issues arise
- [ ] Tested on standard (1080p) and high-res (4K) viewports

## Functional Requirements

- FR-1: Add `messageDisplay.expandContent` boolean preference (default: `true`)
- FR-2: When `expandContent` is `true`, remove `maxHeight: 540px` from response card container
- FR-3: When `expandContent` is `true`, remove `overflow-y: auto` from response card container
- FR-4: When `expandContent` is `false`, preserve current 540px max-height behavior
- FR-5: Display fade mask only when content is collapsed AND exceeds container height
- FR-6: For messages with natural height > 1500px, show collapse/expand toggle button
- FR-7: Per-message collapse state stored in session state (not persisted across sessions)
- FR-8: Settings UI provides toggle to control `expandContent` preference
- FR-9: Activity lists remain collapsed (14-item limit) regardless of `expandContent` setting

## Non-Goals

- No auto-collapse based on viewport size or message count
- No virtual scrolling implementation (out of scope unless performance requires it)
- No expansion of activity lists (tool calls, thinking steps) - these stay collapsed
- No per-message expansion memory across sessions
- No animation/transition effects for collapse/expand (keep it instant)

## Design Considerations

- **Toggle button placement:** Bottom-right of message card, subtle styling (text button, not prominent)
- **Collapse threshold:** 1500px chosen to balance utility vs. clutter (most messages won't show toggle)
- **Fade mask:** Existing gradient fade at bottom of truncated content; remove when fully expanded
- **Settings location:** Display section, grouped with other visual preferences

## Technical Considerations

### Files to Modify

| File                                              | Change                                      |
| ------------------------------------------------- | ------------------------------------------- |
| `packages/shared/src/config/preferences.ts`       | Add `messageDisplay` preference type        |
| `packages/ui/src/components/chat/TurnCard.tsx`    | Conditional max-height, add collapse toggle |
| `packages/core/src/renderer/components/Settings/` | Add toggle for message display mode         |

### Implementation Notes

- `TurnCard.tsx:1182` currently sets `MAX_HEIGHT = 540`
- Response container uses `overflow-y-auto` with the max-height
- Per-message collapse state: use React state within TurnCard, keyed by message ID
- Preference read via existing preference hooks/context

### Performance Considerations

- Very long messages (10,000+ lines of code) may cause layout recalculation delays
- Monitor for jank with many expanded messages; document if virtual scrolling needed later
- Lazy rendering of collapsed content is NOT needed (content already rendered, just hidden)

## Success Metrics

- Users can read full message content without nested scrolling
- Scroll performance remains smooth with 10+ messages visible
- Per-message collapse toggle used for <10% of messages (most content fits comfortably)
- No increase in support requests about message readability

## Open Questions

- Should the collapse threshold (1500px) be configurable, or is a fixed value sufficient?
- Should "Show less" button appear on hover only, or always visible for long messages?
- If virtual scrolling becomes necessary, should it be a separate follow-up project?

---

**Switch to Ask to Edit mode** (Shift+Tab) and I'll save this to `tasks/prd-expandable-message-content.md`.