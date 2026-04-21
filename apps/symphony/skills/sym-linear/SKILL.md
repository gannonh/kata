---
name: sym-linear
description: Raw Linear GraphQL fallback for expert/manual maintenance only.
disable-model-invocation: true
---

# sym-linear (manual fallback)

Use this skill only when explicitly asked to perform Linear-specific maintenance work that cannot be handled through the canonical worker contract.

## Critical guardrail

Do not use this skill for normal worker tracker operations.
Worker tracker/artifact/state flows must use `kata_*` tools (`kata_get_issue`, `kata_list_tasks`, `kata_read_document`, `kata_upsert_comment`, `kata_update_issue_state`, `kata_create_followup_issue`).

## Allowed use cases

- Linear schema exploration for platform maintenance
- One-off migration/repair tasks explicitly requiring raw GraphQL
- Debugging Linear API edge cases in tooling development

## Primary tool

Use Symphony's `linear_graphql` client tool with narrow operations and minimal field selection.
Treat any top-level `errors` response as a failed operation.
