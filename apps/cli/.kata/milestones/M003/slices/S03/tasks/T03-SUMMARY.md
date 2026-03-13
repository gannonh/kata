---
id: T03
parent: S03
milestone: M003
provides:
  - kata_fetch_pr_comments tool registered in index.ts
  - three-stage pre-flight (gh-missing → gh-unauth → python3-missing) identical to kata_create_pr
  - script path resolution via dirname(fileURLToPath(import.meta.url)) / scripts/fetch_comments.py
  - fetch-failed error phase with raw fetch_comments.py stderr
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
key_decisions:
  - no new decisions — implementation is a strict clone of kata_create_pr pre-flight pattern
patterns_established:
  - fetch_comments.py invoked via execSync("python3 " + shellEscape(scriptPath)) with cwd; stdout JSON.parse'd; failure returns raw stderr
observability_surfaces:
  - kata_fetch_pr_comments: { ok: false, phase: "fetch-failed", error: <raw fetch_comments.py stderr> }
  - phase enum covers gh-missing, gh-unauth, python3-missing, fetch-failed
duration: ~10m
verification_result: passed
completed_at: 2026-03-13T01:53:00Z
blocker_discovered: false
---

# T03: Register `kata_fetch_pr_comments` tool

**Added `kata_fetch_pr_comments` to `index.ts` — three-stage pre-flight + `fetch_comments.py` execSync invocation with structured `{ ok, phase, error, hint }` failure surface.**

## What Happened

Added the `kata_fetch_pr_comments` tool registration to `src/resources/extensions/pr-lifecycle/index.ts` after the `kata_review_pr` block. The implementation follows the exact pre-flight pattern established by `kata_create_pr`:

1. **gh-missing** pre-flight: `isGhInstalled()` → `{ ok: false, phase: "gh-missing", ... }`
2. **gh-unauth** pre-flight: `isGhAuthenticated()` → `{ ok: false, phase: "gh-unauth", ... }`
3. **python3-missing** pre-flight: `execSync("python3 --version", PIPE)` in try/catch → `{ ok: false, phase: "python3-missing", ... }`
4. Script path resolved via `join(dirname(fileURLToPath(import.meta.url)), "scripts", "fetch_comments.py")`
5. Script run: `execSync("python3 " + shellEscape(scriptPath), { cwd, encoding: "utf8", stdio: [...] })`
6. Success: `JSON.parse(stdout)` spread into `{ ok: true, ...parsed }`
7. Failure: raw `err.stderr` cast via `NodeJS.ErrnoException & { stderr?: string }` → `{ ok: false, phase: "fetch-failed", error: stderr || String(err), hint }`

No new files were created. Only `index.ts` was modified (+92 lines).

## Verification

```
npx tsc --noEmit
```
→ no output (clean)

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"
```
→ prints `ok`

```
grep "kata_fetch_pr_comments" src/resources/extensions/pr-lifecycle/index.ts
```
→ found (comment + name property)

```
npm test
```
→ 105 tests, 104 pass, 1 fail (pre-existing `pi.addTool is not a function` smoke test — unrelated to this task, confirmed failing before this change)

## Diagnostics

- Inspect `ok` field first; if `false`, branch on `phase`:
  - `"gh-missing"` → install gh CLI
  - `"gh-unauth"` → run `gh auth login`
  - `"python3-missing"` → install Python 3
  - `"fetch-failed"` → inspect `error` for raw `fetch_comments.py` stderr (includes GitHub GraphQL errors, auth failures, Python tracebacks)
- The `hint` field on every failure provides a direct remediation action

## Deviations

None — implementation matches the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — added `kata_fetch_pr_comments` tool registration (+92 lines)
