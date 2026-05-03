# One-Off Issue Template

Use this template when creating a `kata-plan-issue` backend issue. The final issue body is assembled from the `design` and `plan` fields passed to `issue.create`, so keep both sections complete and self-contained.

## Title

Use a short imperative title:

```text
Fix first-run setup messaging
Add offline context index retry handling
Investigate flaky desktop auth refresh
```

## Design

```markdown
## Problem

What is wrong, missing, or valuable? State the concrete user/developer pain.

## Goals

- Outcome 1.
- Outcome 2.

## Non-goals

- Explicitly excluded scope.

## Proposed approach

Describe the selected approach and why it is the right size for one isolated issue.

## Affected files or surfaces

- `path/or/surface`: expected role in the change.

## Risks and edge cases

- Risk: mitigation.

## Verification

- Command, test, inspection, or acceptance walkthrough that proves this issue is done.
```

## Plan

```markdown
## Tasks

- [ ] Step 1: Create or update the focused failing test.
- [ ] Step 2: Implement the smallest code change that satisfies the design.
- [ ] Step 3: Run the targeted validation command.
- [ ] Step 4: Update docs or user-facing copy if needed.

## Acceptance criteria

- The observable behavior matches the design goals.
- Targeted validation passes.
- No milestone, slice, or task state was required.

## Execution notes

- Include exact commands when known.
- Include file paths when known.
- Leave unknowns as explicit investigation steps, not vague TODOs.
```

## Quality Bar

- The issue can be handed to a fresh agent without additional milestone context.
- The design explains why this is not a milestone/slice/task workflow item.
- The plan is concrete but not over-specified when implementation details require discovery.
- Verification is explicit enough that completion can be checked later.
