---
name: kata-researching-phases
description: Use this skill when researching a phase domain, investigating technical approaches, exploring phase scope with the user, gathering implementation context, or listing assumptions before planning. Triggers include "research phase", "investigate", "explore", "discuss phase", "scope discussion", "assumptions", "technical research", "domain research", "gather context", and "what do you think about phase".
user-invocable: false
---

# Phase Research Orchestrator

Handles research, discussion, and assumption analysis for Kata phases before planning.

## When to Use

- User asks to "research phase N" or "investigate how to build phase N"
- User wants to "discuss phase N" or explore scope before planning
- User asks about "assumptions for phase N" or "what do you think about phase N"
- User needs help gathering implementation context

## Workflow Overview

Three operations available:

1. **Research** - Technical investigation producing RESEARCH.md
2. **Discuss** - Interactive scope exploration producing CONTEXT.md
3. **Assumptions** - Surface Claude's assumptions for user validation (conversational only)

## Detecting Operation

Parse user intent:

| User Says                                             | Operation   |
| ----------------------------------------------------- | ----------- |
| "research phase", "investigate", "technical research" | Research    |
| "discuss phase", "explore scope", "gather context"    | Discuss     |
| "assumptions", "what do you think", "before planning" | Assumptions |

## Execution Flow: Research

### Step 1: Validate Phase

```bash
# Normalize phase number (8 -> 08, preserve decimals like 2.1 -> 02.1)
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi

grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found, error and list available phases.

### Step 2: Check Existing Research

```bash
ls .planning/phases/${PHASE}-*/*-RESEARCH.md 2>/dev/null
```

If exists, offer options:
1. Update research - Re-investigate with fresh sources
2. View existing - Show current research
3. Skip - Use existing as-is

### Step 3: Determine Discovery Level

Based on phase characteristics, determine research depth. See `./references/discovery-levels.md` for guidance.

| Level | Time      | When to Use                                  |
| ----- | --------- | -------------------------------------------- |
| 0     | Skip      | Pure internal work, no external dependencies |
| 1     | 2-5 min   | Quick verification of known patterns         |
| 2     | 15-30 min | Standard research for unfamiliar domains     |
| 3     | 1+ hour   | Deep dive for complex/novel domains          |

### Step 4: Gather Phase Context

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
grep -A20 "Phase ${PHASE}:" .planning/ROADMAP.md
cat .planning/REQUIREMENTS.md 2>/dev/null
cat ${PHASE_DIR}/*-CONTEXT.md 2>/dev/null
grep -A30 "### Decisions Made" .planning/STATE.md 2>/dev/null
```

### Step 5: Spawn Researcher

Display stage banner:
```
KATA > RESEARCHING PHASE {X}
Spawning researcher...
```

Spawn kata-phase-researcher:

```
Task(
  prompt=research_prompt,
  subagent_type="kata-phase-researcher",
  description="Research Phase {phase}"
)
```

Research prompt template:
```markdown
<research_type>
Phase Research - investigating HOW to implement a specific phase well.
</research_type>

<key_insight>
The question is NOT "which library should I use?"

The question is: "What do I not know that I don't know?"

For this phase, discover:
- What's the established architecture pattern?
- What libraries form the standard stack?
- What problems do people commonly hit?
- What's SOTA vs what Claude's training thinks is SOTA?
- What should NOT be hand-rolled?
</key_insight>

<objective>
Research implementation approach for Phase {phase_number}: {phase_name}
</objective>

<context>
**Phase description:** {phase_description}
**Requirements:** {requirements_list}
**Prior decisions:** {decisions_if_any}
**Phase context:** {context_md_content}
</context>

<downstream_consumer>
Your RESEARCH.md will be loaded by planner which uses specific sections:
- `## Standard Stack` -> Plans use these libraries
- `## Architecture Patterns` -> Task structure follows these
- `## Don't Hand-Roll` -> Tasks NEVER build custom for listed problems
- `## Common Pitfalls` -> Verification steps check for these
- `## Code Examples` -> Task actions reference these patterns

Be prescriptive, not exploratory. "Use X" not "Consider X or Y."
</downstream_consumer>

<output>
Write to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

### Step 6: Handle Researcher Return

**RESEARCH COMPLETE:** Display summary, offer next steps:
- Plan phase - proceed to planning
- Dig deeper - spawn continuation for specific area
- Review full - show complete RESEARCH.md
- Done - exit workflow

**CHECKPOINT REACHED:** Present to user, get response, spawn continuation.

**RESEARCH INCONCLUSIVE:** Show attempts, offer alternatives.

### Step 7: Spawn Synthesizer (if parallel research)

For new project research with multiple parallel researcher agents, spawn kata-researching-phases-synthesizer to consolidate findings:

```
Task(
  prompt=synthesis_prompt,
  subagent_type="kata-researching-phases-synthesizer",
  description="Synthesize research findings"
)
```

The synthesizer reads STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md and produces SUMMARY.md with roadmap implications.

## Execution Flow: Discuss

Interactive discussion to capture implementation decisions.

### Step 1: Validate Phase

Same as Research Step 1.

### Step 2: Check Existing Context

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
ls ${PHASE_DIR}/*-CONTEXT.md 2>/dev/null
```

If exists, offer: Update, View, or Skip.

### Step 3: Analyze Gray Areas

See `./references/discussion-protocol.md` for guidance.

Read phase description from ROADMAP.md and determine:

1. **Domain boundary** - What capability is this phase delivering?
2. **Gray areas** - Decisions user should weigh in on

Generate 3-4 phase-specific gray areas based on domain:
- Something users SEE -> layout, density, interactions, states
- Something users CALL -> responses, errors, auth, versioning
- Something users RUN -> output format, flags, modes, error handling
- Something users READ -> structure, tone, depth, flow
- Something being ORGANIZED -> criteria, grouping, naming, exceptions

### Step 4: Present Gray Areas

State the domain boundary first:
```
Phase [X]: [Name]
Domain: [What this phase delivers]

We'll clarify HOW to implement this.
(New capabilities belong in other phases.)
```

Present gray areas for multi-select - NO skip option. User ran this to discuss.

### Step 5: Deep-Dive Each Area

Philosophy: 4 questions per area, then check.

For each selected area:
1. Announce: "Let's talk about [Area]"
2. Ask 4 questions with concrete options
3. Check: "More questions about [area], or move to next?"
4. If more -> 4 more questions
5. If next -> proceed to next area

After all areas: "Ready to create context?"

### Step 6: Handle Scope Creep

If user suggests new capabilities:
```
"[Feature] sounds like a new capability - that belongs in its own phase.
I'll note it as a deferred idea.

Back to [current area]: [return to current question]"
```

Track deferred ideas for CONTEXT.md.

### Step 7: Create CONTEXT.md

Write to `{phase_dir}/{phase}-CONTEXT.md` with:
- Phase Boundary (domain anchor)
- Implementation Decisions (by category discussed)
- Claude's Discretion (areas user deferred)
- Specific Ideas (references, "like X" moments)
- Deferred Ideas (captured scope creep)

### Step 8: Commit and Present Next Steps

```bash
git add "${PHASE_DIR}/${PHASE}-CONTEXT.md"
git commit -m "docs(${PHASE}): capture phase context"
```

Offer:
- `/kata:plan-phase {phase}` - Plan with context
- `/kata:plan-phase {phase} --skip-research` - Plan without research

## Execution Flow: Assumptions

Conversational analysis - no file output.

### Step 1: Validate Phase

Same as Research Step 1.

### Step 2: Analyze Assumptions

Based on roadmap description and project context, identify assumptions across five areas:

**1. Technical Approach:** What libraries, frameworks, patterns would Claude use?
**2. Implementation Order:** What would Claude build first, second, third?
**3. Scope Boundaries:** What's included vs excluded in Claude's interpretation?
**4. Risk Areas:** Where does Claude expect complexity or challenges?
**5. Dependencies:** What does Claude assume exists or needs to be in place?

Mark confidence levels:
- "Fairly confident: ..." (clear from roadmap)
- "Assuming: ..." (reasonable inference)
- "Unclear: ..." (could go multiple ways)

### Step 3: Present Assumptions

```
## My Assumptions for Phase {X}: {Name}

### Technical Approach
[List assumptions about how to implement]

### Implementation Order
[List assumptions about sequencing]

### Scope Boundaries
**In scope:** [what's included]
**Out of scope:** [what's excluded]
**Ambiguous:** [what could go either way]

### Risk Areas
[List anticipated challenges]

### Dependencies
**From prior phases:** [what's needed]
**External:** [third-party needs]
**Feeds into:** [what future phases need from this]

---

**What do you think?**

Are these assumptions accurate? Let me know:
- What I got right
- What I got wrong
- What I'm missing
```

### Step 4: Gather Feedback

Acknowledge corrections:
```
Got it. Key corrections:
- [correction 1]
- [correction 2]

This changes my understanding significantly.
```

Or confirm: "Great, assumptions validated."

### Step 5: Offer Next Steps

```
What's next?
1. Discuss context (/kata:discuss-phase {phase})
2. Plan this phase (/kata:plan-phase {phase})
3. Re-examine assumptions
4. Done for now
```

## Key References

- **Discovery levels:** See `./references/discovery-levels.md` for research depth guidance
- **Research protocol:** See `./references/research-protocol.md` for RESEARCH.md structure
- **Discussion protocol:** See `./references/discussion-protocol.md` for CONTEXT.md guidance

## Sub-Agent Summary

| Agent                               | Purpose                       | When Spawned         |
| ----------------------------------- | ----------------------------- | -------------------- |
| kata-phase-researcher               | Research domain for phase     | Research operation   |
| kata-researching-phases-synthesizer | Consolidate parallel research | New project research |

## Quality Standards

Research must produce:
- [ ] Standard stack with versions
- [ ] Architecture patterns for this domain
- [ ] Don't-hand-roll items
- [ ] Common pitfalls
- [ ] Code examples from official sources
- [ ] Confidence levels on all findings

Discussion must capture:
- [ ] Phase boundary (scope anchor)
- [ ] Implementation decisions
- [ ] Claude's discretion areas
- [ ] Deferred ideas (scope creep)
