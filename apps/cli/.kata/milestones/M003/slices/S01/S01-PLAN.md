# S01: PR Creation & Body Composition

**Goal:** Deliver the foundational pr-lifecycle extension: `kata_create_pr` tool, `gh` detection, PR body composition from slice artifacts, bundled `create_pr_safe.py` and `fetch_comments.py` scripts, and the `KataPrPreferences` schema.

**Demo:** From a `kata/M003/S01` branch with `.kata/` artifacts present:
- `kata_create_pr` tool detects `gh` presence and auth, composes a PR body from slice plan + task summaries, invokes `create_pr_safe.py --body-file <temp>`, and returns the PR URL — or a structured error with a remediation hint when `gh` is missing, unauthenticated, or `python3` is absent.
- Preferences YAML block `pr: { enabled: true, base_branch: "main" }` round-trips through `loadEffectiveKataPreferences()` with no validation errors.
- Unit tests for body composition and preferences parsing pass; TypeScript compiles clean.

## Must-Haves

- `src/resources/extensions/pr-lifecycle/` extension directory, entry point wired into `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`
- `kata_create_pr` tool: auto-detects `milestoneId`/`sliceId` from branch name (`kata/<M>/<S>`), composes PR body from slice artifacts, writes body to temp file, invokes `create_pr_safe.py` (D016 — file-backed body, never inline `--body`)
- `gh` detection + auth check before any PR operation; structured `{ ok: false, error, hint }` on failure
- `python3` presence check before invoking scripts; structured error if missing
- PR body composer reads: slice plan (title, must-haves, task list), task summary one-liners (if written), slice summary (graceful fallback if absent); raw plan content used as fallback for thin slices
- `create_pr_safe.py` and `fetch_comments.py` bundled verbatim in `scripts/` (S03 boundary deliverable)
- `KataPrPreferences` interface (`enabled`, `auto_create`, `base_branch`, `review_on_create`, `linear_link`) + `normalizePrPreferences` + updated `validatePreferences` + updated `mergePreferences` in `preferences.ts`
- Unit tests: `pr-preferences.test.mjs` and `pr-body-composer.test.ts` both pass

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (tests are fixture-based; real `gh` invocation is UAT)
- Human/UAT required: yes — user confirms PR body is readable and useful in GitHub's PR UI

## Verification

- `npm test` — runs `pr-preferences.test.mjs` and `pr-body-composer.test.ts`; both pass with zero failures
- `npx tsc --noEmit` — compiles clean with no errors
- `ls src/resources/extensions/pr-lifecycle/scripts/` — `create_pr_safe.py` and `fetch_comments.py` present
- `node -e "import('./src/resources/extensions/pr-lifecycle/index.ts')"` with resolve-ts hook — loads without error

## Observability / Diagnostics

- Runtime signals: `kata_create_pr` returns `{ ok: false, error: string, hint: string, phase: string }` for every pre-flight failure; `phase` distinguishes `gh-missing | gh-unauth | python3-missing | branch-parse-failed | artifact-error | create-failed`
- Inspection surfaces: the tool's error object is machine-readable; agent can inspect `phase` to route to the right remediation without parsing prose
- Failure visibility: each failure path surfaces the failing check, what was expected, and a concrete hint (e.g. "Install gh CLI: https://cli.github.com" or "Run: gh auth login")
- Redaction constraints: none — no secrets involved in PR creation pre-flight or body composition

## Integration Closure

- Upstream surfaces consumed: `kata/files.ts` (`parsePlan`, `parseSummary`, `loadFile`), `kata/paths.ts` (`resolveSlicePath`, `resolveSliceFile`, `resolveTaskFiles`, `resolveTasksDir`), `kata/preferences.ts` (`loadEffectiveKataPreferences`)
- New wiring introduced in this slice: `pr-lifecycle` entry point added to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`; `cpSync` in `resource-loader.ts` auto-syncs `scripts/` to agentDir at launch
- What remains before the milestone is truly usable end-to-end: S02 (parallel reviewer subagents), S03 (address comments workflow), S04 (merge + branch cleanup), S05 (`/kata pr` slash command + auto-create hook)

## Tasks

- [x] **T01: Scaffold pr-lifecycle extension and write failing tests** `est:45m`
  - Why: Establishes the test targets (both test files must exist with concrete assertions before any implementation begins) and the extension directory. T02–T04 have an unambiguous done condition.
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`, `src/resources/extensions/kata/tests/pr-preferences.test.mjs`, `src/resources/extensions/kata/tests/pr-body-composer.test.ts`
  - Do: Create `src/resources/extensions/pr-lifecycle/` with a stub `index.ts` that exports a no-op default function (typed as `ExtensionAPI → void`). Create `scripts/` subdirectory. Write `pr-preferences.test.mjs` following the `preferences-frontmatter.test.mjs` pattern: mock a `.kata/preferences.md` file containing a `pr:` block with all five fields (`enabled: true`, `auto_create: false`, `base_branch: "main"`, `review_on_create: false`, `linear_link: false`) and assert `loadEffectiveKataPreferences().preferences.pr` equals the expected object — this test fails until T02. Write `pr-body-composer.test.ts`: create a temp `.kata/milestones/M001/slices/S01/` tree with a minimal `S01-PLAN.md` (one must-have, one task entry) and a minimal `T01-PLAN.md` task summary, import `composePRBody` from `../../extensions/pr-lifecycle/pr-body-composer.js`, call it with `("M001", "S01", tmpDir)`, and assert the result contains the must-have text and at least one heading — this test fails until T03.
  - Verify: Both test files exist and fail with module-not-found or assertion errors (not syntax errors) when `npm test -- --test-name-pattern "pr-"` is run
  - Done when: Stub extension + both test files exist; tests fail cleanly (no syntax errors, no accidental passes)

- [x] **T02: Add `KataPrPreferences` schema to `preferences.ts`** `est:45m`
  - Why: Without the schema, `pr:` blocks in `.kata/preferences.md` are silently dropped by the whitelist-based `validatePreferences`. This is the prerequisite for any PR preference-reading in T04.
  - Files: `src/resources/extensions/kata/preferences.ts`
  - Do: Add `export interface KataPrPreferences { enabled?: boolean; auto_create?: boolean; base_branch?: string; review_on_create?: boolean; linear_link?: boolean; }`. Add `pr?: KataPrPreferences` field to `KataPreferences`. Add `function normalizePrPreferences(value: unknown): { value?: KataPrPreferences; errors: string[] }` — validates `enabled/auto_create/review_on_create/linear_link` as booleans, `base_branch` as a non-empty string, following the `normalizeLinearPreferences` pattern exactly. In `validatePreferences`, call `normalizePrPreferences(preferences.pr)` and conditionally set `validated.pr`. In `mergePreferences`, add the `pr` spread block: `...(base.pr || override.pr ? { pr: { ...(base.pr ?? {}), ...(override.pr ?? {}) } } : {})`.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-preferences.test.mjs'` — all assertions pass
  - Done when: `pr-preferences.test.mjs` passes; `npx tsc --noEmit` clean on `preferences.ts`

- [x] **T03: Build `gh-utils.ts` and `pr-body-composer.ts`** `est:1h`
  - Why: These two modules provide the pre-flight check primitives and artifact-reading logic that `kata_create_pr` (T04) calls. They are extracted into separate files so T04 can import them cleanly and tests can exercise them in isolation.
  - Files: `src/resources/extensions/pr-lifecycle/gh-utils.ts`, `src/resources/extensions/pr-lifecycle/pr-body-composer.ts`
  - Do: In `gh-utils.ts` implement: `isGhInstalled(): boolean` (attempts `execSync("gh --version", { stdio: ['pipe','pipe','pipe'] })`, returns false on throw), `isGhAuthenticated(): boolean` (`gh auth status`), `parseBranchToSlice(branch: string): { milestoneId: string; sliceId: string } | null` (regex match `^kata\/([A-Z]\d+)\/([A-Z]\d+)$`), `getCurrentBranch(cwd: string): string | null` (`git rev-parse --abbrev-ref HEAD`), `detectGitHubRepo(cwd: string): { owner: string; repo: string } | null` (parses `git remote get-url origin` for github.com SSH or HTTPS). All use `execSync` with `stdio: ['pipe','pipe','pipe']`; never throw — return `null`/`false` on error. In `pr-body-composer.ts` implement `composePRBody(milestoneId: string, sliceId: string, cwd: string): Promise<string>` — import `resolveSliceFile`, `resolveTaskFiles` from `../kata/paths.js` and `parsePlan`, `parseSummary`, `loadFile` from `../kata/files.js`; read slice plan to get title and must-haves list; read task plans to collect titles; read slice summary (one-liner) if present; compose output with `## What Changed`, `## Must-Haves`, `## Tasks` sections using the parsed data; include raw task plan titles as fallback if summaries absent; return complete markdown string (non-empty even for thin slices).
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-body-composer.test.ts'` — all assertions pass
  - Done when: `pr-body-composer.test.ts` passes; both modules compile with no TypeScript errors

- [x] **T04: Implement `kata_create_pr` tool, port scripts, wire into loader** `est:1h`
  - Why: Completes S01 — the agent now has a callable tool that performs the full PR creation flow end-to-end, and the extension is wired so subagent child processes also receive it.
  - Files: `src/resources/extensions/pr-lifecycle/index.ts`, `src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py`, `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py`, `src/loader.ts`
  - Do: Replace the stub `index.ts` with the full extension. Register one tool `kata_create_pr` via `pi.addTool({ name: "kata_create_pr", description: "...", parameters: { title?: string, milestoneId?: string, sliceId?: string, baseBranch?: string }, handler: async (params) => { ... } })`. Tool handler: (1) detect `cwd` from `process.cwd()`; (2) check `isGhInstalled()` → return `{ ok: false, phase: "gh-missing", error: "gh CLI not found", hint: "Install gh CLI: https://cli.github.com" }` if false; (3) check `isGhAuthenticated()` → `{ ok: false, phase: "gh-unauth", ... }`; (4) check `python3` via `execSync("python3 --version")` → `{ ok: false, phase: "python3-missing", ... }`; (5) resolve milestoneId/sliceId from params or `parseBranchToSlice(getCurrentBranch(cwd))`; (6) call `composePRBody(milestoneId, sliceId, cwd)`; (7) write body to `os.tmpdir()/<uuid>.md`; (8) resolve script path via `join(dirname(fileURLToPath(import.meta.url)), "scripts", "create_pr_safe.py")`; (9) run `execSync("python3 " + scriptPath + " --title ... --base ... --body-file " + tmpPath)`, capture stdout as URL; (10) unlink tmpFile in finally; (11) return `{ ok: true, url }`. Port `create_pr_safe.py` and `fetch_comments.py` verbatim from `/Users/gannonhall/.agents/skills/pull-requests/scripts/` into `scripts/`. In `loader.ts`, add `join(agentDir, "extensions", "pr-lifecycle", "index.ts")` to the `KATA_BUNDLED_EXTENSION_PATHS` array before `ask-user-questions.ts`.
  - Verify: `npx tsc --noEmit` passes; `ls src/resources/extensions/pr-lifecycle/scripts/` shows both Python files; `node --import src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` prints `ok`; `npm test` passes all tests
  - Done when: TypeScript compiles clean; both Python scripts present; `kata_create_pr` tool registered; loader wired; all unit tests pass

## Files Likely Touched

- `src/resources/extensions/pr-lifecycle/index.ts` (new)
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` (new)
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` (new)
- `src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py` (new — ported verbatim)
- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` (new — ported verbatim)
- `src/resources/extensions/kata/preferences.ts` (modified — `KataPrPreferences` + normalize/validate/merge)
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` (new)
- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` (new)
- `src/loader.ts` (modified — add pr-lifecycle to `KATA_BUNDLED_EXTENSION_PATHS`)
