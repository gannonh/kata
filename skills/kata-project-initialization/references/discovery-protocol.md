# Discovery Protocol Reference

Detailed guidance on conducting discovery interviews for new projects.

## Core Philosophy

### Solo Developer + Claude Workflow

You are gathering context for ONE person (the user) and ONE implementer (Claude).

- No teams, stakeholders, sprints, resource allocation
- User is the visionary/product owner
- Claude is the builder
- Keep discovery focused on what Claude needs to build well

### Deep Questioning is High Leverage

This is the most leveraged moment in any project. Deep questioning here means better plans, better execution, better outcomes.

**The trap:** Rushing through discovery to "get to the real work."

**The truth:** Discovery IS the real work. A clear PROJECT.md prevents weeks of wasted implementation.

## Opening the Conversation

**Start with:** "What do you want to build?"

Wait for their response. This gives context for intelligent follow-ups.

**Don't:**
- Jump to a checklist
- Ask multiple questions at once
- Assume you know what they mean

## Following the Thread

Based on their response, dig into what they mentioned.

**Each answer opens new threads to explore:**
- What excited them
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

### Example Thread Following

**User:** "I want to build a community app for runners."

**Bad follow-up:** "What features do you want?" (checklist mode)

**Good follow-ups:**
- "What makes this for runners specifically vs general fitness?"
- "Is there a specific type of runner - marathon, casual, trail?"
- "What's missing from existing running apps that made you want to build this?"

## Questioning Techniques

### Challenge Vagueness

When they say something abstract, make it concrete.

| Vague | Challenge |
|-------|-----------|
| "User-friendly" | "Walk me through what a user does in their first 30 seconds" |
| "Fast" | "What response time would feel instant? What would feel slow?" |
| "Social features" | "If you could only build one social interaction, what would it be?" |
| "Scalable" | "How many users do you expect in month 1? Year 1?" |

### Surface Assumptions

Unspoken assumptions cause implementation surprises.

**Ask:**
- "What are you assuming users already know how to do?"
- "What's obvious to you that might not be obvious to users?"
- "What existing behavior are you counting on?"

### Find Edges

Understand the boundaries by exploring them.

**Ask:**
- "What would make this NOT your product?"
- "What's the simplest version that would still be valuable?"
- "What would you refuse to build even if users asked for it?"

### Reveal Motivation

Understanding WHY helps prioritize.

**Ask:**
- "Why this project? Why now?"
- "Who specifically is this for? Can you name one real person?"
- "What happens if you don't build this?"

## Context Checklist

As you gather information, ensure you have coverage for:

### Project Identity
- [ ] What is it? (1-2 sentences)
- [ ] Who is it for? (specific user type)
- [ ] What's the core value? (the ONE thing)

### User Understanding
- [ ] Primary user scenario (most common use case)
- [ ] User's current alternative (what they do today)
- [ ] Success from user's perspective (what makes them happy)

### Scope Boundaries
- [ ] What's definitely in v1?
- [ ] What's explicitly out of scope?
- [ ] What's uncertain (needs exploration)?

### Technical Context
- [ ] Known tech constraints (must use X, can't use Y)
- [ ] Deployment environment (where will it run?)
- [ ] Integration points (what existing systems?)

### Timeline and Priorities
- [ ] What's the first milestone?
- [ ] Any hard deadlines?
- [ ] What's most important vs nice-to-have?

**Important:** Don't suddenly switch to checklist mode. Weave these questions naturally into the conversation.

## When to Stop Asking

Stop discovery when:

1. **You could write a clear PROJECT.md** - You understand what, who, why, boundaries
2. **Questions become diminishing returns** - User is repeating themselves
3. **User signals readiness** - "Let's start building"

**Decision gate prompt:**

"I think I understand what you're after. Ready to create PROJECT.md?"

Options:
- "Create PROJECT.md" - Move forward
- "Keep exploring" - Continue discovery

## Anti-Patterns

### Interrogation Mode

**Bad:** Rapid-fire questions without responding to answers
**Good:** Engage with each response before asking more

### Checklist Mode

**Bad:** Running through standard questions regardless of relevance
**Good:** Let the conversation guide what needs clarifying

### Assumption Mode

**Bad:** "So you want a REST API..." (assuming implementation)
**Good:** "How do you imagine users interacting with this?"

### Enterprise Mode

**Bad:** "Who are the stakeholders? What's the governance structure?"
**Good:** Focus on user, product, and technical reality

## Special Cases

### Brownfield Projects (Existing Codebase)

When `.planning/codebase/` exists or code is detected:

1. **Acknowledge existing state** - "I see there's existing code here"
2. **Understand current reality** - "What does it do today?"
3. **Focus on delta** - "What are you trying to add or change?"
4. **Validate inferred state** - "Based on the code, it looks like X is working. Is that right?"

### Unclear Starting Point

When user isn't sure what they want:

1. **Explore the problem space** - "What problem are you trying to solve?"
2. **Find the spark** - "What made you think about building something?"
3. **Use scenarios** - "Imagine it's built. Walk me through using it."
4. **Start small** - "What's the smallest thing that would be useful?"

### Strong Technical Opinions

When user has specific tech requirements:

1. **Understand the why** - "What draws you to [technology]?"
2. **Note as constraint** - Record in PROJECT.md Constraints section
3. **Validate fit** - "Does [technology] handle [user need]?"
4. **Move on** - Don't debate reasonable choices

## Information Synthesis

### During Discovery

Keep a mental model of:
- **Core concept** - One sentence describing the product
- **Target user** - Specific person who would use it
- **Key differentiator** - Why this vs alternatives
- **Biggest constraint** - What limits choices
- **First milestone** - What they want to ship first

### For PROJECT.md

Transform raw discovery into structured document:

- **What This Is** - Synthesize core concept
- **Core Value** - Extract the ONE thing that must work
- **Requirements** - Convert needs into checkable items
- **Constraints** - Capture technical and timeline limits
- **Key Decisions** - Record choices made during discovery

Don't compress. Capture everything gathered. Future Claude sessions will thank you.
