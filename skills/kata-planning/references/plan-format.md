# Plan Format Reference

Structure and frontmatter for PLAN.md files.

## PLAN.md Structure

```markdown
---
phase: XX-name
plan: NN
type: execute
wave: N                     # Execution wave (1, 2, 3...)
depends_on: []              # Plan IDs this plan requires
files_modified: []          # Files this plan touches
autonomous: true            # false if plan has checkpoints
user_setup: []              # Human-required setup (omit if empty)

must_haves:
  truths: []                # Observable behaviors
  artifacts: []             # Files that must exist
  key_links: []             # Critical connections
---

<objective>
[What this plan accomplishes]

Purpose: [Why this matters for the project]
Output: [What artifacts will be created]
</objective>

<execution_context>
@~/.claude/kata/workflows/execute-plan.md
@~/.claude/kata/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Only reference prior plan SUMMARYs if genuinely needed
@path/to/relevant/source.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext</files>
  <action>[Specific implementation]</action>
  <verify>[Command or check]</verify>
  <done>[Acceptance criteria]</done>
</task>

</tasks>

<verification>
[Overall phase checks]
</verification>

<success_criteria>
[Measurable completion]
</success_criteria>

<output>
After completion, create `.planning/phases/XX-name/{phase}-{plan}-SUMMARY.md`
</output>
```

## Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `phase` | Yes | Phase identifier (e.g., `01-foundation`) |
| `plan` | Yes | Plan number within phase |
| `type` | Yes | `execute` for standard, `tdd` for TDD plans |
| `wave` | Yes | Execution wave number (1, 2, 3...) |
| `depends_on` | Yes | Array of plan IDs this plan requires |
| `files_modified` | Yes | Files this plan touches |
| `autonomous` | Yes | `true` if no checkpoints, `false` if has checkpoints |
| `user_setup` | No | Human-required setup items |
| `must_haves` | Yes | Goal-backward verification criteria |

**Wave is pre-computed:** Wave numbers are assigned during planning. Execute-phase reads `wave` directly from frontmatter and groups plans by wave number.

## Context Section Rules

Only include prior plan SUMMARY references if genuinely needed:
- This plan uses types/exports from prior plan
- Prior plan made decision that affects this plan

**Anti-pattern:** Reflexive chaining (02 refs 01, 03 refs 02...). Independent plans need NO prior SUMMARY references.

## User Setup Frontmatter

When external services are involved:

```yaml
user_setup:
  - service: stripe
    why: "Payment processing"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard -> Developers -> API keys"
    dashboard_config:
      - task: "Create webhook endpoint"
        location: "Stripe Dashboard -> Developers -> Webhooks"
```

Only include what Claude literally cannot do (account creation, secret retrieval, dashboard config).

## Task XML Structure

### Auto Task

```xml
<task type="auto">
  <name>Task N: Action-oriented name</name>
  <files>src/path/file.ts, src/other/file.ts</files>
  <action>What to do, what to avoid and WHY</action>
  <verify>Command or check to prove completion</verify>
  <done>Measurable acceptance criteria</done>
</task>
```

### TDD Task

```xml
<task type="auto" tdd="true">
  <name>Task N: Feature name (TDD)</name>
  <files>src/feature.ts, src/feature.test.ts</files>
  <behavior>
    Expected behavior in testable terms
    Cases: input -> expected output
  </behavior>
  <implementation>How to implement once tests pass</implementation>
  <verify>npm test passes</verify>
  <done>All tests green, feature working</done>
</task>
```

### Checkpoint Task

```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Description of what was built</what-built>
  <how-to-verify>
    1. Step one
    2. Step two
    3. Expected result
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>
```

## TDD Plan Structure

For plans with `type: tdd`:

```markdown
---
phase: XX-name
plan: NN
type: tdd
---

<objective>
[What feature and why]
Purpose: [Design benefit of TDD for this feature]
Output: [Working, tested feature]
</objective>

<feature>
  <name>[Feature name]</name>
  <files>[source file, test file]</files>
  <behavior>
    [Expected behavior in testable terms]
    Cases: input -> expected output
  </behavior>
  <implementation>[How to implement once tests pass]</implementation>
</feature>
```

**One feature per TDD plan.** If features are trivial enough to batch, they're trivial enough to skip TDD.

## Gap Closure Plan

For plans created from verification failures:

```yaml
---
phase: XX-name
plan: NN              # Sequential after existing
type: execute
wave: 1               # Gap closures typically single wave
depends_on: []        # Usually independent of each other
files_modified: [...]
autonomous: true
gap_closure: true     # Flag for tracking
---
```

## Common Patterns

### Foundation Plan (Wave 1)

```yaml
---
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [package.json, tsconfig.json, .env.example]
autonomous: true

must_haves:
  truths:
    - "Project builds without errors"
    - "TypeScript configured correctly"
  artifacts:
    - path: "package.json"
      provides: "Project dependencies"
      contains: "scripts"
---
```

### Feature Plan (Wave 2+)

```yaml
---
phase: 02-features
plan: 03
type: execute
wave: 2
depends_on: [02-01, 02-02]
files_modified: [src/components/Feature.tsx, src/app/api/feature/route.ts]
autonomous: true

must_haves:
  truths:
    - "User can access feature"
    - "Feature persists data"
  artifacts:
    - path: "src/components/Feature.tsx"
      provides: "Feature UI"
      min_lines: 50
  key_links:
    - from: "src/components/Feature.tsx"
      to: "/api/feature"
      via: "fetch"
      pattern: "fetch.*api/feature"
---
```

### Verification Plan (Final Wave)

```yaml
---
phase: 03-integration
plan: 04
type: execute
wave: 3
depends_on: [03-01, 03-02, 03-03]
files_modified: []
autonomous: false

must_haves:
  truths:
    - "All features work together"
    - "No regressions introduced"
---
```
