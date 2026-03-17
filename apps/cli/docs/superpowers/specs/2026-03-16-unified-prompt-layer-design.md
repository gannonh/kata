# Unified Prompt Layer

**Status:** Draft
**Date:** 2026-03-16
**Scope:** `apps/cli/src/resources/extensions/kata/` — prompt templates, file-backend, linear-backend

## Problem

The backend interface extraction (2026-03-15) eliminated `isLinearMode()` forks in the orchestrator. But prompt building was left asymmetric:

- **FileBackend:** 10 `_build*Prompt()` methods that call `loadPrompt()` with `.md` templates + inlined file content. Rich agent instructions (debugging discipline, blocker discovery, observability, verification).
- **LinearBackend:** 10 `_build*Prompt()` methods that build prompts as inline TypeScript string arrays. Instructions are a partial copy of the file-backend's, missing features, and diverging over time.

Two separate prompt systems means behavioral drift, double maintenance, and no path to new backends without copy-pasting ~420 lines of inline strings.

## Goal

One set of markdown templates, one set of agent instructions. Backends inject I/O-specific operations via three template variables. Adding a new backend requires implementing storage methods and one ops-block helper — zero template changes.

## Design

### Three Backend-Injected Variables

Every phase template receives three vars that encapsulate all backend-specific I/O instructions:

- **`{{backendRules}}`** — hard constraints the agent must follow. Linear: "never use bash to find workflow artifacts, use kata_* tools." File: empty or minimal.
- **`{{backendOps}}`** — all read/write/advance/commit/decisions operations as a single block. The backend organizes this however it wants (numbered list, sections, etc.). File-backend produces file paths, checkbox edits, git commits. Linear-backend produces `kata_write_document()`, `kata_update_issue_state()` tool calls.
- **`{{backendMustComplete}}`** — assertion at the end of the prompt. "You MUST do X and Y before finishing." Backend-specific because the concrete actions differ.

### Template Structure (after)

```markdown
{{backendRules}}

... (all substantive agent instructions unchanged — debugging discipline,
     blocker discovery, verification, observability, requirement tracking,
     carry-forward, resume detection, etc.) ...

{{backendOps}}

{{backendMustComplete}}
```

Substantive instructions stay in the template untouched. Only the I/O-specific lines get replaced.

### What Changes in Each Backend

**FileBackend:**
- Extract I/O instruction lines from each `_build*Prompt()` into a `_buildOpsBlock(phase, state)` helper returning `{ backendRules, backendOps, backendMustComplete }`
- Each `_build*Prompt()` shrinks to: gather content vars (inline files from disk, same as today), spread ops block, call `loadPrompt()`
- Net: ~100 lines shorter, behavior identical

**LinearBackend:**
- Delete all 10 `_build*Prompt()` methods (420 lines of inline strings)
- Add `_gatherContentVars(phase, state)` — calls `this.readDocument()` to pre-fetch Linear docs at dispatch time, returns `Record<string, string>` with the same var names templates expect (`inlinedContext`, `taskPlanInline`, `dependencySummaries`, etc.)
- Add `_buildOpsBlock(phase, state)` — returns the three ops vars with Linear-specific tool call instructions
- `buildPrompt()` becomes: resolve template name → gather identity vars → call `_gatherContentVars()` → call `_buildOpsBlock()` → call `loadPrompt(templateName, allVars)`
- Delete `HARD_RULE`, `REFERENCE`, `DISCOVER_PROJECT_DOCS`, `DISCOVER_SLICE_DOCS` constants
- Net: ~705 lines → ~280 lines

**Key behavioral change for Linear:** instead of telling the LLM to discover documents via tool calls (5-10 round-trips at ~500 tokens each), the backend pre-fetches docs at dispatch time and inlines them. Same as file-backend. Fewer tokens, faster execution.

### discuss.md Unification

The two discuss templates share lines 1-115 verbatim. They diverge only in the Output Phase section (lines 116+). Additionally, `discuss.md` already contains both "Linear Mode Output Phase" and "File Mode Output Phase" sections with a runtime `workflow.mode` check — a partial unification attempt that created a third copy of the Linear output instructions.

The fix: replace the entire Output Phase section in `discuss.md` with `{{backendOps}}`. Each backend's `buildDiscussPrompt()` provides the full output phase content as the `backendOps` var. `discuss-linear.md` is deleted.

Minor template differences in the shared section (e.g., line 61 "`.kata/REQUIREMENTS.md`" vs "a `REQUIREMENTS` document in Linear", line 76 "produce or update `.kata/REQUIREMENTS.md`" vs "via `kata_write_document`") also move into `{{backendOps}}` or are generalized to backend-neutral language (e.g., "produce or update the REQUIREMENTS document").

**`buildDiscussPrompt()` signature:** This method takes `(nextId, preamble)` not `(phase, state)`. Each backend's implementation builds the ops block directly from `nextId` rather than delegating to `_buildOpsBlock()`. The pattern is the same (assemble vars, call `loadPrompt`), just with a simpler input.

### Variable Conventions

**All three ops vars are always present in every template, even if empty.** `loadPrompt()` validates that every `{{var}}` in the template has a provided value. Backends must pass all three, using empty strings when a var is not applicable (e.g., file-backend's `backendRules` is typically `""`).

**Path-reference vars** (`planPath`, `slicePath`, `taskSummaryAbsPath`, `taskPlanPath`, etc.) appear in current templates both as prose references and as operational targets. The rule for partitioning:

- If a var is used in an I/O instruction ("Write `{{taskSummaryAbsPath}}`", "Mark done in `{{planPath}}`"), that instruction moves to `{{backendOps}}` and the var moves into the ops block string. The template no longer declares it.
- If a var is used in prose for orientation ("Your task plan is at `{{taskPlanPath}}`"), it stays as a template var. Linear-backend provides a descriptive equivalent (e.g., `taskPlanPath: "the task plan document (pre-loaded below)"`) or the template text is generalized to not reference a path.
- If a var serves both purposes, the operational use moves to `{{backendOps}}` and the prose use is reworded or the var is kept in both places (template var + ops block).

Decision is made per-template during migration. The golden snapshot diff catches any accidental omissions.

**Skill discovery vars** (`skillDiscoveryMode`, `skillDiscoveryInstructions`) are used by `research-milestone.md` and `research-slice.md`. These are content vars, not ops vars. File-backend produces them from preferences via `_buildSkillDiscoveryVars()`. Linear-backend must produce the same vars using the same logic — this helper can be shared or duplicated (it reads preferences, not backend state).

### Templates Unchanged

Already backend-agnostic, no modifications needed:
- `guided-*.md` (6 files)
- `pr-*.md` (4 files)
- `doctor-heal.md`
- `system.md`
- `queue.md`

## Testing Strategy

### 1. Golden Prompt Snapshots (before any changes)

For every phase × backend combination, capture current `buildPrompt()` output as golden files. File-backend uses a temp directory with realistic fixture files (CONTEXT, ROADMAP, PLAN, task summaries, etc.). Linear-backend uses the existing `makeState()` test helper.

Both backends get snapshots because:
- File-backend snapshots detect regressions in the working system
- Linear-backend snapshots verify that all behavioral content from the inline strings makes it into the templates after migration

Purpose: "did the prompt change in a way I didn't expect" detection. After refactoring a template, diff new output against golden file. Substantive instructions should be identical; only I/O lines change.

### 2. Structural Assertions

For each phase × backend combination, verify:
- Identity vars resolved (milestone ID, slice ID, task ID, titles)
- Content blocks present (inlined context, plan excerpts, carry-forward)
- Ops block present and backend-appropriate (file paths for file-backend, `kata_*` tool calls for linear-backend)
- No unresolved `{{varName}}` placeholders

These survive refactoring because they test what matters, not exact strings.

### Pre-fetch Integration Test

The key behavioral change for Linear (pre-fetching docs instead of LLM discovery) gets a dedicated test: call Linear-backend's `buildPrompt("executing", state)`, verify the rendered prompt contains the actual document content inline (not `kata_read_document` discovery instructions). This catches the most likely regression — `_gatherContentVars()` failing to transform API responses into the inlined format.

### Existing Linear Backend Tests

The current `linear-backend.test.ts` uses regex assertions (`assertMatch(p, /never use bash/i, ...)`) against inline string content. After migration, prompts come from templates + ops blocks. Most assertions still pass (the content is the same, just sourced differently). Assertions that break get rewritten to match the new structure. This happens in step 12 (cleanup), not during template migration, to avoid changing two things at once.

### 3. Template-by-Template Verification

After each template migration: run golden diff for file-backend, run structural tests for both backends, verify `loadPrompt()` doesn't throw (catches missing vars). Move to next template only when green.

## Migration Order

Simplest first, most complex last. Golden snapshots captured once at start.

| Step | Template | Why this order |
|------|----------|---------------|
| 1 | `complete-milestone.md` | Fewest vars, simplest ops. Proving ground. |
| 2 | `replan-slice.md` | Small, self-contained |
| 3 | `reassess-roadmap.md` | Similar shape |
| 4 | `run-uat.md` | Similar shape |
| 5 | `research-milestone.md` | Introduces skill discovery vars, simple ops |
| 6 | `research-slice.md` | Same pattern as research-milestone |
| 7 | `plan-milestone.md` | More content vars, introduces `kata_create_slice` ops |
| 8 | `plan-slice.md` | Introduces `kata_create_task` ops |
| 9 | `execute-task.md` | Most complex: carry-forward, resume, prior tasks, task plan inline |
| 10 | `complete-slice.md` | Depends on execute-task patterns being settled |
| 11 | `discuss.md` | Merge `discuss-linear.md`, eliminate separate file |
| 12 | Cleanup | Delete `discuss-linear.md`, delete inline constants from linear-backend, migrate linear-backend tests |

## Example: complete-milestone.md

**File-backend `_buildOpsBlock("completing-milestone", state)` returns:**

```typescript
{
  backendRules: "",
  backendOps: `## Operations

1. Read all slice summaries in \`${slicePath}/\`
2. Write milestone summary to \`${milestoneSummaryAbsPath}\`
3. Update \`.kata/STATE.md\` — set phase to \`complete\`
4. Commit: \`git add -A && git commit -m 'milestone(${milestoneId}): complete'\``,
  backendMustComplete: `**You MUST write \`${milestoneSummaryAbsPath}\` and update STATE.md before finishing.**`,
}
```

**Linear-backend `_buildOpsBlock("completing-milestone", state)` returns:**

```typescript
{
  backendRules: `## Rules
- Never use bash, find, or rg to locate workflow artifacts. Use kata_* tools only.
- Reference KATA-WORKFLOW.md for workflow rules.`,
  backendOps: `## Operations

1. Read all slice summaries: \`kata_list_documents({ issueId: "${milestoneIssueId}" })\`, then read each
2. Write milestone summary: \`kata_write_document("${milestoneId}-SUMMARY", content, { projectId: "${projectId}" })\`
3. Advance state: \`kata_update_issue_state({ issueId: "${milestoneIssueId}", phase: "complete" })\`
4. Commit: \`git add -A && git commit -m 'milestone(${milestoneId}): complete'\``,
  backendMustComplete: `**You MUST write the milestone summary and advance state before finishing.**`,
}
```

**Same template, same agent instructions, different I/O.**

## Size Estimate

| Component | Change | Notes |
|-----------|--------|-------|
| `linear-backend.ts` | -420, +200 | Delete inline prompts, add gatherContentVars + buildOpsBlock |
| `file-backend.ts` | -100, +80 | Extract I/O lines into buildOpsBlock helper |
| Phase templates (11) | ~±30 each | Replace hardcoded ops with `{{vars}}` |
| `discuss-linear.md` | -154 | Eliminated |
| `discuss.md` | ~+20 | Absorb backend-variable slots |
| Tests | ~+300 | Golden snapshots + structural assertions |
| **Net** | **~-400 lines** | Mostly inline prompt deletion |

## Non-Goals

- **No assembler module.** Both backends keep `buildPrompt()`. The "gather vars, call loadPrompt" pattern is simple enough to not need a shared abstraction.
- **No template inheritance or conditionals.** The three `{{ops}}` vars handle all backend variance. Templates stay flat markdown with `{{var}}` substitution.
- **No changes to `loadPrompt()`.** The existing `readFileSync` + `{{var}}` substitution mechanism is fine.
- **No changes to auto-mode dispatch logic.** `auto.ts` keeps calling `backend.buildPrompt()`.
- **No changes to system prompt.** `system.md` is already backend-agnostic.

## Risks

| Risk | Mitigation |
|------|-----------|
| Linear pre-fetch adds latency at dispatch | Parallel API calls in `_gatherContentVars()` via `Promise.all()` |
| File-backend regression during template refactor | Golden snapshots catch unintended changes before they ship |
| Ops blocks become complex for edge cases | Keep them as numbered lists. Edge cases (git worktree bugs, etc.) stay in template general instructions since they're not backend-specific. |
| Template var count grows | ~15-20 vars per template is manageable. Current file-backend already passes 8-14. The three ops vars replace hardcoded lines, not add to them. |

## Relationship to Prior Spec

The 2026-03-15 unified backend design spec covered phase 1: extracting the `KataBackend` interface, creating both backend classes, eliminating `isLinearMode()` forks. That work is done.

This spec covers phase 2: making both backends use the same prompt templates so agent behavior is identical regardless of backend.
