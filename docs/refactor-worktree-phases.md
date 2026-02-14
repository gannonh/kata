# Refactor: Phase-Level Worktrees

## Problem

The bare repo + worktree layout exists so that `main/` stays on the `main` branch permanently. But `create-phase-branch.sh` runs `git checkout -b` inside `main/`, switching it to a feature branch. This defeats the entire purpose of the layout.

The directory is named `main` but sits on a feature branch most of the time. Confusing and wrong.

## Current Flow (Broken)

```
kata-cloud/
  .bare/
  main/          ← supposed to be main branch, but gets switched to feat/v1.0-01-...
  plan-01-01/    ← plan worktree (correct concept, wrong parent)
  plan-01-02/
```

1. `create-phase-branch.sh` runs `git checkout -b feat/v1.0-01-slug` inside `main/`
2. `main/` is now on a feature branch
3. Plan worktrees fork from that feature branch
4. Plans merge back into the feature branch inside `main/`
5. `main/` stays on the feature branch until manually switched back

## Target Flow (Fixed)

```
kata-cloud/
  .bare/
  main/                         ← always main branch, never touched
  feat-v1.0-01-phase-name/      ← phase worktree (new)
    plan-01-01/                  ← plan worktree forks from phase branch (unchanged concept)
    plan-01-02/
```

1. Phase execution creates a new worktree directory as a sibling to `main/`
2. `main/` stays on the `main` branch at all times
3. Plan worktrees fork from the phase branch
4. Plans merge back into the phase branch in the phase worktree
5. When phase completes, the phase branch becomes a PR (or merges into main)
6. Phase worktree is removed after merge

## What to Change

### 1. Replace `create-phase-branch.sh`

Current behavior: `git checkout -b $BRANCH` inside `main/`.

New behavior: Create a worktree at the project root level.

```bash
# Instead of:
git checkout -b "$BRANCH"

# Do:
WORKTREE_DIR="$(cd .. && pwd)/${BRANCH_TYPE}-v${MILESTONE}-${PHASE_NUM}-${SLUG}"
GIT_DIR=../.bare git worktree add "$WORKTREE_DIR" -b "$BRANCH" main
```

Output should include `WORKTREE_PATH=$WORKTREE_DIR` so the orchestrator knows where to work.

The script must handle the case where the worktree already exists (resumption). If the branch and worktree both exist, just output the path.

### 2. Update `manage-worktree.sh`

Plan worktrees currently land as siblings to `main/`. They should land as siblings or children of the phase worktree directory.

**Option A: Plans as children of phase worktree**
```
kata-cloud/
  feat-v1.0-01-foundation/
    plan-01-01/          ← inside the phase worktree dir? No, this is wrong.
```

This won't work. Git worktrees can't nest. A worktree is a checkout of a branch at a filesystem path. You can't put a worktree inside another worktree's directory.

**Option B: Plans as siblings at project root (current approach, keep it)**
```
kata-cloud/
  main/
  feat-v1.0-01-foundation/     ← phase worktree
  plan-01-01/                   ← plan worktree (forks from feat/v1.0-01-foundation)
  plan-01-02/
```

Keep plan worktrees at the project root level. They already work this way. The only change: their base branch is the phase branch instead of whatever `main/` happens to be on.

In `manage-worktree.sh`:

- `cmd_create`: The `base_branch` parameter should default to the phase branch, not to whatever `main/` is checked out to. The caller (phase-execute orchestrator) should pass the phase branch name explicitly.
- `cmd_merge`: Merges plan branch into the phase branch (not into whatever is in `main/`). The merge target should be the phase worktree directory, not `main/`. Change `git -C main merge ...` to `git -C "$PHASE_WORKTREE_DIR" merge ...`.
- `resolve_base_branch`: Remove the logic that reads the current branch of `main/`. The base branch must always be passed explicitly by the caller.

### 3. Update `phase-execute.md` (orchestrator instructions)

The orchestrator currently assumes all work happens in `main/`. After this refactor, phase execution happens in the phase worktree directory.

Changes needed in `phase-execute.md`:

**`worktree_lifecycle` step:**

Add a new sub-step at the start: "Create phase worktree."

```bash
# Before any plan execution, create the phase worktree
eval "$(bash scripts/create-phase-branch.sh "$PHASE_DIR")"
# WORKTREE_PATH is now set (e.g., /path/to/kata-cloud/feat-v1.0-01-foundation)
# BRANCH is now set (e.g., feat/v1.0-01-foundation)
PHASE_WORKTREE_PATH="$WORKTREE_PATH"
PHASE_BRANCH="$BRANCH"
```

**`execute_waves` step:**

When spawning executor agents, the `<working_directory>` injected into agent prompts should point to either:
- The phase worktree (if `worktree.enabled=false`, plan-level worktrees disabled)
- The plan worktree (if `worktree.enabled=true`)

When `worktree.enabled=false`, agents work in the phase worktree directly (sequential execution only).

When `worktree.enabled=true`, agents work in plan worktrees that fork from the phase branch.

**Plan worktree creation:**

Pass the phase branch explicitly:

```bash
eval "$(bash scripts/manage-worktree.sh create "$PHASE" "$PLAN" "$PHASE_BRANCH")"
```

**Plan worktree merge:**

Merge into the phase worktree:

```bash
bash scripts/manage-worktree.sh merge "$PHASE" "$PLAN" "$PHASE_BRANCH"
```

**After all waves complete:**

The phase worktree has all plan work merged in. Push the phase branch and create a PR against main. Or merge locally if `pr_workflow=false`.

### 4. Update `execute-plan.md` (executor agent instructions)

The executor agent instructions reference file paths relative to the working directory. No changes needed if the orchestrator correctly injects `<working_directory>` pointing to either the phase worktree or the plan worktree.

The `git-integration.md` reference uses relative paths and `git add`/`git commit` which work in any worktree. No changes needed.

### 5. Update `manage-worktree.sh` merge to target phase worktree

Current `cmd_merge` does:

```bash
git -C main checkout "$base_branch"
git -C main merge "$branch_name" --no-edit -X theirs
```

Change to:

```bash
# $PHASE_WORKTREE_DIR passed as argument or resolved from base_branch
git -C "$PHASE_WORKTREE_DIR" merge "$branch_name" --no-edit -X theirs
```

The merge target is the phase worktree directory (e.g., `feat-v1.0-01-foundation/`), not `main/`.

### 6. Phase completion and cleanup

After phase execution completes (all plans merged, verification passed):

```bash
# Option A: PR workflow (pr_workflow=true)
# Push phase branch, create PR against main
cd "$PHASE_WORKTREE_PATH"
git push -u origin "$PHASE_BRANCH"
gh pr create --base main --head "$PHASE_BRANCH" ...

# Option B: Local merge (pr_workflow=false)
git -C main merge "$PHASE_BRANCH" --no-edit
GIT_DIR=.bare git worktree remove "$PHASE_WORKTREE_PATH"
GIT_DIR=.bare git branch -d "$PHASE_BRANCH"
```

### 7. Add phase worktree cleanup to `manage-worktree.sh`

Add a `cleanup-phase` subcommand:

```bash
cmd_cleanup_phase() {
  local phase_worktree="${1:?Usage: manage-worktree.sh cleanup-phase <worktree-path>}"
  local phase_branch="${2:?Usage: manage-worktree.sh cleanup-phase <path> <branch>}"

  GIT_DIR=.bare git worktree remove "$phase_worktree"
  GIT_DIR=.bare git branch -d "$phase_branch"
}
```

### 8. Update `setup-worktrees.sh` README content

The generated README.md should reflect the new structure:

```
project-root/
  .bare/                          # shared git object store
  main/                           # always on main branch (do not switch)
  feat-v1.0-01-foundation/        # phase worktree (temporary, during execution)
    plan-01-01/                    # plan worktree (temporary, during plan execution)
```

## Config Changes

`worktree.enabled` currently controls plan-level worktrees only. After this refactor:

- Phase-level worktrees are always created (they replace `git checkout -b` in `main/`)
- `worktree.enabled` still controls plan-level worktrees within a phase
- No new config needed

## Files to Modify

| File | Change |
|------|--------|
| `skills/kata-execute-phase/scripts/create-phase-branch.sh` | Create worktree instead of checkout |
| `skills/kata-execute-phase/scripts/manage-worktree.sh` | Merge into phase worktree, not `main/` |
| `skills/kata-execute-phase/references/phase-execute.md` | Phase worktree lifecycle, working directory injection |
| `skills/kata-execute-phase/references/git-integration.md` | Update branch flow diagram |
| `skills/kata-configure-settings/scripts/setup-worktrees.sh` | Update README template |

## Files That Should NOT Change

| File | Why |
|------|-----|
| `skills/kata-execute-phase/references/execute-plan.md` | Executor agents work from injected `<working_directory>`, agnostic to worktree structure |
| `skills/kata-execute-phase/references/checkpoints.md` | Checkpoint protocol is directory-agnostic |
| `skills/kata-execute-phase/references/tdd.md` | TDD flow is directory-agnostic |
| `skills/kata-execute-phase/references/summary-template.md` | Template content unchanged |

## Invariant

After this refactor, `main/` is always on the `main` branch. Running `git -C main branch --show-current` must always return `main`. If it returns anything else, something is broken.

## Testing

1. Run `setup-worktrees.sh` on a fresh repo
2. Verify `main/` is on `main` branch
3. Run phase execution
4. Verify phase worktree created as sibling to `main/`
5. Verify `main/` still on `main` branch during and after execution
6. Verify plan worktrees fork from phase branch
7. Verify plan merges target phase worktree
8. Verify phase branch becomes PR or merges into main
9. Verify cleanup removes phase worktree and branch
