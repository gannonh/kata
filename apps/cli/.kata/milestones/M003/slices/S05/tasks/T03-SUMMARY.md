---
id: T03
parent: S05
milestone: M003
provides:
  - /kata pr subcommand family — completions for status/create/review/address/merge wired into registerKataCommand
  - handlePr() dispatcher — status is deterministic (no LLM), mutating subcommands dispatch via pi.sendMessage with prompt templates
  - buildLivePrStatusDeps() — real PrStatusDependencies using getCurrentBranch (gh-utils), getPRNumber (pr-merge-utils), and loadEffectiveKataPreferences
  - pr-create.md prompt — wires base_branch and review_on_create from effective preferences into the create flow
  - pr-review.md, pr-address.md, pr-merge.md prompts — route into existing kata_review_pr, kata_fetch_pr_comments, kata_merge_pr tools
key_files:
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/prompts/pr-create.md
  - src/resources/extensions/kata/prompts/pr-review.md
  - src/resources/extensions/kata/prompts/pr-address.md
  - src/resources/extensions/kata/prompts/pr-merge.md
key_decisions:
  - "/kata pr status with no args falls through to the same deterministic handler as explicit 'status' — empty /kata pr shows status rather than usage text"
  - "handlePr dispatches mutating subcommands via pi.sendMessage({ customType: 'kata-pr-*', triggerTurn: true }) — same pattern as doctor-heal and guided-flow; no new dispatch mechanism introduced"
  - "buildLivePrStatusDeps() reads effective preferences fresh on each accessor call (no caching) — avoids stale prefs if preferences file changes mid-session"
patterns_established:
  - "Deterministic status path: check for 'status' or empty args, call helper, ctx.ui.notify — zero LLM turns"
  - "Prompt-dispatch pattern for mutating subcommands: loadPrompt() with injected vars, pi.sendMessage with display:false and triggerTurn:true"
observability_surfaces:
  - "/kata pr status — surfaces branch, base_branch, auto_create, open PR number, and enabled/disabled state without any LLM involvement"
duration: 25min
verification_result: passed
completed_at: 2026-03-13T20:25:00Z
blocker_discovered: false
---

# T03: Add `/kata pr` subcommands and dispatch into the existing workflows

**`/kata pr` command family with deterministic status and prompt-dispatch routing for create/review/address/merge — 137 tests pass, TypeScript clean.**

## What Happened

Extended `commands.ts` to register `pr` as a top-level `/kata` subcommand with second-level completions (`status`, `create`, `review`, `address`, `merge`) powered by `getPrSubcommandCompletions` from T02's `pr-command.ts`.

Implemented `handlePr()`:
- **status / (empty)**: calls `buildPrStatusReport(buildLivePrStatusDeps())` and surfaces the result directly via `ctx.ui.notify` — no LLM turn, fully deterministic
- **create**: reads `base_branch` and `review_on_create` from effective project preferences, injects them into the `pr-create.md` prompt template, and dispatches via `pi.sendMessage` — the conditional `review_on_create` section either chains into review automatically or instructs the agent to surface the PR URL
- **review / address / merge**: each loads its respective prompt template and dispatches into the existing `kata_review_pr`, `kata_fetch_pr_comments`, and `kata_merge_pr` tools

Added `buildLivePrStatusDeps()` that wires real accessors: `getCurrentBranch` from `gh-utils.ts` (already used by pr-runner), `getPRNumber` from `pr-merge-utils.ts`, and `loadEffectiveKataPreferences` for preference gates.

Wrote four prompt templates under `src/resources/extensions/kata/prompts/`:
- `pr-create.md` — uses `{{baseBranch}}` and `{{reviewOnCreate}}` placeholders, injected at dispatch time
- `pr-review.md`, `pr-address.md`, `pr-merge.md` — no variables, pure routing instructions

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts'` → **10/10 pass**
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-auto.test.ts'` → **12/12 pass**
- `npx tsc --noEmit` → **clean (no output)**
- Extension load smoke check → **ok**
- `npm test` → **137/137 pass**

## Diagnostics

Run `/kata pr status` to inspect PR lifecycle readiness without any LLM involvement. Output distinguishes:
- `PR lifecycle: pr.enabled is false (disabled)` — with setup guidance
- `PR lifecycle: enabled` — with branch, base_branch, auto_create, and open PR number (or "no open PR")

The `kata-pr-create`, `kata-pr-review`, `kata-pr-address`, `kata-pr-merge` custom message types are machine-scannable in session logs to identify which PR subcommand was dispatched.

## Deviations

None. The task plan was followed as written. The `/kata pr` with no args was resolved to show status (same as `status`) rather than usage text — a minor UX choice aligned with the pattern of `/kata` with no args showing the smart entry wizard.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/commands.ts` — added `pr` to subcommand list/completions, `pr` routing in handler, `handlePr()`, `buildLivePrStatusDeps()`, imports for `getPrSubcommandCompletions`, `buildPrStatusReport`, `getCurrentBranch`, `getPRNumber`
- `src/resources/extensions/kata/prompts/pr-create.md` — command-dispatch prompt for PR creation with base_branch and review_on_create injection
- `src/resources/extensions/kata/prompts/pr-review.md` — command-dispatch prompt routing to kata_review_pr
- `src/resources/extensions/kata/prompts/pr-address.md` — command-dispatch prompt routing to kata_fetch_pr_comments
- `src/resources/extensions/kata/prompts/pr-merge.md` — command-dispatch prompt routing to kata_merge_pr
