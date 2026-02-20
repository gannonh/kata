# Plan: Git Worktree Support for Kata

## Context

Kata projects currently use a single working directory with `git checkout -b` for branching. All subagents share the same filesystem during wave-based parallel execution. This limits true parallelism: plans within a wave must touch disjoint files.

Git worktrees (bare repo pattern) give each plan agent an isolated working directory on its own branch. Plans merge back into the phase branch after completion. This is the established community convention for worktree-heavy workflows.

**Target layout:**
```
<project-name>/
  .bare/                    # bare git repo (shared object store)
  .git                      # pointer file → .bare
  main/                     # worktree: main branch (reference, rebase target)
  <project-name>/           # worktree: phase branch (orchestrator, .planning/)
  38-01/                    # worktree: plan branch (per plan agent)
  38-02/                    # worktree: plan branch (per plan agent)
```

**Branch flow:**
- Plan branches → PR/merge into phase branch
- Phase branch → PR into main

## Prerequisite

`pr_workflow: true` — worktrees are a branching enhancement; without PR workflow there are no branches to manage.

## Files to Modify

### Wave 1: Config Infrastructure

**1. `skills/kata-execute-phase/references/planning-config.md`**
- Add `worktree` section to `<config_schema>` with `worktree.enabled` (default: `false`)
- Add `<worktree_behavior>` section documenting layout, branch flow, lifecycle
- Add reading pattern using `read-config.sh` for nested keys
- Add row to config table

**2. New: `skills/kata-configure-settings/scripts/read-config.sh`**
- Node-based config reader (mirrors `set-config.sh` pattern)
- Usage: `read-config.sh <dot.key.path> [default]`
- Solves the grep disambiguation problem (both `github.enabled` and `worktree.enabled` have key name `"enabled"`)
- Reuses the same `node` inline approach as `set-config.sh`

**3. New: `skills/kata-new-project/scripts/setup-worktrees.sh`**
- Converts a standard git repo into bare repo + worktree layout
- Non-destructive: creates new directory alongside existing one
- Steps: bare clone → .git pointer → configure fetch → add `main/` worktree → add `<project-name>/` worktree on current branch → copy `.planning/` if untracked
- Outputs `WORKTREE_ROOT` and `PRIMARY_WORKTREE` paths
- Also invocable from `kata-configure-settings` for existing projects

**4. `skills/kata-new-project/SKILL.md`**
- Add conditional question after PR Workflow in Phase 5 (only shown when `pr_workflow: true`):
  ```
  header: "Git Worktrees"
  question: "Use git worktrees for plan-level isolation?"
  options:
    - "No (Recommended)" — Plans execute in shared working directory
    - "Yes (Experimental)" — Each plan gets its own worktree
  ```
- If Yes: write `worktree.enabled: true` via `set-config.sh`, run `setup-worktrees.sh`
- Phase 6 (Done) message includes new directory path when worktrees enabled

**5. `skills/kata-configure-settings/SKILL.md`**
- Add worktree toggle to settings display (conditional on `pr_workflow: true`)
- When toggled on: run `setup-worktrees.sh` conversion
- When toggled off: warn that existing worktree layout must be manually reverted

### Wave 2: Execution Integration

**6. New: `skills/kata-execute-phase/scripts/manage-worktree.sh`**
- Subcommands: `create <plan-id> <base-branch>`, `merge <plan-id> <target-branch>`, `remove <plan-id>`, `list`
- `create`: creates plan branch off base branch, adds worktree, outputs path
- `merge`: merges plan branch into target, detects conflicts, reports status
- `remove`: removes worktree and deletes local branch
- Centralizes worktree lifecycle for the orchestrator

**7. `skills/kata-execute-phase/SKILL.md`**
- Step 0: read `worktree.enabled` config (using `read-config.sh`)
- Step 1.5: unchanged (phase branch created in primary worktree as before)
- Step 4 (wave execution): when worktrees enabled:
  - Before spawning each plan agent: `manage-worktree.sh create` → plan worktree + branch
  - Pass worktree path to subagent via `<working_directory>` in Task prompt
  - After wave completes: `manage-worktree.sh merge` each plan branch into phase branch
  - Then `manage-worktree.sh remove` to clean up
  - Fallback: if worktree creation fails, fall back to shared-directory execution with warning
- Steps 5-11: unchanged (operate on phase branch in primary worktree)

**8. `skills/kata-execute-phase/references/phase-execute.md`**
- Add `<worktree_lifecycle>` section documenting create/use/merge/remove flow
- Update `execute_waves` step with conditional worktree logic
- Document merge conflict handling (stop, present to user)

**9. `skills/kata-execute-phase/references/executor-instructions.md`**
- Add `<worktree_awareness>` section:
  - If `<working_directory>` present in prompt, `cd` there before any file operation
  - `.planning/` does not exist in plan worktrees; all context is inlined by orchestrator
  - Commit to current branch; orchestrator handles merge back

### Wave 3: Downstream Skills

**10. `skills/kata-execute-phase/references/git-integration.md`**
- Add worktree section to PR Integration documenting two-tier branch flow
- Plan branches merge locally (orchestrator handles); phase branch PRs into main as before

**11. `skills/kata-complete-milestone/SKILL.md`**
- When worktree enabled: create release branch as worktree instead of `git checkout -b`
- Clean up release worktree after PR created

## Key Design Decisions

1. **Non-destructive conversion**: `setup-worktrees.sh` creates a new directory alongside the original. Original repo stays intact as backup.

2. **Prerequisite**: worktree option hidden unless `pr_workflow: true`. Config key absent (not `false`) when not applicable.

3. **Agent isolation via prompt**: subagents get `<working_directory>` in their Task prompt. The orchestrator inlines all `.planning/` context (already the existing pattern). Agents never read `.planning/` directly from worktrees.

4. **Merge after wave, not after plan**: plan branches merge into phase branch after each wave completes (not individual plan completion). Matches current wave-barrier semantics.

5. **Fallback on failure**: if worktree creation fails (branch exists, disk issues), fall back to shared-directory execution. Non-blocking.

6. **`read-config.sh` for nested keys**: replaces fragile grep + `head -1` disambiguation with proper JSON traversal. Placed in `kata-configure-settings/scripts/` alongside existing `set-config.sh`.

## Verification

1. **Init flow**: run `/kata-new-project` in a test project, enable worktrees. Verify:
   - config.json contains `"worktree": { "enabled": true }`
   - bare repo layout created at expected path
   - `main/` and `<project-name>/` worktrees exist
   - `.planning/` accessible in primary worktree

2. **Config script**: test `read-config.sh` against config.json:
   - `read-config.sh worktree.enabled false` → `true`
   - `read-config.sh github.enabled false` → correct value (not confused with worktree.enabled)

3. **Execution**: run `/kata-execute-phase` on a phase with 2+ plans in same wave:
   - Plan worktrees created as sibling directories
   - Each agent operates in its own worktree
   - Plan branches merged back after wave
   - Worktrees cleaned up after merge

4. **Settings toggle**: run `/kata-configure-settings`, enable worktrees on existing project:
   - Conversion script runs
   - New layout created alongside existing repo

5. **Fallback**: test with worktree disabled. All existing behavior unchanged.
