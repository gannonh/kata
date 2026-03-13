---
estimated_steps: 4
estimated_files: 3
---

# T01: Scaffold pr-lifecycle extension and write failing tests

**Slice:** S01 — PR Creation & Body Composition
**Milestone:** M003

## Description

Create the `pr-lifecycle` extension directory with a stub entry point and write two test files that define the done condition for T02 and T03. Both tests must fail before implementation begins — one on missing export (`KataPrPreferences`), one on missing module (`pr-body-composer.ts`). Failing tests with concrete assertions are the correct state after this task.

## Steps

1. Create `src/resources/extensions/pr-lifecycle/index.ts` as a no-op stub:
   ```ts
   import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
   export default function (_pi: ExtensionAPI): void {
     // pr-lifecycle stub — replaced in T04
   }
   ```
   Create `src/resources/extensions/pr-lifecycle/scripts/` directory (add `.gitkeep`).

2. Write `src/resources/extensions/kata/tests/pr-preferences.test.mjs` following the `preferences-frontmatter.test.mjs` pattern. The test should:
   - Mock `~/.kata-cli/agent/preferences.md` with a valid YAML block containing a `pr:` section (`enabled: true`, `auto_create: false`, `base_branch: "main"`, `review_on_create: false`, `linear_link: false`)
   - Import `preferences.ts` and call `loadEffectiveKataPreferences()`
   - Assert `result.preferences.pr.enabled === true`
   - Assert `result.preferences.pr.base_branch === "main"`
   - Assert no validation errors
   This test will fail until T02 adds `KataPrPreferences` to the schema.

3. Write `src/resources/extensions/kata/tests/pr-body-composer.test.ts`. The test should:
   - Create a temp directory with a `.kata/milestones/M001/slices/S01/` structure
   - Write a minimal `S01-PLAN.md` with at least one must-have line and one task entry (`- [ ] **T01: Do the thing** \`est:30m\``)
   - Write a minimal `T01-PLAN.md` with a description and one step
   - Import `composePRBody` from `../../extensions/pr-lifecycle/pr-body-composer.js`
   - Call `await composePRBody("M001", "S01", tmpDir)`
   - Assert the result is a non-empty string
   - Assert the result contains the must-have text or the task title
   - Assert the result contains at least one markdown heading (`##`)
   This test will fail until T03 creates `pr-body-composer.ts`.

4. Run `npm test` to confirm both new tests fail cleanly (no syntax errors, no accidental passes from prior code). Verify existing tests still pass.

## Must-Haves

- [ ] `src/resources/extensions/pr-lifecycle/index.ts` exists and is valid TypeScript (no compile errors in isolation)
- [ ] `src/resources/extensions/pr-lifecycle/scripts/` directory exists
- [ ] `pr-preferences.test.mjs` exists with assertions on `pr.enabled` and `pr.base_branch`
- [ ] `pr-body-composer.test.ts` exists with fixture creation and assertions on composed output
- [ ] Both tests fail for the right reason (missing export / missing module) — not syntax errors

## Verification

- `node --import src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('stub loaded'))"` — prints `stub loaded`
- Running `npm test` shows the two new tests failing with expected errors; all existing tests still pass

## Observability Impact

- Signals added/changed: None — this task only creates scaffolding and tests
- How a future agent inspects this: Test files are self-documenting; running them shows exactly what must be true for T02 and T03 to be done
- Failure state exposed: None at runtime

## Inputs

- `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` — use as reference pattern for mocking preference files in `.mjs` tests
- `src/resources/extensions/kata/tests/parsers.test.ts` — reference for temp-directory fixture creation pattern
- `src/resources/extensions/linear/index.ts` — reference for minimal extension stub structure

## Expected Output

- `src/resources/extensions/pr-lifecycle/index.ts` — stub extension (no-op default export)
- `src/resources/extensions/pr-lifecycle/scripts/.gitkeep` — placeholder for scripts directory
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` — failing preference schema test
- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` — failing body composer test
