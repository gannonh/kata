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

Ask about vision and implementation choices. Capture decisions for downstream agents.

## Downstream Awareness

CONTEXT.md feeds into:

1. **kata-phase-researcher** - Reads CONTEXT.md to know WHAT to research
   - "User wants card-based layout" -> researcher investigates card component patterns
   - "Infinite scroll decided" -> researcher looks into virtualization libraries

2. **kata-planner** - Reads CONTEXT.md to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" -> planner includes that in task specs
   - "Claude's Discretion: loading skeleton" -> planner can decide approach

**Your job:** Capture decisions clearly enough that downstream agents can act on them without asking the user again.

## Scope Guardrail

**CRITICAL: No scope creep.**

The phase boundary comes from ROADMAP.md and is FIXED. Discussion clarifies HOW to implement what's scoped, never WHETHER to add new capabilities.

**Allowed (clarifying ambiguity):**
- "How should posts be displayed?" (layout, density, info shown)
- "What happens on empty state?" (within the feature)
- "Pull to refresh or manual?" (behavior choice)

**Not allowed (scope creep):**
- "Should we also add comments?" (new capability)
- "What about search/filtering?" (new capability)
- "Maybe include bookmarking?" (new capability)

**The heuristic:** Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

**When user suggests scope creep:**
```
"[Feature X] would be a new capability - that's its own phase.
Want me to note it for the roadmap backlog?

For now, let's focus on [phase domain]."
```

Capture the idea in a "Deferred Ideas" section. Don't lose it, don't act on it.

## Gray Area Identification

Gray areas are **implementation decisions the user cares about** - things that could go multiple ways and would change the result.

### How to Identify Gray Areas

1. **Read the phase goal** from ROADMAP.md
2. **Understand the domain** - What kind of thing is being built?
3. **Generate phase-specific gray areas** - Not generic categories, but concrete decisions for THIS phase

### Domain-Specific Gray Areas

| Domain | Gray Areas |
|--------|------------|
| Something users SEE | Layout, density, interactions, states |
| Something users CALL | Interface contracts, responses, errors |
| Something users RUN | Output format, flags, modes, error handling |
| Something users READ | Structure, tone, depth, flow |
| Something being ORGANIZED | Criteria, grouping, naming, exceptions |

### Don't Use Generic Categories

**Bad:** "UI", "UX", "Behavior"

**Good:** Phase-specific gray areas:

```
Phase: "User authentication"
-> Session handling, Error responses, Multi-device policy, Recovery flow

Phase: "Organize photo library"
-> Grouping criteria, Duplicate handling, Naming convention, Folder structure

Phase: "CLI for database backups"
-> Output format, Flag design, Progress reporting, Error recovery

Phase: "API documentation"
-> Structure/navigation, Code examples depth, Versioning approach
```

**The key question:** What decisions would change the outcome that the user should weigh in on?

### Claude Handles These (Don't Ask)

- Technical implementation details
- Architecture patterns
- Performance optimization
- Scope (roadmap defines this)

## Discussion Flow

### Present Gray Areas

First, state the boundary:
```
Phase [X]: [Name]
Domain: [What this phase delivers]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)
```

Then present 3-4 phase-specific gray areas for multi-select.

**Do NOT include a "skip" or "you decide" option at this stage.** User ran this command to discuss - give them real choices.

### Deep-Dive Each Area

Philosophy: **4 questions per area, then check.**

For each selected area:

1. **Announce the area:**
   ```
   Let's talk about [Area].
   ```

2. **Ask 4 questions:**
   - Use concrete options (not abstract)
   - Each answer should inform the next question
   - Include "You decide" as an option when reasonable

3. **After 4 questions, check:**
   - "More questions about [area], or move to next?"
   - If "More questions" -> ask 4 more, then check again
   - If "Next area" -> proceed

4. **After all areas:**
   - "That covers [list areas]. Ready to create context?"
   - "Create context" / "Revisit an area"

### Question Design

- Options should be concrete, not abstract ("Cards" not "Option A")
- Each answer should inform the next question
- If user picks "Other", receive their input, reflect it back, confirm

## CONTEXT.md Structure

Write to: `{phase_dir}/{phase}-CONTEXT.md`

```markdown
# Phase [X]: [Name] - Context

**Gathered:** [date]
**Status:** Ready for planning

<domain>
## Phase Boundary

[Clear statement of what this phase delivers - the scope anchor]

</domain>

<decisions>
## Implementation Decisions

### [Category 1 that was discussed]
- [Decision or preference captured]
- [Another decision if applicable]

### [Category 2 that was discussed]
- [Decision or preference captured]

### Claude's Discretion
[Areas where user said "you decide" - note that Claude has flexibility here]

</decisions>

<specifics>
## Specific Ideas

[Any particular references, examples, or "I want it like X" moments from discussion]

[If none: "No specific requirements - open to standard approaches"]

</specifics>

<deferred>
## Deferred Ideas

[Ideas that came up but belong in other phases. Don't lose them.]

[If none: "None - discussion stayed within phase scope"]

</deferred>

---

*Phase: XX-name*
*Context gathered: [date]*
```

## Domain Examples

### Visual Feature (Post Feed)

Gray areas to present:
- Layout style - Cards vs list vs timeline? Information density?
- Loading behavior - Infinite scroll or pagination? Pull to refresh?
- Content ordering - Chronological, algorithmic, or user choice?
- Post metadata - What info per post? Timestamps, reactions, author?

### Command-Line Tool (Database Backup CLI)

Gray areas to present:
- Output format - JSON, table, or plain text? Verbosity levels?
- Flag design - Short flags, long flags, or both? Required vs optional?
- Progress reporting - Silent, progress bar, or verbose logging?
- Error recovery - Fail fast, retry, or prompt for action?

### Organization Task (Photo Library)

Gray areas to present:
- Grouping criteria - By date, location, faces, or events?
- Duplicate handling - Keep best, keep all, or prompt each time?
- Naming convention - Original names, dates, or descriptive?
- Folder structure - Flat, nested by year, or by category?

### Documentation (API Docs)

Gray areas to present:
- Structure/navigation - Single page, sidebar nav, or versioned sections?
- Code examples depth - Minimal snippets or complete working examples?
- Versioning approach - Separate docs per version or diff annotations?
- Interactive elements - Try-it-now features or static only?

## Success Criteria

- Phase validated against roadmap
- Gray areas identified through intelligent analysis (not generic questions)
- User selected which areas to discuss
- Each selected area explored until user satisfied
- Scope creep redirected to deferred ideas
- CONTEXT.md captures actual decisions, not vague vision
- Deferred ideas preserved for future phases
- User knows next steps
