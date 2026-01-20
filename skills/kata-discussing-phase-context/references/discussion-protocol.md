# Discussion Protocol

Guidance for interactive phase scope exploration and CONTEXT.md creation.

## Philosophy

**User = founder/visionary. Claude = builder.**

The user knows:
- How they imagine it working
- What it should look/feel like
- What's essential vs nice-to-have
- Specific behaviors or references they have in mind

The user doesn't know (and shouldn't be asked):
- Codebase patterns (researcher reads the code)
- Technical risks (researcher identifies these)
- Implementation approach (planner figures this out)
- Success metrics (inferred from the work)

**Ask about vision and implementation choices. Capture decisions for downstream agents.**

## What to Ask About

Focus on decisions that affect the user experience or outcome:

- **Behavior choices** - How should this work when X happens?
- **Layout/presentation** - How should information be displayed?
- **Interaction patterns** - How should users interact with this?
- **Content priorities** - What's most important to show/do?
- **Edge case handling** - What happens in unusual situations?
- **User preferences** - Does user have specific approaches in mind?

## What NOT to Ask About

Claude handles these - don't burden the user:

- Technical implementation details
- Architecture patterns
- Performance optimization
- Library/framework choices
- Code organization
- Database schema design
- API design details

## Scope Guardrail

**CRITICAL: No scope creep.**

The phase boundary comes from ROADMAP.md and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

### Allowed (Clarifying Ambiguity)

- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)
- "How much information per item?" (density preference)

### Not Allowed (Scope Creep)

- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)
- "Could we add notifications?" (new capability)

### The Heuristic

Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

### Handling Scope Creep

When user suggests new capabilities:

```
"[Feature X] sounds like a new capability - that belongs in its own phase.
I'll note it as a deferred idea for the roadmap.

Back to [current area]: [return to current question]"
```

Capture the idea in "Deferred Ideas" section. Don't lose it, don't act on it.

## Gray Area Identification

Gray areas are **implementation decisions the user cares about** - things that could go multiple ways and would change the result.

### How to Identify Gray Areas

1. **Read the phase goal** from ROADMAP.md
2. **Understand the domain** - What kind of thing is being built?
3. **Generate phase-specific gray areas** - Not generic categories, but concrete decisions for THIS phase

### Domain-Specific Gray Areas

| Domain Type | Example Gray Areas |
| ----------- | ------------------ |
| Something users SEE | Layout style, information density, visual hierarchy, empty states, loading states, responsive behavior |
| Something users CALL | Response format, error messages, authentication handling, rate limiting behavior, versioning approach |
| Something users RUN | Output format, flag design, verbosity levels, progress reporting, error recovery |
| Something users READ | Content structure, navigation style, code example depth, tone and voice |
| Something being ORGANIZED | Grouping criteria, naming conventions, duplicate handling, exception cases |

### Don't Use Generic Categories

**Bad:** "UI", "UX", "Behavior", "Data"

**Good:** Phase-specific gray areas:

```
Phase: "User authentication"
-> Session handling, Error responses, Multi-device policy, Recovery flow

Phase: "Organize photo library"
-> Grouping criteria, Duplicate handling, Naming convention, Folder structure

Phase: "CLI for database backups"
-> Output format, Flag design, Progress reporting, Error recovery

Phase: "API documentation"
-> Structure/navigation, Code examples depth, Versioning approach, Interactive elements
```

### The Key Question

What decisions would change the outcome that the user should weigh in on?

## Question Design

### Make Questions Concrete

**Bad (abstract):**
- "What do you want the layout to be like?"
- "How should errors work?"

**Good (concrete options):**
- "For the post feed: cards with images, compact list, or timeline view?"
- "On API errors: show technical details, friendly messages, or let user choose verbosity?"

### Question Flow

Each answer should inform the next question:

```
Q1: "Cards, list, or timeline for posts?" -> A: "Cards"
Q2: "Full image cards or thumbnail previews?" -> A: "Full images"
Q3: "How many posts visible before scrolling? 2-3 large or 5-6 medium?" -> A: "5-6 medium"
Q4: "Show author avatar on each card, or just name?" -> A: "Avatar and name"
```

### Include Escape Hatches

- Always include "You decide" or "Claude's discretion" as an option when reasonable
- If user picks "Other", receive their input, reflect it back, confirm understanding

## Deep-Dive Flow

### 4-Question Rhythm

For each selected gray area:

1. **Announce the area:** "Let's talk about [Area]."

2. **Ask 4 questions:**
   - Start broad, get more specific
   - Use concrete options (not abstract)
   - Each answer informs the next question

3. **After 4 questions, check:**
   ```
   "More questions about [area], or move to next?"
   ```
   - If "More" -> ask 4 more, then check again
   - If "Next" -> proceed to next area

4. **After all areas:**
   ```
   "That covers [list areas]. Ready to create context?"
   ```
   Options: "Create context" / "Revisit an area"

### When to Stop

- User says "that's enough" or "move on"
- Questions becoming repetitive
- Area feels fully explored
- User defers remaining decisions to Claude

## Example Discussions

### Visual Feature (Post Feed)

Gray areas to present:
1. Layout style - Cards vs list vs timeline? Information density?
2. Loading behavior - Infinite scroll or pagination? Pull to refresh?
3. Content ordering - Chronological, algorithmic, or user choice?
4. Post metadata - What info per post? Timestamps, reactions, author?

Sample deep-dive for "Layout style":
```
Let's talk about Layout style.

Q1: For the post feed, which layout approach?
    - Cards (image + content blocks)
    - Compact list (text-focused rows)
    - Timeline (content in flowing stream)
    - You decide

Q2: [If cards] How much info per card?
    - Dense (title, author, preview, timestamp, reactions)
    - Minimal (title, author, timestamp)
    - Medium (title, author, preview text)

Q3: Should cards have fixed height or variable?
    - Fixed (uniform grid)
    - Variable (masonry style)
    - You decide based on content

Q4: What about images in posts?
    - Full-width images
    - Thumbnail on side
    - No images in feed (detail view only)

More questions about layout, or move to next?
```

### Command-Line Tool (Database Backup CLI)

Gray areas to present:
1. Output format - JSON, table, or plain text? Verbosity levels?
2. Flag design - Short flags, long flags, or both? Required vs optional?
3. Progress reporting - Silent, progress bar, or verbose logging?
4. Error recovery - Fail fast, retry, or prompt for action?

### Organization Task (Photo Library)

Gray areas to present:
1. Grouping criteria - By date, location, faces, or events?
2. Duplicate handling - Keep best, keep all, or prompt each time?
3. Naming convention - Original names, dates, or descriptive?
4. Folder structure - Flat, nested by year, or by category?

## Success Criteria

Discussion is complete when:

- [ ] Phase validated against roadmap
- [ ] Gray areas identified through intelligent analysis (not generic)
- [ ] User selected which areas to discuss
- [ ] Each selected area explored until user satisfied (4 questions + check pattern)
- [ ] Scope creep redirected to deferred ideas (not lost, not acted on)
- [ ] CONTEXT.md captures actual decisions, not vague vision
- [ ] Claude's discretion areas noted where user deferred
- [ ] Deferred ideas preserved for future phases
- [ ] User knows next steps (research or plan)
