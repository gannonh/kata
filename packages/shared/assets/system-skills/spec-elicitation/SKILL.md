---
name: spec-elicitation
description: >-
  This skill should be used when a new project session starts and the user
  expresses what they want to build, asks to "start a project", "spec this
  out", "help me plan", or describes a feature/tool/system they want to
  create. Guides structured intent capture through goal, constraints,
  architecture, acceptance criteria, tasks, and non-goals.
metadata:
  system: "true"
  author: kata-sh
  version: "1.1"
---

# Spec Elicitation

Conduct a structured interview to turn intent into a project specification.
Drive the conversation through phases, gathering enough detail to produce a
spec that a team (human or agent) can execute against.

## Message Format (mandatory)

Every message sent during elicitation MUST follow this structure exactly:

```
[1-2 sentence acknowledgment of previous answer, if any]

[Single question as a heading or bold text]

1. [Option A] — [brief description]
2. [Option B] — [brief description]
3. [Option C] — [brief description]
4. Something else (describe)

**Recommended: [N] ([Option])** — [1-sentence rationale]
```

### Hard constraints

- **One question per message.** Never append a second question, a "related"
  follow-up, or an "and also." If two things need asking, send two messages.
- **Numbered choices on every question** where 3+ reasonable answers exist.
  Reserve free-form questions for genuinely open-ended exploration (e.g.,
  "Describe your current workflow").
- **Recommendation on every choice set.** State which option to pick and
  why. The user expects an informed opinion, not a neutral menu.
- **No bullet-point sub-questions.** Do not list elaborating questions
  beneath the main question. Ask them in subsequent turns.

### Violation examples

WRONG — two questions in one message:

```
What's the primary use case?

1. Data pipelines
2. One-off conversions
3. Tool integration

And who's the main user — yourself, your team, or broader distribution?
```

WRONG — sub-questions under main question:

```
What problem does this solve? For example:
- Do you need to convert CSV data for a web app?
- Are you processing exports from another system?
- Is this for personal automation?
```

WRONG — choices without recommendation:

```
Which approach?

1. CLI tool
2. Library
3. Web service
```

RIGHT:

```
What's the primary use case?

1. Data processing pipelines — automating recurring workflows
2. One-off developer conversions — quick ad-hoc transforms
3. Integration layer — bridging two systems via format conversion
4. Something else

**Recommended: 1 (Data processing pipelines)** — most CSV-to-JSON needs
recur, making automation the highest-value path.
```

## Phases

Work through these phases in order. Adapt depth to the project. Skip phases
that don't apply. Consult `references/guidance.md` for detailed advice on
each phase, including when to skip and how to calibrate depth.

1. **Goal** — What problem, who uses it, what does success look like
2. **Constraints** — Stack, platform, timeline, dependencies, prior art
3. **Architecture** — Components, data flow, mermaid diagram (skip for
   simple scripts or content-only projects)
4. **Acceptance criteria** — Observable, testable, specific conditions
5. **Tasks** (required in output) — 1-3 day chunks, clear boundaries,
   parallelizable when possible
6. **Non-goals** — Explicit out-of-scope items to prevent scope creep

## Conversation Flow

- Acknowledge answers before moving on. Mirror the user's vocabulary.
- Handle digressions: answer the side question, then steer back naturally.
- Do not loop on the same question if the user redirects.
- When a phase is sufficiently covered, move to the next. Do not ask
  permission to advance unless the answer was ambiguous.

## Completion Gate

Before producing the spec:

1. Summarize what was covered and what was intentionally skipped.
2. Ask if anything was missed or needs adjustment.
3. Produce the spec once the user confirms.

## Output Format

Structure is flexible. Two requirements:

1. **Tasks section is required.** Use a markdown checklist.
2. **Architecture diagram is strongly encouraged** when the project has
   multiple components. Use mermaid syntax.

Keep the spec concise. Consult `references/guidance.md` for target lengths.

## Saving the Spec

After outputting the spec in chat:

1. Write the spec to `plans/spec.md` in the session directory using the
   Write tool.
2. Call `SubmitPlan` with the path to the written file.

`SubmitPlan` presents the spec to the user with an accept/reject UI. When
the user accepts, the session transitions from Explore to Execute mode,
enabling write operations for implementation.

## Reference Material

Consult the `references/` directory for calibration examples and extended
guidance:

- `guidance.md` — phase depth calibration, acceptance criteria examples,
  task scoping advice, diagram guidance, spec length targets
- `example-feature-spec.md` — sample spec for a feature build
- `example-investigation.md` — sample spec for a bug investigation
