---
name: sym-linear
description: Raw Linear GraphQL fallback for expert/manual maintenance only.
disable-model-invocation: true
---

# sym-linear (manual fallback)

Use this skill only when explicitly asked to perform Linear-specific maintenance work that cannot be handled through the active backend-state workflow.

## Critical guardrail

Do not use this skill for normal worker tracker operations. Project, milestone, slice, task, artifact, health, and execution-status flows must use the deterministic Kata CLI backend-state operations exposed through the active workflow (for example `project.getContext`, `project.getSnapshot`, `slice.updateStatus`, `task.updateStatus`, and `artifact.write`) instead of raw Linear GraphQL. Legacy custom worker tools are not the path for migrated Symphony skills.

## Allowed use cases

- Linear schema exploration for platform maintenance
- One-off migration/repair tasks explicitly requiring raw GraphQL
- Debugging Linear API edge cases in tooling development

## Primary tool

Use Symphony's `linear_graphql` client tool with narrow operations and minimal field selection only for the allowed Linear-specific fallback cases above. Treat any top-level `errors` response as a failed operation. This skill should not be used to bypass Kata CLI backend-state transitions or artifact writes.
