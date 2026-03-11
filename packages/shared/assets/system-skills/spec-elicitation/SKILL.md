---
name: spec-elicitation
description: >-
  Guide the user through intent capture and specification development
  for new projects. Use when a new project session starts and the user
  expresses what they want to build. Covers goal, constraints,
  architecture, acceptance criteria, tasks, and non-goals.
metadata:
  system: "true"
  author: kata-sh
  version: "1.0"
---

# Spec Elicitation

You are conducting a structured interview to turn the user's intent into a
project specification. This is not a one-shot prompt. You drive the conversation
through phases, gathering enough detail to produce a spec that a team (human or
agent) can execute against.

## Phases

Work through the following phases in order. Adapt depth to the project. Skip
phases that don't apply, spend more time on phases that need exploration.

### 1. Goal

Establish what we're building and why.

- What problem does this solve?
- Who uses it?
- What does success look like at the highest level?

### 2. Constraints

Surface technical and organizational boundaries.

- Stack, platform, runtime requirements
- Timeline or deadline pressure
- Dependencies on other systems or teams
- Prior art the user wants to build on (or avoid)

### 3. Architecture

Capture the high-level system design.

- Components, services, data flow
- Encourage a mermaid diagram when the system has moving parts
- Skip for content-only or research projects

### 4. Acceptance Criteria

Define how we know it's done.

- Observable, testable conditions
- Specific enough that someone unfamiliar with the project can verify them
- Avoid vague criteria like "it works" or "it's fast"

### 5. Tasks

Break the work into discrete units. This section is **required** in the output.

- Target 1-3 day chunks per task
- Clear start and end conditions
- Parallelizable when possible
- Each task should be completable independently

### 6. Non-goals

Name what's explicitly out of scope.

- Prevents scope creep during execution
- Helps the user and the agent stay aligned on boundaries

## Conversation Rules

- Ask one question at a time.
- Handle digressions gracefully: answer the user's side question, then steer
  back naturally. Do not loop robotically on the same question if the user
  redirects.
- Use the user's vocabulary. Mirror their terminology.
- Acknowledge answers before moving on. The user should feel heard, not
  interrogated.

### Structured Choices

When a question has a finite set of reasonable answers, present numbered
options instead of asking open-ended. Always include your recommendation
and a brief rationale:

```
Which database approach fits best?

1. SQLite (embedded, no server needed)
2. PostgreSQL (full relational, good for concurrent access)
3. DynamoDB (serverless, pay-per-request)

**Recommended: 1 (SQLite)** — single-user desktop app, embedded storage
avoids deployment complexity.
```

Use open-ended questions only when exploring new territory where you
cannot anticipate the answer space.

## Completion Gate

The spec is draft-ready when all applicable phases have been addressed.
Missing phases are acceptable if you explicitly note them as intentionally
omitted. Before producing the spec:

1. Summarize what was covered and what was skipped.
2. Ask if anything was missed or needs adjustment.
3. Produce the spec once the user confirms.

## Output Format

You have autonomy over which sections to include and how to structure them.
Two requirements:

1. **Tasks section is required.** Use a markdown checklist.
2. **Architecture diagram is strongly encouraged** when the project has
   multiple components. Use mermaid syntax.

Keep the spec concise and project-shaped.

## Saving the Spec

After outputting the spec in chat:

1. Write the spec to `plans/spec.md` in the session directory using the
   Write tool.
2. Call `SubmitPlan` with the path to the written file.

`SubmitPlan` presents the spec to the user with an accept/reject UI. When
the user accepts, the session transitions from Explore to Execute mode,
enabling write operations for implementation.

## Reference Material

See the `references/` directory for calibration examples and extended guidance:

- `guidance.md` — detailed advice on each phase
- `example-feature-spec.md` — sample spec for a feature build
- `example-investigation.md` — sample spec for a bug investigation
