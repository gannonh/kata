# Milestone Creation Workflow

Complete workflow for creating new milestones through questioning, research, requirements, and roadmap creation.

## Overview

New milestone creation is the brownfield equivalent of new-project. The project exists, PROJECT.md has history. This workflow gathers "what's next" and takes you through the full cycle.

**Creates/Updates:**
- `.planning/PROJECT.md` — updated with new milestone goals
- `.planning/research/` — domain research (optional)
- `.planning/REQUIREMENTS.md` — scoped requirements
- `.planning/ROADMAP.md` — phase structure
- `.planning/STATE.md` — updated project memory

## Phase 1: Validate

**MANDATORY FIRST STEP — Execute before any user interaction:**

```bash
# Verify project exists
[ -f .planning/PROJECT.md ] || { echo "ERROR: No PROJECT.md"; exit 1; }

# Check for active milestone
[ -f .planning/ROADMAP.md ] && echo "ACTIVE_MILESTONE" || echo "READY_FOR_NEW"
```

**If ACTIVE_MILESTONE:**
- Ask: "A milestone is in progress. What would you like to do?"
- Options: "Complete current first" | "Continue anyway"

**Load previous milestone context:**
```bash
cat .planning/MILESTONES.md 2>/dev/null || echo "NO_MILESTONES"
cat .planning/STATE.md
```

## Phase 2: Present Context

Display what shipped:
```
Last milestone: v[X.Y] [Name] (shipped [DATE])

Key accomplishments:
- [From MILESTONES.md]

Validated requirements:
- [From PROJECT.md Validated section]

Pending todos:
- [From STATE.md if any]
```

## Phase 3: Deep Questioning

**Open the conversation:**

Ask inline (freeform, NOT structured): "What do you want to build next?"

Wait for response. This gives context for intelligent follow-up questions.

**Follow the thread:**

Based on response, ask follow-up questions. Use structured questions with options that probe what they mentioned.

Keep following threads. Each answer opens new threads. Ask about:
- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

**Questioning techniques:**
- Challenge vagueness
- Make abstract concrete
- Surface assumptions
- Find edges
- Reveal motivation

**Decision gate:**

When you could update PROJECT.md with clear goals:
- Ask: "I think I understand. Ready to update PROJECT.md?"
- Options: "Update PROJECT.md" | "Keep exploring"

Loop until "Update PROJECT.md" selected.

## Phase 4: Determine Version

Parse last version from MILESTONES.md and suggest next:

- "v[X.Y+0.1] (patch)" — Minor update
- "v[X+1].0 (major)" — Major release
- "Custom" — User specifies

## Phase 5: Update PROJECT.md

Update with new milestone section:

```markdown
## Current Milestone: v[X.Y] [Name]

**Goal:** [One sentence describing milestone focus]

**Target features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]
```

Update Active requirements section. Keep Validated section intact.

**Commit:**
```bash
git add .planning/PROJECT.md
git commit -m "docs: start milestone v[X.Y] [Name]"
```

## Phase 6: Research Decision

Ask: "Research the domain ecosystem before defining requirements?"
- "Research first (Recommended)" — Discover patterns, expected features
- "Skip research" — I know this domain well

**If research selected:**

Create research directory:
```bash
mkdir -p .planning/research
```

Spawn 4 parallel researchers:

```
Task(prompt="
Research [Stack/Features/Architecture/Pitfalls] for [domain].

<milestone_context>
Subsequent milestone (v[X.Y]).
Research what's needed to add [target features] to existing system.
</milestone_context>

<downstream_consumer>
Feeds into roadmap creation. Be prescriptive.
</downstream_consumer>

<output>
Write to: .planning/research/[DIMENSION].md
</output>
", subagent_type="kata-project-researcher")
```

After all 4 complete, spawn synthesizer:
```
Task(prompt="
Synthesize research outputs into SUMMARY.md.

Read:
- .planning/research/STACK.md
- .planning/research/FEATURES.md
- .planning/research/ARCHITECTURE.md
- .planning/research/PITFALLS.md

Write to: .planning/research/SUMMARY.md
", subagent_type="kata-researching-phases-synthesizer")
```

## Phase 7: Define Requirements

**Load context:**
- Core value from PROJECT.md
- New milestone goals
- Validated requirements (what already works)
- Stated constraints
- Feature categories from research (if exists)

**Present features by category:**
```
## [Category 1]
**Table stakes:**
- [Feature]

**Differentiators:**
- [Feature]
```

**If no research:** Gather requirements through conversation.

**Scope each category:**

For each category, ask (multiSelect):
- "[Feature 1]" — [brief description]
- "[Feature 2]" — [brief description]
- "None for this milestone" — Defer

Track responses:
- Selected → v1 requirements
- Unselected table stakes → v2
- Unselected differentiators → out of scope

**Generate REQUIREMENTS.md:**

```markdown
## v1 Requirements

### [Category]
- [ ] **[CAT]-01**: [Requirement]
- [ ] **[CAT]-02**: [Requirement]

## v2 Requirements
- [ ] [Deferred items]

## Out of Scope
- [Explicit exclusions with reasoning]

## Traceability
(Empty, filled by roadmap)
```

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, CONTENT-02)

**Requirement quality:**
- Specific and testable
- User-centric ("User can X")
- Atomic (one capability each)
- Independent

**Present full list for confirmation.**

**Commit:**
```bash
git add .planning/REQUIREMENTS.md
git commit -m "docs: define v[X.Y] requirements"
```

## Phase 8: Create Roadmap

Calculate starting phase number:
```bash
ls -d .planning/phases/[0-9]*-* 2>/dev/null | sort -V | tail -1 | grep -oE '[0-9]+' | head -1
```

Spawn kata-roadmapper:

```
Task(prompt="
<planning_context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/research/SUMMARY.md (if exists)
@.planning/config.json

Starting phase number: [N]
</planning_context>

<instructions>
1. Derive phases from requirements
2. Map every v1 requirement to exactly one phase
3. Derive 2-5 success criteria per phase
4. Validate 100% coverage
5. Write ROADMAP.md, STATE.md, update REQUIREMENTS.md traceability
6. Return ROADMAP CREATED
</instructions>
", subagent_type="kata-roadmapper")
```

**Handle return:**
- If `## ROADMAP BLOCKED`: Present blocker, work with user
- If `## ROADMAP CREATED`: Present roadmap, ask for approval

**If approved, commit:**
```bash
git add .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
git commit -m "docs: create v[X.Y] roadmap ([N] phases)"
```

## Phase 9: Done

Present completion. Output this markdown directly (not as a code block):

KATA > MILESTONE INITIALIZED

**v[X.Y] [Name]**

| Artifact     | Location                  |
| ------------ | ------------------------- |
| Project      | .planning/PROJECT.md      |
| Research     | .planning/research/       |
| Requirements | .planning/REQUIREMENTS.md |
| Roadmap      | .planning/ROADMAP.md      |

**[N] phases** | **[X] requirements** | Ready to build

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase [N]: [Phase Name]** — [Goal]

> Instructions can be given conversationally (recommended) or via /commands.

| Action             | Natural Trigger  | Explicit Command        |
| ------------------ | ---------------- | ----------------------- |
| **Plan the phase** | "Plan phase [N]" | `/kata-planning-phases` |

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

## Success Criteria

- [ ] Project validated (PROJECT.md exists)
- [ ] Previous milestone context presented
- [ ] Deep questioning completed
- [ ] Milestone version determined
- [ ] PROJECT.md updated with milestone goals (committed)
- [ ] Research completed if selected (committed)
- [ ] Requirements gathered and scoped
- [ ] REQUIREMENTS.md created with REQ-IDs (committed)
- [ ] kata-roadmapper spawned with context
- [ ] ROADMAP.md, STATE.md committed
- [ ] User knows next step is `/kata:plan-phase [N]`
