# Alignment Pattern

Keep alignment inside the active Kata workflow. Do not route users into standalone discussion commands.

## Depths

- `fast`: Confirm the immediate goal, assumptions, and next action in one concise pass.
- `guided`: Ask targeted questions, offer trade-offs, and persist decisions as they become durable.
- `deep`: Slow down for ambiguous scope, high-risk architecture, cross-team commitments, or irreversible decisions.

Prefer `guided` by default. Switch to `fast` only when intent and risk are clear. Switch to `deep` when the workflow would otherwise proceed on unstable assumptions.

## Rules

- Keep alignment inside the active workflow that triggered the skill.
- Do not create or invoke standalone discuss commands.
- Persist durable decisions through `@kata-sh/cli` artifact operations.
- Treat alignment as a checkpoint that supports action, not as a separate deliverable.
- Return to the workflow as soon as the next safe action is clear.
