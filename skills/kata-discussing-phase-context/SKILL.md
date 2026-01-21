---
name: kata-discussing-phase-context
description: Use this skill when discussing a phase before planning, gathering implementation context, exploring how a phase should work, clarifying user preferences, or capturing decisions for downstream agents. Triggers include "discuss phase", "gather context", "phase discussion", "clarify implementation", "what should phase look like", "explore phase scope", "implementation decisions", "pre-planning discussion", "how should we build phase", "talk about phase", "phase context", "before we plan", "let's discuss", and "user preferences for phase".
user-invocable: false
---

# Phase Discussion Orchestrator

Gathers implementation decisions through adaptive questioning before planning, producing CONTEXT.md that informs downstream agents (researcher, planner).

## When to Use

- User asks to "discuss phase N" or "gather context for phase N"
- User wants to clarify implementation decisions before planning
- User asks "what should phase N look like" or "how should we build phase N"
- User needs help exploring scope decisions within a phase boundary
- Before planning when phase has ambiguous implementation choices

## Workflow Overview

Single operation: **Discuss**

```
1. Validate phase exists in roadmap
2. Check for existing CONTEXT.md (offer update/view/skip)
3. Analyze phase to identify domain-specific gray areas
4. Present gray areas for multi-select (no skip option)
5. Deep-dive each selected area (4 questions, then offer more/next)
6. Handle scope creep (redirect to deferred ideas)
7. Create CONTEXT.md with decisions
8. Commit and offer next steps
```

## Execution Flow

### Step 1: Validate Phase

Parse phase number from user request. Normalize to zero-padded format:

```bash
# 8 -> 08, preserve decimals like 2.1 -> 02.1
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi
```

Verify phase exists:

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found, list available phases for user.

### Step 2: Check Existing Context

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
ls ${PHASE_DIR}/*-CONTEXT.md 2>/dev/null
```

If CONTEXT.md exists, offer options via AskUserQuestion:
1. **Update context** - Start fresh discussion, replace existing
2. **View existing** - Show current CONTEXT.md
3. **Skip** - Use existing as-is, proceed to next step

### Step 3: Analyze Gray Areas

Read phase description from ROADMAP.md and determine:

1. **Domain boundary** - What capability is this phase delivering?
2. **Gray areas** - Decisions user should weigh in on (3-4 phase-specific areas)

**Domain-aware gray area generation.** See `./references/discussion-protocol.md` for full guidance.

| Domain Type | Gray Areas to Consider |
| ----------- | ---------------------- |
| Something users SEE | Layout, density, interactions, states |
| Something users CALL | Responses, errors, auth, versioning |
| Something users RUN | Output format, flags, modes, error handling |
| Something users READ | Structure, tone, depth, flow |
| Something being ORGANIZED | Criteria, grouping, naming, exceptions |

Generate 3-4 **phase-specific** gray areas, not generic categories like "UI" or "UX".

### Step 4: Present Gray Areas

State the domain boundary first:

```
Phase [X]: [Name]
Domain: [What this phase delivers]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)
```

Present gray areas for multi-select using AskUserQuestion.

**CRITICAL: No skip option.** User invoked this to discuss - give them real choices.

### Step 5: Deep-Dive Each Area

Philosophy: **4 questions per area, then check.**

For each selected area:

1. **Announce:** "Let's talk about [Area]."

2. **Ask 4 questions** with concrete options (not abstract). Use AskUserQuestion for each.
   - Each answer should inform the next question
   - Include "You decide" as an option when reasonable
   - If user picks "Other", receive their input, reflect it back, confirm

3. **After 4 questions, check:**
   - "More questions about [area], or move to next?"
   - If "More" -> ask 4 more, then check again
   - If "Next" -> proceed to next area

4. **After all areas:**
   - "That covers [list areas]. Ready to create context?"
   - Options: "Create context" / "Revisit an area"

### Step 6: Handle Scope Creep

**CRITICAL: Scope guardrail.**

The phase boundary from ROADMAP.md is FIXED. Discussion clarifies HOW to implement, not WHETHER to add more.

**When user suggests new capabilities:**

```
"[Feature X] sounds like a new capability - that belongs in its own phase.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas for CONTEXT.md - don't lose them, don't act on them.

**The heuristic:** Does this clarify how we implement what's already in the phase, or does it add a new capability that could be its own phase?

### Step 7: Create CONTEXT.md

Ensure phase directory exists:

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/${PHASE}-${PHASE_NAME}"
  PHASE_DIR=".planning/phases/${PHASE}-${PHASE_NAME}"
fi
```

Write CONTEXT.md using template from `./references/context-template.md`:

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

### Step 8: Commit and Present Next Steps

```bash
git add "${PHASE_DIR}/${PHASE}-CONTEXT.md"
git commit -m "docs(${PHASE}): capture phase context"
```

Output this markdown directly (not as a code block):

KATA > PHASE {X} CONTEXT CAPTURED

**Phase {X}: {Name}** - Context ready

**Decisions captured:**
- [Summary of key decisions by category]

**Claude's discretion:** [Areas user deferred]

**Deferred ideas:** [Count] captured for future phases

---

## Next Action

**Plan Phase {X}** - create execution plans with captured context

> Instructions can be given conversationally (recommended) or via /commands.

| Action | Natural Trigger | Explicit Command |
| ------ | --------------- | ---------------- |
| **Plan the phase** | "Plan phase {X}" | `/kata:phase-plan` |
| Research first | "Research phase {X}" | `/kata:phase-research` |
| View context | "Show context" | `cat {phase_dir}/{phase}-CONTEXT.md` |

<sub>/clear first -> fresh context window</sub>

---

## Key References

- **Discussion protocol:** See `./references/discussion-protocol.md` for gray area identification and questioning guidelines
- **Context template:** See `./references/context-template.md` for CONTEXT.md structure

## Downstream Consumers

CONTEXT.md is consumed by:

1. **kata-phase-researcher** - Reads to know WHAT to research
   - "User wants card-based layout" -> researcher investigates card component patterns
   - "Infinite scroll decided" -> researcher looks into virtualization libraries

2. **kata-planner** - Reads to know WHAT decisions are locked
   - "Pull-to-refresh on mobile" -> planner includes that in task specs
   - "Claude's Discretion: loading skeleton" -> planner can decide approach

**Goal:** Capture decisions clearly enough that downstream agents can act without asking the user again.

## Quality Standards

Discussion must produce:

- [ ] Phase validated against roadmap
- [ ] Gray areas identified through intelligent analysis (not generic)
- [ ] User selected which areas to discuss
- [ ] Each selected area explored until user satisfied
- [ ] Scope creep redirected to deferred ideas
- [ ] CONTEXT.md captures actual decisions, not vague vision
- [ ] Deferred ideas preserved for future phases
- [ ] User knows next steps
