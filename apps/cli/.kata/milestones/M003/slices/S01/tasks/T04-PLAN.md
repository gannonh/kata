---
estimated_steps: 5
estimated_files: 5
---

# T04: Implement `kata_create_pr` tool, port scripts, wire into loader

**Slice:** S01 — PR Creation & Body Composition
**Milestone:** M003

## Description

Replace the stub `index.ts` with the full pr-lifecycle extension that registers the `kata_create_pr` tool. Port `create_pr_safe.py` and `fetch_comments.py` verbatim from the user's `pull-requests` skill. Add the extension to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`. After this task the slice is complete: all unit tests pass, TypeScript compiles clean, and the tool is callable by the agent.

## Steps

1. Port Python scripts verbatim:
   - Copy `/Users/gannonhall/.agents/skills/pull-requests/scripts/create_pr_safe.py` → `src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py`
   - Copy `/Users/gannonhall/.agents/skills/pull-requests/scripts/fetch_comments.py` → `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py`
   - Remove the `.gitkeep` placeholder.

2. Replace `src/resources/extensions/pr-lifecycle/index.ts` with the full extension. Register `kata_create_pr` tool:

   ```ts
   import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
   import { execSync } from "node:child_process";
   import { writeFileSync, unlinkSync } from "node:fs";
   import { join, dirname } from "node:path";
   import { fileURLToPath } from "node:url";
   import { tmpdir } from "node:os";
   import { randomUUID } from "node:crypto";
   import { isGhInstalled, isGhAuthenticated, getCurrentBranch, parseBranchToSlice } from "./gh-utils.js";
   import { composePRBody } from "./pr-body-composer.js";

   export default function (pi: ExtensionAPI): void {
     pi.addTool({
       name: "kata_create_pr",
       description: "Create a GitHub PR for the current Kata slice branch...",
       parameters: { ... },
       handler: async (params) => { ... },
     });
   }
   ```

   Tool handler pre-flight checks (return structured error for each):
   - `isGhInstalled()` → `{ ok: false, phase: "gh-missing", error: "gh CLI not found in PATH", hint: "Install gh CLI: https://cli.github.com" }`
   - `isGhAuthenticated()` → `{ ok: false, phase: "gh-unauth", error: "gh CLI not authenticated", hint: "Run: gh auth login" }`
   - `python3` check via `execSync("python3 --version")` → `{ ok: false, phase: "python3-missing", error: "python3 not found in PATH", hint: "Install Python 3: https://python.org" }`

   Tool handler main flow:
   - Resolve `milestoneId`/`sliceId` from params or from `parseBranchToSlice(getCurrentBranch(cwd))`; return `{ ok: false, phase: "branch-parse-failed" }` if null
   - Call `composePRBody(milestoneId, sliceId, cwd)` → markdown string
   - Write to `join(tmpdir(), randomUUID() + ".md")`
   - Resolve script: `join(dirname(fileURLToPath(import.meta.url)), "scripts", "create_pr_safe.py")`
   - Run: `execSync("python3 " + shellEscape(scriptPath) + " --title " + shellEscape(title) + " --base " + shellEscape(baseBranch) + " --body-file " + shellEscape(tmpPath), { encoding: "utf8", stdio: ["pipe","pipe","pipe"] })`; capture stdout as PR URL
   - Return `{ ok: true, url: prUrl.trim() }`
   - In `finally`: `unlinkSync(tmpPath)` with `missing_ok` try/catch

3. Wire `loader.ts`: add `join(agentDir, "extensions", "pr-lifecycle", "index.ts")` to `KATA_BUNDLED_EXTENSION_PATHS` before the `ask-user-questions.ts` entry.

4. Run `npx tsc --noEmit` and fix any type errors.

5. Run `npm test` — all tests pass (two new, all existing). Verify `ls src/resources/extensions/pr-lifecycle/scripts/` shows both `.py` files.

## Must-Haves

- [ ] `kata_create_pr` tool registered with pi via `pi.addTool`
- [ ] All 3 pre-flight checks (gh, auth, python3) return `{ ok: false, phase, error, hint }` — never throw
- [ ] Branch auto-detection: if `milestoneId`/`sliceId` not in params, parse from current branch
- [ ] Body written to temp file (D016 — never inline `--body` to shell)
- [ ] Script path resolved relative to `import.meta.url` — not hardcoded
- [ ] Temp file cleaned up in `finally` block regardless of success or failure
- [ ] `create_pr_safe.py` and `fetch_comments.py` present verbatim in `scripts/`
- [ ] `pr-lifecycle` entry added to `KATA_BUNDLED_EXTENSION_PATHS` in `loader.ts`
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes (all existing + two new tests)

## Verification

- `npx tsc --noEmit` — exits 0
- `npm test` — exits 0, all tests pass
- `ls src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — both files present
- `grep "pr-lifecycle" src/loader.ts` — confirms entry in `KATA_BUNDLED_EXTENSION_PATHS`
- `node --import src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` — prints `ok`

## Observability Impact

- Signals added/changed: `kata_create_pr` returns a structured `{ ok, phase?, error?, hint?, url? }` result for every execution path — agent can branch on `ok` and inspect `phase` without parsing prose
- How a future agent inspects this: call `kata_create_pr` with no args on the current branch; inspect returned object; `phase` field gives the exact failure point
- Failure state exposed: `phase` enum surfaces exactly which pre-flight check failed; `hint` provides the remediation action; on `create-failed` the `error` field contains the Python script's stderr

## Inputs

- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — from T03; `isGhInstalled`, `isGhAuthenticated`, `getCurrentBranch`, `parseBranchToSlice`
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — from T03; `composePRBody`
- `/Users/gannonhall/.agents/skills/pull-requests/scripts/create_pr_safe.py` — source for verbatim port
- `/Users/gannonhall/.agents/skills/pull-requests/scripts/fetch_comments.py` — source for verbatim port
- `src/loader.ts` lines 104–115 — `KATA_BUNDLED_EXTENSION_PATHS` array to extend

## Expected Output

- `src/resources/extensions/pr-lifecycle/index.ts` — full extension with `kata_create_pr` tool
- `src/resources/extensions/pr-lifecycle/scripts/create_pr_safe.py` — verbatim port
- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — verbatim port
- `src/loader.ts` — `pr-lifecycle` entry added to `KATA_BUNDLED_EXTENSION_PATHS`
