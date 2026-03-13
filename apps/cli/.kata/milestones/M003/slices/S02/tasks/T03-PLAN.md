---
estimated_steps: 4
estimated_files: 6
---

# T03: Write 6 bundled reviewer agent definition files

**Slice:** S02 — Bundled Reviewer Subagents & Parallel Dispatch
**Milestone:** M003

## Description

Create 6 reviewer agent `.md` files in `src/resources/agents/`. Each file has YAML frontmatter (`name:`, `description:`) followed by the full reviewer system-prompt body. The content is ported verbatim from the corresponding reference files in the user's pull-requests skill. `resource-loader.ts` already syncs `src/resources/agents/` to `~/.kata-cli/agent/agents/` on every launch — no new sync wiring needed.

This satisfies R207 (bundled reviewer subagents as proper agent definitions) and D013 (bundled custom subagents, not skill-based role-play).

## Steps

1. Read `src/resources/agents/worker.md` to confirm the expected frontmatter format:
   ```
   ---
   name: worker
   description: General-purpose subagent with full capabilities, isolated context
   ---
   ```
   Replicate this exact structure (triple-dash delimiters, `name:` and `description:` keys).

2. Read each source reference file and create the corresponding agent definition:

   | Target file | Source reference | `name:` value |
   |---|---|---|
   | `src/resources/agents/pr-code-reviewer.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/code-reviewer-instructions.md` | `pr-code-reviewer` |
   | `src/resources/agents/pr-failure-finder.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/failure-finder-instructions.md` | `pr-failure-finder` |
   | `src/resources/agents/pr-test-analyzer.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/pr-test-analyzer-instructions.md` | `pr-test-analyzer` |
   | `src/resources/agents/pr-type-design-analyzer.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/type-design-analyzer-instructions.md` | `pr-type-design-analyzer` |
   | `src/resources/agents/pr-comment-analyzer.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/comment-analyzer-instructions.md` | `pr-comment-analyzer` |
   | `src/resources/agents/pr-code-simplifier.md` | `/Users/gannonhall/.agents/skills/pull-requests/references/code-simplifier-instructions.md` | `pr-code-simplifier` |

   For each file: write the frontmatter block, then a blank line, then the source file content verbatim. Do NOT summarize or shorten the reviewer instructions — the full content is the reviewer's system prompt.

   Description values (one sentence each):
   - `pr-code-reviewer`: `"Reviews code diffs for bugs, CLAUDE.md compliance, and quality issues with high precision (confidence ≥ 80 only)."`
   - `pr-failure-finder`: `"Audits error handling for silent failures, missing try/catch, inadequate user feedback, and unhandled async errors."`
   - `pr-test-analyzer`: `"Evaluates test coverage quality and identifies untested critical paths, edge cases, and error conditions."`
   - `pr-type-design-analyzer`: `"Analyzes type designs for strong invariants, encapsulation quality, and practical usefulness."`
   - `pr-comment-analyzer`: `"Identifies comment rot: inaccurate, outdated, misleading, or redundant code comments and docstrings."`
   - `pr-code-simplifier`: `"Refines code for clarity, consistency, and maintainability without altering functionality."`

3. Confirm the `name:` values in the frontmatter match exactly what `scopeReviewers` in T02 returns:
   - `pr-code-reviewer`, `pr-failure-finder`, `pr-test-analyzer`, `pr-code-simplifier`, `pr-type-design-analyzer`, `pr-comment-analyzer`
   Any mismatch means T04's `REVIEWER_INSTRUCTIONS` map lookup will return undefined at runtime.

4. Verify:
   ```bash
   ls src/resources/agents/pr-*.md | wc -l
   # expect: 6
   
   head -3 src/resources/agents/pr-code-reviewer.md
   # expect:
   # ---
   # name: pr-code-reviewer
   # description: ...
   
   # Existing agents untouched
   ls src/resources/agents/worker.md src/resources/agents/scout.md src/resources/agents/researcher.md
   ```

## Must-Haves

- [ ] 6 files created in `src/resources/agents/pr-*.md`
- [ ] Each file has `---` / `name: pr-<reviewer>` / `description: ...` / `---` frontmatter
- [ ] `name:` values exactly match what `scopeReviewers` returns (no prefix/suffix mismatch)
- [ ] Full reviewer instructions are verbatim from the reference files (not summarized)
- [ ] `worker.md`, `scout.md`, `researcher.md` are unmodified

## Verification

```bash
# Count: 6 reviewer files
ls src/resources/agents/pr-*.md | wc -l

# Check frontmatter names
grep "^name:" src/resources/agents/pr-*.md

# Existing agents still present
ls src/resources/agents/*.md | wc -l   # should be 9 (3 existing + 6 new)

# File sizes are non-trivial (full instructions, not empty stubs)
wc -l src/resources/agents/pr-*.md
```

## Observability Impact

- Signals added/changed: None at runtime — these are static files consumed by `kata_review_pr` (T04) at tool registration time
- How a future agent inspects this: `ls ~/.kata-cli/agent/agents/pr-*.md` after launch confirms sync; `cat ~/.kata-cli/agent/agents/pr-code-reviewer.md` confirms content was synced correctly
- Failure state exposed: Mismatch between `name:` in frontmatter and the reviewer ID used in `scopeReviewers` would cause T04's map lookup to return undefined — caught in T04's type check

## Inputs

- `src/resources/agents/worker.md` — frontmatter format reference
- `/Users/gannonhall/.agents/skills/pull-requests/references/code-reviewer-instructions.md` — source content for `pr-code-reviewer.md`
- `/Users/gannonhall/.agents/skills/pull-requests/references/failure-finder-instructions.md` — source for `pr-failure-finder.md`
- `/Users/gannonhall/.agents/skills/pull-requests/references/pr-test-analyzer-instructions.md` — source for `pr-test-analyzer.md`
- `/Users/gannonhall/.agents/skills/pull-requests/references/type-design-analyzer-instructions.md` — source for `pr-type-design-analyzer.md`
- `/Users/gannonhall/.agents/skills/pull-requests/references/comment-analyzer-instructions.md` — source for `pr-comment-analyzer.md`
- `/Users/gannonhall/.agents/skills/pull-requests/references/code-simplifier-instructions.md` — source for `pr-code-simplifier.md`
- `src/resource-loader.ts` — confirms `agents/` is already synced (no wiring change needed)

## Expected Output

- 6 new `.md` files in `src/resources/agents/` — each a complete reviewer subagent definition ready to be dispatched by name via the `subagent` pi tool
