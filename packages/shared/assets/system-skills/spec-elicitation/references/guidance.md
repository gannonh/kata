# Spec Elicitation Guidance

Extended guidance for each phase of the elicitation process. Use this as a
reference when deciding how deep to go and how to structure the output.

## When to Include or Exclude Phases

Not every project needs every phase. Calibrate depth based on project type.

| Phase               | Include when                                    | Skip when                                |
| ------------------- | ----------------------------------------------- | ---------------------------------------- |
| Goal                | Always                                          | Never skip                               |
| Constraints         | Always                                          | Never skip                               |
| Architecture        | Multiple components, services, or data flows    | Content-only, small scripts, research    |
| Acceptance Criteria | Feature builds, integrations, refactors         | Pure investigations (use success criteria instead) |
| Tasks               | Always                                          | Never skip                               |
| Non-goals           | Medium-to-large scope, ambiguous boundaries     | Very small or tightly scoped work        |

## Writing Good Acceptance Criteria

Acceptance criteria answer: "How does someone who wasn't in this conversation
verify the work is done?"

**Strong criteria are:**
- Observable: you can see or measure the result
- Testable: a pass/fail check exists
- Specific: no room for interpretation

**Examples:**

Bad: "The search is fast."
Good: "Search returns results within 200ms for repositories under 10GB."

Bad: "Error handling works."
Good: "Invalid regex patterns return exit code 1 with a message identifying the
invalid pattern and its position."

Bad: "The UI looks good."
Good: "The results list displays file path, line number, and a 3-line context
window for each match."

## Scoping Tasks

Each task should be a unit of work that one person (or agent) can complete in
1-3 days. Characteristics of well-scoped tasks:

- **Clear boundaries.** The start condition and end condition are explicit.
  "Implement the index builder" is vague. "Build the trigram index from a
  directory tree and write it to a binary file" has boundaries.

- **Independent when possible.** Tasks that can run in parallel reduce
  calendar time. Identify dependencies explicitly when tasks must be
  sequential.

- **Vertically sliced.** Prefer tasks that deliver a thin slice of working
  functionality over tasks that build one horizontal layer (e.g., "all the
  database models"). A vertical slice is testable on its own.

- **Numbered and ordered.** Give tasks a rough execution order. Note which
  tasks depend on others.

## When to Use Mermaid Diagrams

Diagrams add clarity when the system has structure that's hard to convey in
prose. Use them for:

- **Architecture:** component relationships, service boundaries, deployment
  topology
- **Data flow:** how data moves through the system, transformation stages
- **State machines:** lifecycle of an entity with distinct states and
  transitions

Skip diagrams for:
- Projects with a single component
- Content creation or writing tasks
- Simple scripts with linear execution

Prefer `graph TD` or `graph LR` for architecture. Use `sequenceDiagram` for
interaction flows. Use `stateDiagram-v2` for lifecycle models.

## Handling Non-goals

Non-goals prevent scope creep by naming things the project will not do. They
are particularly valuable when:

- The project touches a system with many possible extensions
- Stakeholders have different expectations about scope
- The user mentions features "for later" during the interview

Write non-goals as direct statements: "This project will not include a web
UI." Avoid hedging ("We probably won't...") — non-goals should be definitive
for the scope of this project.

## Adapting to Project Types

### Feature Build
All phases apply. Architecture and acceptance criteria are typically the
heaviest sections. Tasks are implementation-focused.

### Investigation / Bug Hunt
Replace Goal with Problem Statement. Replace Architecture with Investigation
Scope. Replace Tasks with Hypotheses to Test. Use Success Criteria instead of
Acceptance Criteria. See `example-investigation.md`.

### Content Creation
Goal and Constraints are primary. Architecture is usually irrelevant. Tasks
are content milestones (outline, draft, review, publish). Acceptance criteria
focus on coverage and accuracy.

### Refactoring
Goal focuses on the structural improvement and its motivation. Constraints
must capture backward compatibility requirements. Architecture shows
before/after. Tasks are incremental transformation steps. Acceptance criteria
verify behavior preservation alongside structural goals.

## Spec Length

A good spec is as short as possible while remaining unambiguous. Target:

- Goal: 2-5 sentences
- Constraints: bullet list, 3-8 items
- Architecture: 1 paragraph + diagram
- Acceptance criteria: 5-10 items
- Tasks: 5-10 items with 1-2 sentence descriptions
- Non-goals: 3-5 items

Total spec length should rarely exceed 150 lines. If it does, consider
whether the project should be split.
