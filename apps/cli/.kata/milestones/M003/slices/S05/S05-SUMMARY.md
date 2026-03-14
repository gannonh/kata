---
id: S05
milestone: M003
provides:
  - PR subcommand test suite (pr-command.test.ts, pr-auto.test.ts, 3 prefs-status assertions) — T01
  - pr-command.ts: getPrSubcommandCompletions, buildPrStatusReport, getPrOnboardingRecommendation — T02
  - pr-auto.ts: decidePostCompleteSliceAction, formatPrAutoCreateFailure — T02
  - pr-runner.ts: runCreatePr() shared PR creation callable from tool and auto-mode — T02
  - buildPrefsStatusReport in commands.ts emits pr.enabled/auto_create/base_branch lines — T02
  - /kata pr subcommand family: status (deterministic), create/review/address/merge (prompt dispatch) — T03
  - buildLivePrStatusDeps() wiring getCurrentBranch, getPRNumber, loadEffectiveKataPreferences — T03
  - pr-create/review/address/merge.md prompt templates — T03
  - pr: block in templates/preferences.md and gitignore.ts bootstrap — T04
  - docs/preferences-reference.md: pr.* fields documented, /kata pr status examples, PR example — T04
  - detectGithubRemote + enablePrPreferences in guided-flow.ts; PR onboarding hook in wizard — T04
  - auto.ts: three-branch post-complete-slice dispatch (legacy / auto-create-and-pause / skip-notify) — T05
slices_complete: [S01, S02, S03, S04, S05]
key_files:
  - src/resources/extensions/kata/pr-command.ts
  - src/resources/extensions/kata/pr-auto.ts
  - src/resources/extensions/kata/auto.ts
  - src/resources/extensions/kata/commands.ts
  - src/resources/extensions/kata/guided-flow.ts
  - src/resources/extensions/kata/templates/preferences.md
  - src/resources/extensions/kata/docs/preferences-reference.md
  - src/resources/extensions/pr-lifecycle/pr-runner.ts
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/kata/prompts/pr-create.md
  - src/resources/extensions/kata/prompts/pr-review.md
  - src/resources/extensions/kata/prompts/pr-address.md
  - src/resources/extensions/kata/prompts/pr-merge.md
key_decisions:
  - "D048: /kata pr status renders directly (no LLM); mutating subcommands dispatch via pi.sendMessage with prompt templates"
  - "D049: PostCompleteSliceDecision = legacy-squash-merge | auto-create-and-pause | skip-notify; skip-notify is safe default for pr.enabled without auto_create"
  - "D050: /kata pr status is the canonical PR lifecycle inspection surface"
  - "D051: PR create failure in auto-mode calls stopAuto — never falls through to legacy squash-merge"
  - "D052: PrStatusDependencies uses injected accessors — keeps buildPrStatusReport fully testable"
patterns_established:
  - "Deterministic status path: check 'status' or empty args, call helper, ctx.ui.notify — zero LLM turns"
  - "Prompt-dispatch for mutating subcommands: loadPrompt() with injected vars, pi.sendMessage display:false triggerTurn:true"
  - "post-complete-slice: read PostCompleteSliceDecision from pure helper, branch on three cases"
  - "PR failure in auto-mode: formatPrAutoCreateFailure → ctx.ui.notify error + stopAuto"
observability_surfaces:
  - "/kata pr status — branch, base_branch, auto_create, open PR number, enabled/disabled state without LLM"
  - "/kata prefs status — pr.enabled/auto_create/base_branch lines via buildPrefsStatusReport"
  - "auto-create-and-pause: PR URL in ui.notify; failure: phase+error+hint in ui.notify error"
drill_down_paths:
  - .kata/milestones/M003/slices/S05/tasks/T01-SUMMARY.md
  - .kata/milestones/M003/slices/S05/tasks/T02-SUMMARY.md
  - .kata/milestones/M003/slices/S05/tasks/T03-SUMMARY.md
  - .kata/milestones/M003/slices/S05/tasks/T04-SUMMARY.md
  - .kata/milestones/M003/slices/S05/tasks/T05-SUMMARY.md
verification_result: passed
completed_at: 2026-03-13T22:20:00Z
proof_level: contract + integration (unit tests for pure logic; tool loads, TypeScript compiles)
---

# S05: Preferences, Onboarding & `/kata pr` Command

**`/kata pr` command family, PR preferences discoverable, auto-mode wired to PR lifecycle — 140/140 tests pass, TypeScript clean.**

## What Was Delivered

S05 completes the PR lifecycle surface and makes it adoptable without guesswork.

**T01–T02** established the contract via TDD: test suites for `pr-command.ts`, `pr-auto.ts`, and prefs status PR assertions. T02 built the pure helpers — `buildPrStatusReport`, `getPrSubcommandCompletions`, `getPrOnboardingRecommendation`, `decidePostCompleteSliceAction`, `formatPrAutoCreateFailure` — and the shared `runCreatePr` orchestrator that both the tool and auto-mode now use.

**T03** wired `/kata pr` as a top-level subcommand: `status` is deterministic (no LLM), `create/review/address/merge` dispatch via `pi.sendMessage` with prompt templates. `buildLivePrStatusDeps()` connects real accessors.

**T04** made PR lifecycle discoverable: `pr:` block seeded in preference templates and bootstrap, full field docs in `preferences-reference.md`, and GitHub remote detection + "Set up PR lifecycle" action in the `/kata` wizard.

**T05** replaced the hard-coded squash-merge in `auto.ts` with the `decidePostCompleteSliceAction` three-branch dispatch. PR-disabled projects are unchanged. PR-enabled + auto_create projects create a PR and pause cleanly. PR create failures stop auto-mode with structured diagnostics — never fall through to the legacy merge path.

## What S06 Consumes from S05

- `runCreatePr` from `pr-runner.ts` — S06 can inject Linear issue references into the PR body by passing them as options
- `pr.linear_link` preference field — S06 activates this gate
- `/kata pr` command surface — S06 may extend with Linear-specific status lines
