# S01: PR Creation & Body Composition — UAT

**Milestone:** M003
**Written:** 2026-03-12

## UAT Type

- UAT mode: mixed (artifact-driven contract tests complete; live-runtime human confirmation pending)
- Why this mode is sufficient: Contract tests prove pre-flight logic, PR body composition, and preferences round-trip. Live `gh` invocation against a real GitHub repo is the remaining human-experience step — it cannot be automated without a disposable GitHub repo and live credentials in CI.

## Preconditions

For contract tests (already passing — no action needed):
- Node.js 22+ with `--experimental-strip-types` flag available
- `npm install` run in `apps/cli/`

For live PR creation (human step):
- On branch `kata/M003/S01` (or any `kata/<M>/<S>` branch)
- `gh` CLI installed: `gh --version`
- `gh` authenticated: `gh auth status`
- `python3` installed: `python3 --version`
- `.kata/milestones/M003/slices/S01/S01-PLAN.md` present (it is)
- Remote `origin` pointing to a GitHub repo

## Smoke Test

Run the unit tests — all 7 must pass:

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  --test \
  'src/resources/extensions/kata/tests/pr-preferences.test.mjs' \
  'src/resources/extensions/kata/tests/pr-body-composer.test.ts'
```

Expected: `pass 7 / fail 0`

## Test Cases

### 1. kata_create_pr pre-flight: gh missing

1. Temporarily rename `gh` to verify the detection path:
   ```bash
   # In a subshell or mock environment where gh is not on PATH
   ```
2. Call `kata_create_pr` tool with `{ title: "test" }`
3. **Expected:** `{ ok: false, phase: "gh-missing", error: "...", hint: "Install gh CLI: https://cli.github.com" }`

### 2. kata_create_pr pre-flight: gh not authenticated

1. Ensure `gh` is installed but not authenticated (e.g. `gh auth logout`)
2. Call `kata_create_pr` tool with `{ title: "test" }`
3. **Expected:** `{ ok: false, phase: "gh-unauth", error: "...", hint: "Run: gh auth login" }`

### 3. kata_create_pr pre-flight: non-kata branch

1. Check out a branch not matching `kata/<M>/<S>` format (e.g. `main`)
2. Call `kata_create_pr` tool with no milestoneId/sliceId params
3. **Expected:** `{ ok: false, phase: "branch-parse-failed", error: "...", hint: "..." }`

### 4. kata_create_pr live PR creation

1. Ensure on branch `kata/M003/S01` with `gh` installed and authenticated
2. Call `kata_create_pr` tool with `{ title: "feat(kata): S01 PR Creation & Body Composition" }`
3. **Expected:** `{ ok: true, url: "https://github.com/<owner>/<repo>/pull/<number>" }`
4. Open the PR URL in GitHub
5. **Expected (human):** PR body contains `## What Changed`, `## Must-Haves`, and `## Tasks` sections; must-have items from `S01-PLAN.md` are visible; body is readable and useful — not a raw markdown dump

### 5. KataPrPreferences round-trip

1. Create or edit `.kata/preferences.md` to include:
   ```yaml
   pr:
     enabled: true
     auto_create: false
     base_branch: "main"
     review_on_create: false
     linear_link: false
   ```
2. Call `loadEffectiveKataPreferences()` (or run the unit test)
3. **Expected:** `preferences.pr` equals `{ enabled: true, auto_create: false, base_branch: "main", review_on_create: false, linear_link: false }`; no validation errors

### 6. PR body quality (human verification)

1. After test case 4 creates the PR, read the full PR body
2. Confirm:
   - `## What Changed` section present and references the slice goal
   - `## Must-Haves` section lists the items from `S01-PLAN.md`
   - `## Tasks` section lists T01–T04 titles
   - Body is coherent prose, not a raw YAML/frontmatter dump
3. **Expected:** Human reviewer confirms body is useful context for a code reviewer

## Edge Cases

### Preferences: malformed pr.enabled

1. Set `pr: { enabled: "yes" }` in `.kata/preferences.md`
2. Call `loadEffectiveKataPreferences()`
3. **Expected:** `errors` array contains `"pr.enabled must be a boolean"`; `preferences.pr.enabled` is undefined (field skipped, not errored-out entirely)

### Branch parsing: milestone/slice casing

1. Check out branch `kata/m001/s01` (lowercase)
2. Call `kata_create_pr` with no params
3. **Expected:** `{ ok: false, phase: "branch-parse-failed" }` — lowercase not matched by `^kata\/([A-Z]\d+)\/([A-Z]\d+)$`

### composePRBody: missing slice summary

1. Delete or rename `S01-SUMMARY.md` temporarily
2. Call `composePRBody("M003", "S01", cwd)` directly
3. **Expected:** Returns non-empty string; `## What Changed` section uses slice title as fallback instead of summary one-liner

## Failure Signals

- `npm test` shows any pr-preferences or pr-body-composer failures → T02 or T03 regression
- `npx tsc --noEmit` exits non-zero → TypeScript error introduced
- `kata_create_pr` returns `{ ok: false, phase: "artifact-error" }` → slice plan not readable; check `.kata/` path and plan format
- PR body is empty or contains only frontmatter → `parsePlan` parsing failure; inspect `S01-PLAN.md` format
- Python script fails (create-failed phase) → `error` field contains stderr; check `gh` auth and remote URL

## Requirements Proved By This UAT

- R204 — `KataPrPreferences` schema: unit tests prove all 5 fields round-trip through `loadEffectiveKataPreferences()` with correct validation and merge semantics
- R206 — PR body composition: unit tests prove `composePRBody` produces structured markdown with headings and plan content; human test case 6 proves the body is readable and useful in GitHub's PR UI

## Not Proven By This UAT

- R200 — auto-create on slice completion: the `pr.auto_create` hook is not yet wired (deferred to S05); this UAT only proves manual tool invocation
- R201, R202, R203 — reviewer dispatch, comment addressing, merge: not in scope for S01
- R205 — `/kata pr` command surface: not yet built (S05)
- R208 — Linear cross-linking: not yet built (S06)
- Live PR creation in CI: `kata_create_pr` requires real `gh` credentials and a GitHub remote — cannot be automated in the test suite; requires human execution of test case 4

## Notes for Tester

- Test cases 1–3 and 5 can be verified purely from unit tests (already passing). Only test cases 4 and 6 require a human with a live GitHub repo.
- The PR body may have minor markdown formatting differences vs. the slice plan source (e.g. `* ` vs `- ` for list items) — this is acceptable and expected from Linear's normalization behavior (D028); does not apply to the GitHub PR body itself.
- `create_pr_safe.py` uses `--body-file` to avoid shell interpolation of markdown in the body — do not attempt to replicate with `--body` flag directly; it will corrupt multi-line content.
- If the PR title is empty, `kata_create_pr` auto-generates it from the slice plan title — this is correct behavior.
