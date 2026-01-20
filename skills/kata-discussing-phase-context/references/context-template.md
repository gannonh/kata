# Context Template

Template for `{phase}-CONTEXT.md` - phase implementation decisions captured through discussion.

## Purpose

CONTEXT.md captures user decisions that downstream agents need:

1. **kata-phase-researcher** - Reads to know WHAT to research
   - "User wants card-based layout" -> researcher investigates card component patterns
   - "Infinite scroll decided" -> researcher looks into virtualization libraries

2. **kata-planner** - Reads to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" -> planner includes that in task specs
   - "Claude's Discretion: loading skeleton" -> planner can decide approach

**Goal:** Decisions clear enough that downstream agents can act without asking the user again.

## File Structure

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers - the scope anchor]

This phase does NOT include:
- [Explicitly out-of-scope items]
- [Things that belong in other phases]

</domain>

<decisions>
## Implementation Decisions

### [Category 1 - e.g., Layout]
- [Concrete decision]
- [Another decision if applicable]
- [Reasoning or "like X" reference if given]

### [Category 2 - e.g., Interactions]
- [Concrete decision]
- [Another decision]

### [Additional categories as discussed...]

### Claude's Discretion
[Areas where user explicitly said "you decide" or deferred to Claude]

- [Area 1]: Claude may choose approach
- [Area 2]: Any standard solution acceptable

</decisions>

<specifics>
## Specific Ideas

[Particular references, examples, or "I want it like X" moments from discussion]

Examples:
- "Like GitHub's PR list - dense but scannable"
- "Similar to Notion's card view"
- "Reference: https://example.com/design"

[If none: "No specific references - open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up but belong in other phases - captured scope creep]

These are NOT in scope for this phase but should be considered for future phases:

- **[Idea 1]**: [Brief description, which phase it might belong to]
- **[Idea 2]**: [Brief description]

[If none: "None - discussion stayed within phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date]*
```

## Section Guidance

### Phase Boundary (domain)

This is the **scope anchor**. Everything else must fit within this boundary.

**Good boundary statement:**
```
This phase delivers a post feed view where users can browse and interact with posts.
Posts can be liked, and clicking a post shows full detail.

This phase does NOT include:
- Comment functionality (Phase 4)
- Search or filtering (Phase 5)
- Creating new posts (Phase 3)
```

**Bad boundary statement:**
```
This phase is about the feed.
```

### Implementation Decisions (decisions)

Organized by the categories discussed. Each decision should be:

- **Concrete** - Not vague preferences
- **Actionable** - Planner can derive task requirements
- **Clear** - No ambiguity about what was decided

**Good decisions:**
```
### Layout
- Card-based layout with full-width images
- 5-6 posts visible before scrolling (medium density)
- Author avatar and name on each card
- Variable height cards (masonry style)
```

**Bad decisions:**
```
### Layout
- User wants it to look nice
- Should be clean and modern
```

### Claude's Discretion

Explicitly marks areas where the user deferred decisions:

```
### Claude's Discretion
- Loading skeleton design: Any standard approach
- Animation timing: Whatever feels natural
- Empty state illustration: Can use placeholder or skip
```

This tells the planner they can make choices here without checking with the user.

### Specific Ideas (specifics)

References, examples, and "like X" moments:

```
## Specific Ideas

- "Feed should feel like Instagram's main feed - visual-first, quick to scan"
- "Interaction feedback like iOS haptics - responsive but not heavy"
- Reference design: https://dribbble.com/shots/example
```

These are anchors for the researcher and planner to match user's vision.

### Deferred Ideas (deferred)

Captured scope creep - NOT lost, NOT acted on:

```
## Deferred Ideas

These are NOT in scope for this phase but should be considered for future phases:

- **Comment threading**: User wants nested replies (likely Phase 4 or new phase)
- **Bookmarking**: Save posts for later (could be quick add to Phase 3)
- **Post reactions beyond like**: Emoji reactions (evaluate in Phase 4)
```

This prevents good ideas from being lost while keeping the current phase focused.

## Example: Complete CONTEXT.md

```markdown
# Phase 2: Post Feed - Context

**Gathered:** 2026-01-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a scrolling post feed where users can browse posts and interact with them.
Basic interactions include liking posts and tapping to view full detail.

This phase does NOT include:
- Creating new posts (Phase 3)
- Comments or replies (Phase 4)
- Search, filtering, or sorting (Phase 5)
- User profiles beyond author name/avatar (Phase 6)

</domain>

<decisions>
## Implementation Decisions

### Layout
- Card-based layout with images as focal point
- Medium density: 5-6 posts visible before scrolling
- Variable height cards adapting to content
- Author avatar + name at top of each card
- Timestamp in relative format ("2h ago")

### Loading Behavior
- Infinite scroll (no pagination)
- Pull-to-refresh on mobile
- Skeleton loading states while fetching

### Content Ordering
- Reverse chronological (newest first)
- No algorithmic sorting in MVP

### Interactions
- Like button with immediate feedback
- Tap card to open full detail view
- Double-tap to like (Instagram-style)

### Claude's Discretion
- Skeleton design: Any standard approach
- Animation curves: Whatever feels natural
- Error state design: Standard retry pattern

</decisions>

<specifics>
## Specific Ideas

- "Feed should feel like Instagram's main feed - visual-first, quick to scan"
- "Cards should have generous padding, not cramped"
- "Like heart should animate when tapped - subtle but satisfying"

</specifics>

<deferred>
## Deferred Ideas

These are NOT in scope for this phase:

- **Bookmark/save posts**: User wants this, add to Phase 3 or new phase
- **Share functionality**: Mentioned for future consideration
- **Multiple feed views**: User interested in grid vs list toggle eventually

</deferred>

---

*Phase: 02-post-feed*
*Context gathered: 2026-01-20*
```

## Usage Notes

1. **Match categories to discussion** - Only include categories that were actually discussed
2. **Be specific** - Vague decisions don't help downstream agents
3. **Preserve user language** - Use their words when capturing decisions
4. **Note uncertainty** - If something is still ambiguous, say so
5. **Link to specifics** - "Like X" references are valuable context
6. **Capture all deferred items** - Don't lose scope creep, just redirect it
