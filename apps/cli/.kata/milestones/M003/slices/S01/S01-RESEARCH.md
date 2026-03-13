# S01: PR Creation & Body Composition — Research

**Date:** 2026-03-12

## Summary

S01 delivers the foundational PR lifecycle infrastructure: a new `pr-lifecycle` extension that exposes a `kata_create_pr` tool, `gh` CLI detection and auth checking, PR body composition from slice artifacts, and two bundled Python scripts (`create_pr_safe.py`, `fetch_comments.py`). PR preferences (`pr.*`) are added to `KataPreferences`.

The codebase already has strong prior art in the `github` extension (`gh-api.ts` with `isAuthenticated`, `detectRepo`, `getCurrentBranch`, `getDefaultBranch`) and the user's existing `pull-requests` skill (`create_pr_safe.py`, `fetch_comments.py` scripts). The primary work is: (1) building the new extension with correct registration and imports, (2) the PR body composer reading slice artifacts via existing `files.ts`/`paths.ts` utilities, (3) adding `pr?` to `KataPreferences` following the `workflow`/`linear` pattern, and (4) wiring the extension into `loader.ts`.

The key constraint driving S01's design is D016: PR bodies must be created file-backed (via `--body-file`) to prevent shell interpolation corruption. The existing `create_pr_safe.py` from the user's skill is the proven solution — port it directly.

## Recommendation

Build the `pr-lifecycle` extension as a self-contained directory at `src/resources/extensions/pr-lifecycle/` following the same extension pattern as `linear`. Keep `gh` detection logic internal to the extension (no cross-extension imports from `github/gh-api.ts`) to avoid coupling. Port both Python scripts verbatim from the pull-requests skill. Add PR preferences via the `normalizeXPreferences` pattern already established for `workflow` and `linear`.

The `kata_create_pr` tool should auto-detect `milestoneId`/`sliceId` from the current branch name (format: `kata/M001/S01`), compose the PR body from disk artifacts, write it to a temp file, then invoke `create_pr_safe.py`. Return the PR URL on success, a structured error with remediation hints on failure.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Shell interpolation corruption in `gh pr create --body` | `create_pr_safe.py` — file-backed body with verify + auto-repair | D016 hardcoded requirement; proven in user's pull-requests skill |
| GraphQL comment fetching for S03 boundary | `fetch_comments.py` — paginated GraphQL with all comment types | Complex pagination logic; already correct; port as-is |
| Slice artifact parsing | `files.ts` `parseSummary`, `parsePlan`, `parseRoadmap` | Already handles legacy path variants and frontmatter; use directly |
| Slice/task path resolution | `paths.ts` `resolveSliceFile`, `resolveTaskFiles`, `resolveTasksDir` | Handles legacy descriptor directories; don't re-implement |
| YAML frontmatter parsing for preferences | `parseFrontmatterBlock` in `preferences.ts` | Stack-based nested object handler already works for `pr:` block |

## Existing Code and Patterns

- `src/resources/extensions/github/gh-api.ts` — `isAuthenticated()`, `authMethod()`, `detectRepo()`, `getCurrentBranch()`, `getDefaultBranch()`. Re-implement the minimal subset (30 lines) in `pr-lifecycle/gh-utils.ts` to avoid cross-extension coupling.
- `src/resources/extensions/kata/files.ts` — `parseSummary(content)`, `parsePlan(content)`, `loadFile(path)`. The `Summary` type has `.oneLiner`, `.frontmatter.provides`, `.title`. Use these for PR body composition.
- `src/resources/extensions/kata/paths.ts` — `resolveSlicePath()`, `resolveSliceFile()`, `resolveTasksDir()`, `resolveTaskFiles()`, `relSlicePath()`, `relTaskFile()`. All path-related lookups should go through these.
- `src/resources/extensions/kata/preferences.ts` — `KataPreferences`, `loadEffectiveKataPreferences()`, the `mergePreferences`/`validatePreferences`/`normalizeXPreferences` triad. Add `pr?: KataPrPreferences` to the interface and follow the `normalizeLinearPreferences` pattern exactly.
- `src/loader.ts` lines 104–115 — `KATA_BUNDLED_EXTENSION_PATHS` list. Add `pr-lifecycle` entry following the same pattern.
- `src/resource-loader.ts` `initResources()` — syncs `extensions/` directory recursively with `cpSync`. Scripts placed in `src/resources/extensions/pr-lifecycle/scripts/` are automatically synced to `~/.kata-cli/agent/extensions/pr-lifecycle/scripts/` at launch.
- `src/resources/extensions/kata/auto.ts` lines 989–1029 — post-completion merge block after `complete-slice`. This is the future hook point for auto-PR creation (S05). For S01, no auto.ts changes are needed — the tool is agent-callable.
- `src/resources/extensions/linear/index.ts` — minimal extension entry point pattern. Silent when unconfigured. Follow this for pr-lifecycle.
- `src/resources/extensions/kata/commands.ts` — `registerKataCommand` with `getArgumentCompletions` for subcommand routing. The `/kata pr` command is S05 scope; S01 does not register a slash command.

## Constraints

- **D016 — File-backed body required**: All PR creation must use `--body-file`, never inline `--body`. The `create_pr_safe.py` script enforces this. Any native TypeScript PR creation path must also write to a temp file.
- **`gh` CLI mandatory**: All PR operations depend on `gh` being installed and authenticated. The `kata_create_pr` tool must check both before attempting anything and return a structured error with remediation steps if either is missing.
- **Python 3 required for scripts**: `create_pr_safe.py` and `fetch_comments.py` require `python3` in PATH. The tool must verify this and provide a clear error if missing.
- **Branch convention**: Auto-detection assumes `kata/<milestoneId>/<sliceId>` format (e.g. `kata/M001/S01`). When detection fails, the tool should ask the caller to pass `milestoneId` and `sliceId` explicitly.
- **Preferences schema**: The `validatePreferences`/`mergePreferences` functions in `preferences.ts` must be updated alongside the `KataPreferences` interface. The `validatePreferences` function currently uses a whitelist approach — new `pr` fields left out of validation are silently dropped. Add `normalizePrPreferences` following the `normalizeLinearPreferences` pattern.
- **No auto.ts hook in S01**: The auto-create on slice completion is S05 scope. S01 delivers the tool and the infrastructure; the auto-wiring comes in S05.
- **File-mode only for body composition**: In Linear mode, slice artifacts live in Linear Documents. S01's PR body composer reads local `.kata/` files only. Linear-mode body composition (fetching Linear docs) is deferred — Linear-mode PR body falls back to a minimal template for now.
- **`fetch_comments.py` is S03 boundary deliverable**: The script is listed in the S01→S03 boundary map. Bundle it in S01's scripts directory even though it's not called by the `kata_create_pr` tool.

## Common Pitfalls

- **Cross-extension import from `github/gh-api.ts`**: Importing `isAuthenticated` from the github extension works at runtime (both extensions are always in agentDir), but creates a hidden coupling. If the github extension is restructured, pr-lifecycle breaks silently. Re-implement the ~30-line subset in `gh-utils.ts`.
- **Forgetting to add to `KATA_BUNDLED_EXTENSION_PATHS`**: If omitted from `loader.ts`, the extension is still auto-discovered in main sessions (via agentDir scan) but won't be available in spawned subagent processes. Add it.
- **`parseSummary` import path**: The extension imports from `../kata/files.js` (cross-extension). This is valid — the kata extension is always present. Use `.js` extension for Node ESM compatibility.
- **`parseFrontmatterBlock` is not exported**: The existing function in `preferences.ts` is internal. The pr-body-composer doesn't need it — it reads already-parsed artifact files using `parseSummary`/`parsePlan` helpers.
- **Temp file cleanup on error**: `create_pr_safe.py` already handles temp file cleanup in its `finally` block. The TypeScript wrapper that invokes it should not try to clean up what the script manages.
- **Slice summary may not exist yet**: At PR creation time, the slice might be in the "summarizing" phase where the summary hasn't been written. The PR body composer must gracefully fall back to plan+task-plans only.
- **validatePreferences silently drops unknown keys**: The current `validatePreferences` constructs a new `validated` object field by field. To preserve `pr` preferences, explicitly handle the `pr` field in both `validatePreferences` and `mergePreferences`.
- **Model config auto_supervisor passthrough**: `mergePreferences` currently has explicit spread for all known fields. The `pr` field needs its own merge entry — without it, `pr` from project preferences won't override global and vice versa.

## Open Risks

- **PR body quality for thin slices**: If a slice has no task summaries (e.g. very short slice with one task that has no one-liner), the composed body will be near-empty. This doesn't break anything, but the "PR body quality" risk from the milestone proof strategy may not be fully retired by S01 alone. Mitigation: include raw plan content as a fallback body section.
- **`gh pr create` race condition on new repos**: If the repo has no existing PRs, some `gh` versions behave differently. The `create_pr_safe.py` verification step (reading back the body) is robust, but the initial create could fail with a confusing message. Not a blocker — just document in the tool error messages.
- **Python 3 version compatibility**: The scripts use `from __future__ import annotations` and `|` union type hints (Python 3.10+). macOS ships Python 3.9 by default via Xcode tools. The scripts work on 3.9 if the type hints are strings (they are, via `from __future__ import annotations`). Verify this doesn't break on 3.9 before marking the risk retired.
- **Script path at runtime**: The pr-lifecycle extension will resolve the Python scripts relative to `import.meta.url`. At runtime, the extension runs from `~/.kata-cli/agent/extensions/pr-lifecycle/index.ts` (pi's TypeScript executor). `dirname(fileURLToPath(import.meta.url))` should resolve correctly, but this should be verified during T01 implementation.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| `gh` CLI PR creation | `pull-requests` | Already installed (`/Users/gannonhall/.agents/skills/pull-requests/`) |
| Python scripts (create_pr_safe.py, fetch_comments.py) | `pull-requests` | Already installed |

No additional skills needed for S01. The `pull-requests` skill is already in `always_use_skills` in `.kata/preferences.md`.

## Sources

- Existing `create_pr_safe.py` and `fetch_comments.py` scripts (source: `/Users/gannonhall/.agents/skills/pull-requests/scripts/`)
- Existing `creating-workflow.md` pattern (source: `/Users/gannonhall/.agents/skills/pull-requests/references/creating-workflow.md`)
- `gh-api.ts` for `isAuthenticated`/`detectRepo` patterns (source: `src/resources/extensions/github/gh-api.ts`)
- `preferences.ts` YAML parser and `normalizeLinearPreferences` pattern (source: `src/resources/extensions/kata/preferences.ts`)
- `auto.ts` post-completion merge block for future hook point (source: `src/resources/extensions/kata/auto.ts`, lines 989–1029)
- `resource-loader.ts` `initResources()` for script sync path (source: `src/resource-loader.ts`)
- `loader.ts` `KATA_BUNDLED_EXTENSION_PATHS` list (source: `src/loader.ts`, lines 104–115)
