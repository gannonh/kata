# S06: Linear Cross-linking

**Goal:** When both Linear mode and PR lifecycle are active, PRs include Linear issue references in the body (`Closes KAT-N`), and Linear issues are updated with PR URLs on creation and status changes on merge.
**Demo:** A Linear-mode project with `pr.linear_link: true` creates a PR whose body includes `Closes KAT-42` (the active slice's Linear identifier); after merge, the Linear issue's description or comment contains the PR URL.

## Must-Haves

- When `pr.linear_link` is true and workflow mode is `linear`, `composePRBody` appends a `## Linear Issues` section with `Closes <identifier>` for the active slice issue (and optionally its task sub-issues).
- Linear issue references are only injected when both `pr.linear_link: true` AND `workflow.mode: linear` are active — no references when either is disabled.
- After PR creation (via `runCreatePr` or `kata_create_pr`), the active slice's Linear issue is updated with a comment containing the PR URL.
- After PR merge (via `kata_merge_pr`), the active slice's Linear issue state is advanced to `done`.
- `/kata pr status` surfaces `linear_link` status: `active`, `disabled`, or `requires linear mode`.
- All cross-linking is best-effort: failures to update Linear never block PR creation or merge.
- Preference docs remove the "pending S06" note from `pr.linear_link`.

## Proof Level

- This slice proves: integration
- Real runtime required: no (mocked Linear client in tests)
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/linear-crosslink.test.ts'`
- `npm test`
- `npx tsc --noEmit`
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "Promise.all([import('./src/resources/extensions/kata/index.ts'), import('./src/resources/extensions/pr-lifecycle/index.ts')]).then(() => console.log('ok'))"`

## Observability / Diagnostics

- Runtime signals: Linear update success/failure logged as structured result in tool return values (`linearComment: "added" | "failed" | "skipped"`, `linearStateAdvance: "done" | "failed" | "skipped"`).
- Inspection surfaces: `/kata pr status` shows `linear_link` configuration state; tool return values include Linear cross-link results.
- Failure visibility: Linear API errors are captured in result objects, never swallowed silently — but also never block the PR operation.
- Redaction constraints: Linear API keys are never logged; issue identifiers (KAT-42) and PR URLs are safe to surface.

## Integration Closure

- Upstream surfaces consumed: `composePRBody` from `pr-body-composer.ts`; `runCreatePr` from `pr-runner.ts`; `kata_merge_pr` handler in `pr-lifecycle/index.ts`; `LinearClient` from `linear/linear-client.ts`; `loadEffectiveKataPreferences` and `KataPrPreferences` from `kata/preferences.ts`; `isLinearMode`, `loadEffectiveLinearProjectConfig` from `kata/linear-config.ts`; `buildPrStatusReport` from `kata/pr-command.ts`.
- New wiring introduced in this slice: `linear-crosslink.ts` pure helpers; `composePRBody` accepts optional Linear references parameter; `kata_create_pr` and `kata_merge_pr` handlers call cross-linking helpers after their primary operations; `/kata pr status` extended with `linear_link` line.
- What remains before the milestone is truly usable end-to-end: nothing — S06 is the final slice.

## Tasks

- [x] **T01: Write failing tests for Linear cross-linking helpers** `est:30m`
  - Why: Establishes the concrete contract before any implementation lands. Tests pin the PR body injection, Linear comment posting, and status advance logic.
  - Files: `src/resources/extensions/kata/tests/linear-crosslink.test.ts`
  - Do: Create test file importing from a not-yet-existing `../linear-crosslink.js`. Test `buildLinearReferencesSection()` (returns markdown section with `Closes KAT-N` lines from issue identifiers), `resolveSliceLinearIdentifier()` (resolves the active slice issue identifier from preferences + Linear client), and `shouldCrossLink()` (returns true only when both `pr.linear_link` and linear mode are active). Keep initial failure at MODULE_NOT_FOUND.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/linear-crosslink.test.ts'` fails with MODULE_NOT_FOUND.
  - Done when: tests exist, are discovered, and fail for the right reason.

- [x] **T02: Implement cross-linking helpers and wire into PR body composition** `est:1h`
  - Why: This is the core logic — pure helpers that resolve Linear identifiers, build reference sections, and post-operation updates. Wiring into `composePRBody` makes PR bodies include Linear references.
  - Files: `src/resources/extensions/kata/linear-crosslink.ts`, `src/resources/extensions/pr-lifecycle/pr-body-composer.ts`
  - Do: Create `linear-crosslink.ts` with: `shouldCrossLink(prPrefs, workflowMode)` → boolean; `buildLinearReferencesSection(identifiers: string[])` → markdown string; `resolveSliceLinearIdentifier(client, config)` → `string | null` (calls `kata_list_slices` equivalent to find active slice issue identifier); `postPrLinkComment(client, issueId, prUrl)` → `{ok}` (adds a comment to the Linear issue with the PR URL); `advanceSliceIssueState(client, issueId, teamId)` → `{ok}` (advances issue to done state). Extend `composePRBody` to accept an optional `linearReferences?: string[]` parameter — when provided, appends the references section. Make T01 tests pass.
  - Verify: `linear-crosslink.test.ts` passes; `npm test` stays green; `npx tsc --noEmit` exits 0.
  - Done when: pure helpers exist and are test-covered; `composePRBody` can include Linear references when given them.

- [x] **T03: Wire cross-linking into PR creation and merge tool handlers** `est:1h`
  - Why: The helpers from T02 need to be called at the right points in the PR lifecycle — after PR creation (post comment to Linear) and after merge (advance issue state).
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`, `src/resources/extensions/pr-lifecycle/pr-runner.ts`, `src/resources/extensions/kata/pr-command.ts`, `src/resources/extensions/kata/docs/preferences-reference.md`, `src/resources/extensions/kata/templates/preferences.md`
  - Do: In `kata_create_pr` handler (or `runCreatePr`): when `shouldCrossLink()` is true, resolve the slice's Linear identifier, pass it to `composePRBody` as `linearReferences`, and after successful creation call `postPrLinkComment()`. In `kata_merge_pr` handler: when `shouldCrossLink()` is true, call `advanceSliceIssueState()` after successful merge. Add `linearComment` and `linearStateAdvance` fields to the tool return values. Extend `buildPrStatusReport` to include `linear_link` status line. Remove "pending S06" notes from preference docs and templates. All Linear operations are best-effort — failures are reported in return values but never block the PR operation.
  - Verify: `linear-crosslink.test.ts` passes; `npm test` stays green; `npx tsc --noEmit` exits 0; extension loads successfully.
  - Done when: PR creation includes Linear references in body and comments on the issue; merge advances the issue state; status surfaces `linear_link` config; all operations are non-blocking on Linear failure.

## Files Likely Touched

- `src/resources/extensions/kata/linear-crosslink.ts`
- `src/resources/extensions/kata/tests/linear-crosslink.test.ts`
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts`
- `src/resources/extensions/pr-lifecycle/pr-runner.ts`
- `src/resources/extensions/pr-lifecycle/index.ts`
- `src/resources/extensions/kata/pr-command.ts`
- `src/resources/extensions/kata/docs/preferences-reference.md`
- `src/resources/extensions/kata/templates/preferences.md`
