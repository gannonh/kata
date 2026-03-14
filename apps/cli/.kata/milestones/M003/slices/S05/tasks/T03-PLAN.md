---
estimated_steps: 5
estimated_files: 5
---

# T03: Add `/kata pr` subcommands and dispatch into the existing workflows

**Slice:** S05 — Preferences, Onboarding & `/kata pr` Command
**Milestone:** M003

## Description

Ship the real user-facing command surface. This task makes the PR lifecycle discoverable from `/kata pr`, keeps `status` deterministic, and routes the mutating subcommands into the existing S01–S04 implementations instead of copying GitHub logic into the command handler.

## Steps

1. Extend `src/resources/extensions/kata/commands.ts` so `pr` behaves as a first-argument subcommand family with second-level completions for `create`, `review`, `address`, `merge`, and `status`.
2. Implement `handlePr(...)` in `commands.ts`, wiring `status` to the deterministic helper from T02 and routing the mutating subcommands through hidden prompt dispatch with the user's slash-command invocation treated as explicit permission for the GitHub action.
3. Add prompt templates `pr-create.md`, `pr-review.md`, `pr-address.md`, and `pr-merge.md` under `src/resources/extensions/kata/prompts/`, each instructing the agent to use the corresponding existing tool/workflow rather than reinventing the operation.
4. Thread `pr.base_branch` and `pr.review_on_create` through the create flow so a successful create can immediately continue into review when configured.
5. Re-run the T01/T02 tests plus extension-load smoke checks to confirm the command surface is wired into the live extension runtime.

## Must-Haves

- [ ] `/kata pr` is discoverable from completions and usage text.
- [ ] `/kata pr status` does not require an LLM turn and surfaces deterministic status directly.
- [ ] `create`, `review`, `address`, and `merge` dispatch into the already-built S01–S04 workflows instead of duplicating tool logic.
- [ ] The create flow explicitly wires `base_branch` and `review_on_create` rather than leaving them as dead preferences.

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts'`
- `npx tsc --noEmit`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "Promise.all([import('./src/resources/extensions/kata/index.ts'), import('./src/resources/extensions/pr-lifecycle/index.ts')]).then(() => console.log('ok'))"`

## Observability Impact

- Signals added/changed: `/kata pr status` becomes the primary read-only inspection surface for PR lifecycle readiness and current state.
- How a future agent inspects this: run `/kata pr status` to see whether GitHub setup, slice-branch context, PR presence, and preference gates are satisfied before touching any mutating flow.
- Failure state exposed: status output and command usage text distinguish setup problems from workflow problems (for example, `gh unauthenticated` versus `no open PR`).

## Inputs

- `src/resources/extensions/kata/commands.ts` — existing `/kata` command and subcommand completion structure
- `src/resources/extensions/kata/pr-command.ts` — deterministic status/completion helpers from T02
- `src/resources/extensions/pr-lifecycle/index.ts` — existing create/review/address/merge tools that the command must reuse
- `/Users/gannonhall/.agents/skills/pull-requests/SKILL.md` — workflow expectations for create/review/address/merge sequencing
- `.kata/milestones/M003/slices/S02/S02-SUMMARY.md` and `.kata/milestones/M003/slices/S03/S03-SUMMARY.md` — tool outputs and reviewer/addressing flow details the command must preserve

## Expected Output

- `src/resources/extensions/kata/commands.ts` — `/kata pr` routing with completions and deterministic status handling
- `src/resources/extensions/kata/prompts/pr-create.md` — command-dispatch prompt for PR creation (and optional review-on-create)
- `src/resources/extensions/kata/prompts/pr-review.md` — command-dispatch prompt for PR review
- `src/resources/extensions/kata/prompts/pr-address.md` — command-dispatch prompt for comment triage/fix flow
- `src/resources/extensions/kata/prompts/pr-merge.md` — command-dispatch prompt for PR merge flow
