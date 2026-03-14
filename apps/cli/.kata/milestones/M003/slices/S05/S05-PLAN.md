# S05: Preferences, Onboarding & `/kata pr` Command

**Goal:** Expose the PR lifecycle as a first-class Kata user loop: users can inspect PR readiness/config via deterministic status, run all PR operations from `/kata pr`, enable PR lifecycle in project preferences without manual guesswork, and have auto-mode create a PR instead of bypassing the workflow when `pr.auto_create` is enabled.

**Demo:** In a GitHub-backed Kata project, the user runs `/kata pr status` and sees repo/auth/branch/PR/preference health; `/kata pr create|review|address|merge` routes into the existing S01–S04 workflows; `/kata` onboarding offers PR setup when a GitHub remote is present; and after a slice completes in auto-mode with `pr.enabled: true` + `pr.auto_create: true`, Kata creates the PR and pauses for review/merge instead of squash-merging directly to main.

## Must-Haves

- `/kata pr` is a discoverable subcommand family with `create`, `review`, `address`, `merge`, and `status` entries; completions and usage text match the implemented surface.
- `/kata pr status` is deterministic and non-LLM: it reports GitHub remote detection, gh install/auth state, current branch/slice context, open PR presence, and active `pr.*` preferences, including that `pr.linear_link` remains pending until S06.
- Mutating `/kata pr` subcommands dispatch the existing S01–S04 workflows instead of duplicating GitHub logic; `create` honors `pr.base_branch` and can chain immediately into review when `pr.review_on_create` is true.
- Project preference surfaces (`templates/preferences.md`, `ensurePreferences()`, docs, status output) expose `pr.enabled`, `pr.auto_create`, `pr.base_branch`, `pr.review_on_create`, and `pr.linear_link` with sane defaults and actionable guidance.
- `/kata` onboarding detects a GitHub remote and offers PR lifecycle setup when PR preferences are missing or disabled; setup edits project preferences on the user's behalf rather than telling them to figure it out manually.
- Auto-mode no longer bypasses the PR lifecycle when PR auto-create is enabled: after `complete-slice`, Kata creates the PR from the slice branch, surfaces success/failure deterministically, and pauses instead of squash-merging to main. Legacy squash-merge behavior remains unchanged when PR lifecycle is disabled.

## Proof Level

- This slice proves: integration
- Real runtime required: no
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts' 'src/resources/extensions/kata/tests/pr-auto.test.ts'`
- `npm test`
- `npx tsc --noEmit`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "Promise.all([import('./src/resources/extensions/kata/index.ts'), import('./src/resources/extensions/pr-lifecycle/index.ts')]).then(() => console.log('ok'))"`

## Observability / Diagnostics

- Runtime signals: `/kata pr status` becomes the canonical PR lifecycle inspection surface; existing `kata_create_pr`, `kata_review_pr`, `kata_fetch_pr_comments`, and `kata_merge_pr` phase enums remain the authoritative mutation diagnostics.
- Inspection surfaces: `/kata pr status`, `/kata prefs status`, auto-mode pause notifications after PR auto-create, and `STATE.md` next-action updates when a slice is waiting for review/merge.
- Failure visibility: status output must distinguish `no-github-remote`, `gh-missing`, `gh-unauth`, `not-on-slice-branch`, `no-open-pr`, `auto-create-disabled`, and `linear-link-pending-s06` without prose-only interpretation.
- Redaction constraints: status surfaces may show owner/repo, branch name, PR number, and preference booleans; they must never echo tokens, auth secrets, or raw credential material.

## Integration Closure

- Upstream surfaces consumed: `KataPrPreferences` in `preferences.ts`; `detectGitHubRepo`, `getCurrentBranch`, and `parseBranchToSlice` in `pr-lifecycle/gh-utils.ts`; `kata_create_pr`, `kata_review_pr`, `kata_fetch_pr_comments`, `kata_resolve_thread`, `kata_reply_to_thread`, and `kata_merge_pr`; auto-mode's `complete-slice` post-processing seam in `kata/auto.ts`.
- New wiring introduced in this slice: deterministic PR status helpers; `/kata pr` command routing + prompt dispatch; onboarding/setup actions in `/kata`; auto-mode PR auto-create gate and pause behavior.
- What remains before the milestone is truly usable end-to-end: S06 still has to wire Linear cross-linking (`pr.linear_link`) and update Linear issues with PR URLs/status. Live GitHub smoke/UAT is still advisable before calling the milestone fully validated.

## Tasks

- [x] **T01: Write failing tests for PR command routing and auto-create decisions** `est:45m`
  - Why: Establishes the concrete stopping condition for the slice before any wiring changes land. The tests pin the command surface, deterministic status report, and auto-create gating rules so later tasks can refactor safely.
  - Files: `src/resources/extensions/kata/tests/pr-command.test.ts`, `src/resources/extensions/kata/tests/pr-auto.test.ts`, `src/resources/extensions/kata/tests/prefs-status.test.ts`
  - Do: Add `pr-command.test.ts` with a top-level import of the not-yet-existing `../pr-command.js` and assertions for `/kata pr` completions, usage parsing, and deterministic status formatting. Add `pr-auto.test.ts` with a top-level import of the not-yet-existing `../pr-auto.js` and assertions for the slice-completion decision matrix (`PR disabled` → squash merge, `PR enabled + auto_create` → create PR + pause, `create failed` → stop/pause with diagnostics). Extend `prefs-status.test.ts` so PR config lines become part of the canonical prefs-status contract. Keep the initial failure mode at MODULE_NOT_FOUND or assertion failure — not syntax errors.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts' 'src/resources/extensions/kata/tests/pr-auto.test.ts'` fails cleanly before implementation.
  - Done when: the new tests exist, are discovered by the runner, and fail for the missing helpers/behavior they are meant to define.

- [x] **T02: Extract shared PR status and orchestration helpers** `est:1h`
  - Why: S05 needs one deterministic seam that both the slash command and auto-mode can reuse. Without that seam, the command layer would duplicate logic from the existing tools and drift from their behavior.
  - Files: `src/resources/extensions/kata/pr-command.ts`, `src/resources/extensions/kata/pr-auto.ts`, `src/resources/extensions/pr-lifecycle/pr-runner.ts`, `src/resources/extensions/pr-lifecycle/index.ts`, `src/resources/extensions/pr-lifecycle/gh-utils.ts`
  - Do: Create `pr-command.ts` with pure helpers for `/kata pr` completions, status gathering, and formatting. Create `pr-auto.ts` with pure decision helpers for post-`complete-slice` behavior and pause reasons. Extract the existing PR creation logic from `pr-lifecycle/index.ts` into `pr-runner.ts` so both the tool handler and auto-mode can call the same deterministic implementation. Reuse the existing gh-utils primitives instead of re-shelling from new call sites. Make the new tests from T01 pass without regressing the S01–S04 tool contracts.
  - Verify: targeted `pr-command` / `pr-auto` tests pass; existing `pr-preferences`, `pr-body-composer`, `pr-review`, `pr-address`, and `pr-merge` tests still pass.
  - Done when: the shared helpers exist, `kata_create_pr` is refactored onto the shared runner, and status/auto decisions are test-covered instead of being embedded ad hoc in handlers.

- [x] **T03: Add `/kata pr` subcommands and dispatch into the existing workflows** `est:1h`
  - Why: This is the real user-facing slice outcome. Without it, the milestone still depends on hidden tools instead of a coherent Kata command surface.
  - Files: `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/prompts/pr-create.md`, `src/resources/extensions/kata/prompts/pr-review.md`, `src/resources/extensions/kata/prompts/pr-address.md`, `src/resources/extensions/kata/prompts/pr-merge.md`
  - Do: Extend `/kata` completions so `pr` behaves like a nested command family and exposes `create`, `review`, `address`, `merge`, and `status`. Implement `handlePr(...)` in `commands.ts`: `status` should render deterministic status directly via the helper from T02; the mutating subcommands should dispatch hidden prompts that tell the agent to call the existing tools, with the user's slash-command invocation treated as explicit permission for the outward GitHub action. The `create` path must thread through `pr.base_branch` and, when `pr.review_on_create` is true, automatically continue into the review prompt after successful creation rather than stopping at the URL.
  - Verify: `pr-command.test.ts` passes; `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "Promise.all([import('./src/resources/extensions/kata/index.ts'), import('./src/resources/extensions/pr-lifecycle/index.ts')]).then(() => console.log('ok'))"` prints `ok`.
  - Done when: `/kata pr` is discoverable, all five subcommands route correctly, and the command surface reuses S01–S04 implementations instead of reimplementing GitHub behavior.

- [ ] **T04: Surface PR setup in preferences, status, and onboarding** `est:1h`
  - Why: The PR lifecycle is not actually adoptable until a user can discover it, inspect it, and enable it without reverse-engineering the preferences schema.
  - Files: `src/resources/extensions/kata/templates/preferences.md`, `src/resources/extensions/kata/gitignore.ts`, `src/resources/extensions/kata/docs/preferences-reference.md`, `src/resources/extensions/kata/guided-flow.ts`, `src/resources/extensions/kata/pr-command.ts`
  - Do: Add a documented `pr:` block with defaults to both the canonical preferences template and the bootstrap template in `ensurePreferences()`. Update the preferences reference docs and deterministic status formatter so `pr.enabled`, `pr.auto_create`, `pr.base_branch`, `pr.review_on_create`, and `pr.linear_link` are inspectable. In `guided-flow.ts`, detect GitHub remotes and offer a PR setup action when the repo is GitHub-backed but PR lifecycle is not configured; the action should edit project preferences directly (for example, seed a default `pr:` block) instead of just telling the user to do it later.
  - Verify: `prefs-status.test.ts` and `pr-command.test.ts` pass; `/kata pr status` output includes the configured PR block and the onboarding recommendation disappears once PR setup is enabled.
  - Done when: new projects get a discoverable PR configuration path, and existing projects can inspect whether PR lifecycle is configured or still pending.

- [ ] **T05: Gate auto-mode slice completion through PR creation when enabled** `est:1h`
  - Why: This is the requirement-closing integration for R200. As long as auto-mode keeps squash-merging completed slice branches directly to main, the PR lifecycle is optional ceremony instead of the real workflow.
  - Files: `src/resources/extensions/kata/auto.ts`, `src/resources/extensions/kata/pr-auto.ts`, `src/resources/extensions/pr-lifecycle/pr-runner.ts`, `src/resources/extensions/kata/tests/pr-auto.test.ts`
  - Do: Replace the unconditional post-`complete-slice` squash merge in `auto.ts` with the decision helper from T02. When PR lifecycle is disabled, keep the current `switchToMain()` + `mergeSliceToMain()` path unchanged. When `pr.enabled && pr.auto_create`, call the shared PR runner on the slice branch after summary/UAT/commit, surface structured success or failure, and pause auto-mode so the PR can be reviewed and merged explicitly. On create failure, stop or pause with the exact diagnostic from the shared runner rather than falling through to the legacy merge path.
  - Verify: `pr-auto.test.ts` passes; `npm test` stays green; `npx tsc --noEmit` exits 0.
  - Done when: a PR-enabled project no longer bypasses PR creation in auto-mode, and the resulting wait-for-review/merge state is inspectable from status surfaces instead of hidden in logs.

## Files Likely Touched

- `src/resources/extensions/kata/commands.ts`
- `src/resources/extensions/kata/pr-command.ts`
- `src/resources/extensions/kata/pr-auto.ts`
- `src/resources/extensions/kata/guided-flow.ts`
- `src/resources/extensions/kata/tests/pr-command.test.ts`
- `src/resources/extensions/kata/tests/pr-auto.test.ts`
- `src/resources/extensions/kata/tests/prefs-status.test.ts`
- `src/resources/extensions/kata/templates/preferences.md`
- `src/resources/extensions/kata/docs/preferences-reference.md`
- `src/resources/extensions/pr-lifecycle/pr-runner.ts`
- `src/resources/extensions/pr-lifecycle/index.ts`
- `src/resources/extensions/kata/prompts/pr-create.md`
- `src/resources/extensions/kata/prompts/pr-review.md`
- `src/resources/extensions/kata/prompts/pr-address.md`
- `src/resources/extensions/kata/prompts/pr-merge.md`
- `src/resources/extensions/kata/auto.ts`
