---
estimated_steps: 4
estimated_files: 1
---

# T03: Register `kata_fetch_pr_comments` tool

**Slice:** S03 — Address Review Comments
**Milestone:** M003

## Description

Add the `kata_fetch_pr_comments` tool registration to `src/resources/extensions/pr-lifecycle/index.ts`. This tool runs the already-bundled `fetch_comments.py` script via execSync and returns its parsed JSON output. Pre-flight checks and failure handling follow the exact same pattern as `kata_create_pr`.

No new files needed — only `index.ts` is modified.

## Steps

1. In `index.ts`, add the `kata_fetch_pr_comments` tool after the `kata_review_pr` registration block (before the closing `}` of `export default function(pi)`). Tool params: `{ cwd?: string }`.

2. Implement pre-flight sequence in the handler (identical order to `kata_create_pr`):
   - `if (!isGhInstalled())` → return `{ ok: false, phase: "gh-missing", error: "gh CLI not found in PATH", hint: "Install gh CLI: https://cli.github.com" }`
   - `if (!isGhAuthenticated())` → return `{ ok: false, phase: "gh-unauth", error: "gh CLI not authenticated", hint: "Run: gh auth login" }`
   - `try { execSync("python3 --version", { stdio: ["pipe","pipe","pipe"], encoding: "utf8" }) } catch { return { ok: false, phase: "python3-missing", error: "python3 not found in PATH", hint: "Install Python 3: https://python.org" } }`

3. Resolve the script path: `const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "scripts", "fetch_comments.py")`. Run the script:
   ```typescript
   const stdout = execSync("python3 " + shellEscape(scriptPath), {
     cwd: cwd ?? process.cwd(),
     encoding: "utf8",
     stdio: ["pipe", "pipe", "pipe"],
   });
   ```
   Parse: `const parsed = JSON.parse(stdout) as Record<string, unknown>`.

4. Return `{ ok: true, ...parsed }` on success. Wrap the execSync + JSON.parse in try/catch: on error, extract stderr from `err.stderr` (cast via `(err as NodeJS.ErrnoException & { stderr?: string }).stderr`) and return:
   ```typescript
   { ok: false, phase: "fetch-failed", error: stderr || String(err), hint: "Ensure the current branch has an open PR and gh is authenticated." }
   ```

## Must-Haves

- [ ] `kata_fetch_pr_comments` registered via `pi.addTool` in `index.ts`
- [ ] Three pre-flight checks in order: gh-missing, gh-unauth, python3-missing
- [ ] Script path resolved via `dirname(fileURLToPath(import.meta.url))`
- [ ] `fetch-failed` phase returned with raw stderr on script failure
- [ ] TypeScript compiles clean after this change

## Verification

- `npx tsc --noEmit` → exits 0
- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`
- `grep "kata_fetch_pr_comments" src/resources/extensions/pr-lifecycle/index.ts` → found
- `npm test` → all tests still pass (no regressions)

## Observability Impact

- Signals added/changed: `kata_fetch_pr_comments` adds `phase: "fetch-failed"` with raw Python stderr — same diagnostic richness as `kata_create_pr`'s `"create-failed"` phase
- How a future agent inspects this: inspect `ok` field; branch on `phase`; read `error` for raw `fetch_comments.py` stderr (includes GitHub API errors, Python tracebacks, auth failures)
- Failure state exposed: `fetch_comments.py` stderr is surfaced verbatim — GraphQL errors, pagination failures, and `gh auth` issues are all visible

## Inputs

- `src/resources/extensions/pr-lifecycle/index.ts` — existing file; `kata_create_pr` handler is the pre-flight pattern to follow
- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — `isGhInstalled`, `isGhAuthenticated` already imported
- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — already bundled from S01; script accepts no args and reads PR from current git context

## Expected Output

- `src/resources/extensions/pr-lifecycle/index.ts` — modified with `kata_fetch_pr_comments` tool added; TypeScript clean; existing tests unaffected
