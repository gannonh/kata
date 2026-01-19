# Project Template Reference

Complete template and guidelines for creating `.planning/PROJECT.md`.

## Template

```markdown
# [Project Name]

## What This Is

[Current accurate description - 2-3 sentences. What does this product do and who is it for?
Use the user's language and framing. Update whenever reality drifts from this description.]

## Core Value

[The ONE thing that matters most. If everything else fails, this must work.
One sentence that drives prioritization when tradeoffs arise.]

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet - ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- [Exclusion 1] - [why]
- [Exclusion 2] - [why]

## Context

[Background information that informs implementation:
- Technical environment or ecosystem
- Relevant prior work or experience
- User research or feedback themes
- Known issues to address]

## Constraints

- **[Type]**: [What] - [Why]
- **[Type]**: [What] - [Why]

Common types: Tech stack, Timeline, Budget, Dependencies, Compatibility, Performance, Security

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| [Choice] | [Why] | [Pending / Good / Revisit] |

---
*Last updated: [date] after [trigger]*
```

## Section Guidelines

### What This Is

**Purpose:** Current accurate description of the product.

**Guidelines:**
- 2-3 sentences capturing what it does and who it's for
- Use the user's words and framing
- Update when the product evolves beyond this description

**Good:**
```markdown
A mobile-first community platform where recreational runners share routes, coordinate group runs, and track personal achievements. Built for casual runners who run 2-3 times per week and want social motivation without competitive pressure.
```

**Bad:**
```markdown
A running app.
```

### Core Value

**Purpose:** The single most important thing that drives prioritization.

**Guidelines:**
- Everything else can fail; this cannot
- Drives prioritization when tradeoffs arise
- Rarely changes; if it does, it's a significant pivot

**Good:**
```markdown
Runners can discover and join group runs in their area with minimal friction.
```

**Bad:**
```markdown
The app should be useful and user-friendly.
```

### Requirements - Validated

**Purpose:** Requirements that shipped and proved valuable.

**Guidelines:**
- Format: `- [x] [Requirement] - [version/phase]`
- These are locked; changing them requires explicit discussion
- Move from Active when shipped AND validated by users

**Example:**
```markdown
- [x] User can create account with email - v0.1
- [x] User can log running routes on a map - v0.1
```

### Requirements - Active

**Purpose:** Current scope being built toward.

**Guidelines:**
- These are hypotheses until shipped and validated
- Move to Validated when shipped, Out of Scope if invalidated
- Format: `- [ ] [Requirement]`

**Example:**
```markdown
- [ ] User can follow other runners
- [ ] User can create and share routes
- [ ] User can join scheduled group runs
```

### Requirements - Out of Scope

**Purpose:** Explicit boundaries on what we're not building.

**Guidelines:**
- Always include reasoning (prevents re-adding later)
- Includes: considered and rejected, deferred to future, explicitly excluded

**Example:**
```markdown
- Real-time chat - High complexity, not core to value
- Fitness tracking integration - Defer to v2
- Competitive leaderboards - Conflicts with casual positioning
```

### Context

**Purpose:** Background that informs implementation decisions.

**Guidelines:**
- Technical environment, prior work, user feedback
- Known issues or technical debt
- Update as new context emerges

**Example:**
```markdown
The target demographic (recreational runners 25-45) primarily uses mobile devices for fitness apps. Competitor analysis shows Strava dominates competitive runners; opportunity exists in casual/social space.

Prior user research found that existing apps feel "too serious" for casual runners who just want social motivation.
```

### Constraints

**Purpose:** Hard limits on implementation choices.

**Guidelines:**
- Tech stack, timeline, budget, compatibility, dependencies
- Include the "why" - constraints without rationale get questioned

**Example:**
```markdown
- **Tech stack**: React Native - Cross-platform requirement, team familiarity
- **Timeline**: MVP by March 2026 - Event partnership deadline
- **Budget**: No paid services initially - Bootstrap validation
- **Compatibility**: iOS 14+, Android 10+ - Target demographic devices
```

### Key Decisions

**Purpose:** Significant choices that affect future work.

**Guidelines:**
- Add decisions as they're made throughout the project
- Track outcome when known:
  - Pending - Too early to evaluate
  - Good - Decision proved correct
  - Revisit - Decision may need reconsideration

**Example:**
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Native over native | Cross-platform with single codebase | Pending |
| Firebase for MVP backend | Fast iteration, can migrate later | Pending |
| No real-time chat | Focus on core value | Good |

### Last Updated

**Purpose:** Triggers review of whether content is still accurate.

**Guidelines:**
- Always note when and why the document was updated
- Format: `after Phase 2` or `after v1.0 milestone`

## Anti-Patterns to Avoid

### Vague Core Value

**Bad:**
```markdown
## Core Value

Make the app useful and enjoyable for users.
```

**Why:** Doesn't help prioritization. Everything could fit this.

### Missing Reasoning in Out of Scope

**Bad:**
```markdown
## Out of Scope

- Chat
- Leaderboards
- Badges
```

**Why:** Without reasoning, these will be proposed again.

### Requirements as Tasks

**Bad:**
```markdown
## Active

- [ ] Set up database
- [ ] Create API endpoints
- [ ] Build login page
```

**Why:** These are implementation tasks, not user-facing requirements.

### Stale Content

**Bad:** PROJECT.md still says "mobile-first" when team pivoted to web.

**Why:** Misleads future Claude sessions. Update or mark as outdated.

## Brownfield Projects

For existing codebases:

1. **Map codebase first** via `/kata:map-codebase`

2. **Infer Validated requirements** from existing code:
   - What does the codebase actually do?
   - What patterns are established?
   - What's clearly working and relied upon?

3. **Gather Active requirements** from user:
   - Present inferred current state
   - Ask what they want to build next

4. **Initialize:**
   - Validated = inferred from existing code
   - Active = user's goals for this work
   - Out of Scope = boundaries user specifies
   - Context = includes current codebase state

## STATE.md Reference

STATE.md references PROJECT.md:

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [date])

**Core value:** [One-liner from Core Value section]
**Current focus:** [Current phase name]
```

This ensures Claude reads current PROJECT.md context.

## Evolution

PROJECT.md evolves throughout the project lifecycle.

**After each phase transition:**
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state
