# Worktree Isolation in Kata

## The Problem

Kata executes phases by spawning one subagent per plan. During wave-based parallel execution, multiple agents run simultaneously in the same project directory. This creates two problems:

1. **File conflicts.** If plan 01 runs `npm install` while plan 02 modifies `package.json`, they corrupt each other's working tree. Generated artifacts (lock files, build output) collide.

2. **No rollback boundary.** If plan 02 fails mid-execution, its half-written files are mixed into the working tree alongside plan 01's completed work. Separating good changes from bad requires manual intervention.

Without worktrees, the orchestrator must serialize all plan execution within a wave, defeating the purpose of wave-based parallelization.

## How Worktrees Solve This

Git worktrees allow multiple branches to be checked out simultaneously in separate directories, sharing a single object store. Kata uses this to give each plan agent its own filesystem sandbox and git branch.

### Directory Layout

When worktrees are enabled, `setup-worktrees.sh` converts the standard git repo into a bare repo + worktree layout:

```
project-root/
├── .bare/           # bare git object store (shared by all worktrees)
├── .git             # pointer file: "gitdir: .bare"
├── .gitignore       # ignores .bare/ and main/
├── README.md        # layout documentation
└── main/            # primary worktree (project root for all tools and skills)
    ├── .planning/
    ├── src/
    ├── package.json
    └── ...
```

During phase execution, plan worktrees appear as sibling directories:

```
project-root/
├── .bare/
├── main/              # orchestrator operates here (phase branch)
├── plan-01-01/        # plan 01 agent's isolated worktree
├── plan-01-02/        # plan 02 agent's isolated worktree
└── plan-01-03/        # plan 03 agent's isolated worktree
```

Each plan directory is a full working copy on its own branch. Agents read and write files, run builds, execute tests, and commit, all without affecting any other worktree.

### Branch Topology

```
main
 └── feat/v1.0-01-phase-name              (phase branch, becomes the PR)
      ├── plan/01-01  →  merge back ──┐
      ├── plan/01-02  →  merge back ──┤    (plan branches, one per plan)
      └── plan/01-03  →  merge back ──┘
```

- The **phase branch** (`feat/v{milestone}-{phase}-{slug}`) is created from `main` and becomes the pull request.
- **Plan branches** (`plan/{phase}-{plan}`) are created from the phase branch. Each lives in its own worktree directory.
- After a plan completes, its branch merges back into the phase branch and the worktree is removed.
- After all plans merge, the phase branch is pushed and a PR is opened against `main`.

### Execution Flow

1. **Phase starts.** The orchestrator creates the phase branch in `main/` and groups plans into waves.

2. **Wave begins.** For each plan in the wave, `manage-worktree.sh create` makes a new worktree directory and branch:
   ```bash
   manage-worktree.sh create "01" "02"
   # Output:
   #   WORKTREE_PATH=/path/to/project/plan-01-02
   #   WORKTREE_BRANCH=plan/01-02
   #   STATUS=created
   ```

3. **Agents execute.** Each plan agent is spawned with its worktree path as the working directory. The agent operates entirely within that directory. The orchestrator stays in `main/` and never touches source code.

4. **Wave completes.** After all agents in a wave finish, the orchestrator verifies each plan's SUMMARY.md exists, then merges each worktree back:
   ```bash
   manage-worktree.sh merge "01" "02"
   # Output:
   #   MERGED=true
   #   BASE_BRANCH=feat/v1.0-01-phase-name
   #   STATUS=merged
   ```
   The merge brings the plan's commits into the phase branch. The worktree directory and plan branch are deleted.

5. **Phase completes.** After all waves, the orchestrator pushes the phase branch and opens a draft PR. Verification runs. If everything passes, the PR is marked ready.

### What Happens on Failure

- **Plan agent fails:** The worktree and branch remain for inspection. The orchestrator reports the failure. The user can enter the worktree directory, fix the issue, commit, and re-run.
- **Merge conflict:** `manage-worktree.sh merge` reports the conflict and exits. The worktree is preserved. The user resolves conflicts in `main/` and the orchestrator continues.
- **Untracked file collision:** Before merging, the script removes untracked files in `main/` that would conflict with incoming plan branch files (common with generated files like `package-lock.json`). The plan branch version wins.

## Enabling Worktrees

Worktrees require `pr_workflow: true` in `.planning/config.json`.

### During Project Setup

Select "Yes" when `/kata-new-project` or `/kata-configure-settings` asks about worktree isolation. The conversion runs automatically.

### On an Existing Project

```
/kata-configure-settings
```

Select "Enable worktrees." The script converts the repo in place. After conversion, restart Claude Code from inside `main/`.

### Manual Conversion

```bash
bash skills/kata-configure-settings/scripts/setup-worktrees.sh
```

Preconditions: clean working tree, PR workflow enabled, inside a git repo.

## Requirements

- Git 2.20+ (worktree support)
- `gh` CLI (for PR creation)
- `pr_workflow: true` in config
- A GitHub remote (for pushing branches and opening PRs)

## Idempotency

All worktree operations are idempotent:

- `setup-worktrees.sh` exits cleanly if `.bare/` already exists.
- `manage-worktree.sh create` returns `STATUS=exists` if the worktree directory is already present.
- `manage-worktree.sh merge` can be re-run after resolving conflicts.
- `create-draft-pr.sh` checks for existing PRs before creating a new one, and falls back to `--force-with-lease` if the remote branch is stale from a previous failed run.

## Troubleshooting

**"Bare repo layout required"** - Run `setup-worktrees.sh` or enable worktrees via `/kata-configure-settings`.

**"worktree.enabled is false"** - Set `worktree.enabled` to `true` in `.planning/config.json`.

**"Worktree has uncommitted changes"** - The plan agent left uncommitted work. Enter the worktree directory, commit or discard changes, then re-run the merge.

**Merge conflict during merge-back** - Enter `main/`, resolve the conflict (`git mergetool` or manual edit), commit, then re-run. The worktree is preserved for reference.

**Stale plan worktree directories** - Run `manage-worktree.sh list` to see active worktrees. Remove manually with `GIT_DIR=.bare git worktree remove <path>`.
