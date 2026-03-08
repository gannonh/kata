# Desktop Planning Index

This directory contains desktop app planning artifacts.

## Source of Truth

- Execution source of truth: Linear project [Kata Cloud Agents](https://linear.app/kata-sh/project/kata-cloud-agents-b0f5a7be6537/overview)
- Primary requirements and UI acceptance authority: `docs/plans/design/specs/README.md`

## Document Roles

- `docs/plans/design/specs/` — Primary product requirements and acceptance criteria for desktop UI.
- `docs/plans/context-retrieval-contract-v1.md` — Context Engine integration contract reference.
- `docs/plans/kata-context.md` — Kata Context vision reference.
- `docs/plans/ovweview.md` — Product overview reference (historical naming retained).
- `docs/plans/archive/` — Archived plans retained as historical context.

## Working Rules

- Do not use markdown files in this directory as the active task tracker.
- New execution work should start as Linear issues in `Kata Desktop App`.
- Issues move through `Backlog -> Todo -> In Progress -> In Review -> Done`.
- Hard-gate rule: do not move implementation issues to `Done` without linked spec-state/spec-interaction evidence.
