# Desktop Planning Index

This directory contains desktop app planning artifacts.

## Source of Truth

- Execution source of truth: Linear project `Kata Desktop App`
- Workflow contract: Linear document `Desktop App Linear Workflow Contract`
- Primary requirements and UI acceptance authority: `app/_plans/design/specs/README.md`

## Document Roles

- `app/_plans/design/specs/` — Primary product requirements and acceptance criteria for desktop UI.
- `app/_plans/context-retrieval-contract-v1.md` — Context Engine integration contract reference.
- `app/_plans/kata-context.md` — Kata Context vision reference.
- `app/_plans/ovweview.md` — Product overview reference (historical naming retained).
- `app/_plans/archive/` — Archived plans retained as historical context.

## Working Rules

- Do not use markdown files in this directory as the active task tracker.
- New execution work should start as Linear issues in `Kata Desktop App`.
- Issues move through `Backlog -> Todo -> In Progress -> In Review -> Done`.
- Hard-gate rule: do not move implementation issues to `Done` without linked spec-state/spec-interaction evidence.
