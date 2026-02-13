# Requirements: v1.11.0 Phase-Level Worktrees

## v1.11.0 Requirements

### Phase Worktree Lifecycle

- [x] **WT-01**: `create-phase-branch.sh` creates a worktree at project root instead of running `git checkout -b` inside `main/`
- [x] **WT-02**: Phase worktree directory named `{branch-type}-v{milestone}-{phase-num}-{slug}` as sibling to `main/`
- [x] **WT-03**: Script handles resumption: if worktree and branch already exist, outputs path without error
- [x] **WT-04**: Script outputs `WORKTREE_PATH` and `BRANCH` variables for orchestrator consumption
- [x] **WT-05**: `manage-worktree.sh` gains `cleanup-phase` subcommand to remove phase worktree and branch

### Merge Target

- [x] **MT-01**: `manage-worktree.sh` `cmd_merge` merges plan branch into phase worktree directory (not `main/`)
- [x] **MT-02**: `resolve_base_branch` removed; base branch always passed explicitly by caller
- [x] **MT-03**: `cmd_create` defaults base branch to the phase branch passed by caller

### Orchestrator

- [ ] **OR-01**: `phase-execute.md` creates phase worktree before any plan execution
- [ ] **OR-02**: `<working_directory>` injected into agent prompts points to phase worktree (when `worktree.enabled=false`) or plan worktree (when `worktree.enabled=true`)
- [ ] **OR-03**: Plan worktree creation passes phase branch explicitly to `manage-worktree.sh`
- [ ] **OR-04**: Plan worktree merge passes phase branch to `manage-worktree.sh`
- [ ] **OR-05**: After all waves complete, phase branch becomes PR against main (or local merge if `pr_workflow=false`)

### Documentation

- [ ] **DOC-01**: `setup-worktrees.sh` README template reflects new structure (phase worktree as sibling to `main/`)
- [ ] **DOC-02**: `git-integration.md` branch flow diagram updated for two-tier worktree model

### Invariant

- [ ] **INV-01**: `main/` is always on the `main` branch. `git -C main branch --show-current` returns `main` at all times during and after phase execution.

## Future Requirements

None identified. This is a focused structural refactor.

## Out of Scope

- **Nested worktrees** — Git worktrees cannot nest. Plan worktrees remain siblings at project root.
- **New config options** — `worktree.enabled` still controls plan-level worktrees only. Phase worktrees are always created (they replace `git checkout -b`).
- **Changes to execute-plan.md** — Executor agents work from injected `<working_directory>`, agnostic to worktree structure.
- **Changes to checkpoints.md, tdd.md, summary-template.md** — Directory-agnostic, no changes needed.

## Traceability

| Requirement | Phase | Description |
|-------------|-------|-------------|
| WT-01 | 49 | create-phase-branch.sh creates worktree at project root |
| WT-02 | 49 | Phase worktree directory naming convention |
| WT-03 | 49 | Resumption handling for existing worktree/branch |
| WT-04 | 49 | Script outputs WORKTREE_PATH and BRANCH variables |
| WT-05 | 49 | cleanup-phase subcommand in manage-worktree.sh |
| MT-01 | 49 | cmd_merge targets phase worktree, not main/ |
| MT-02 | 49 | resolve_base_branch removed; explicit base branch |
| MT-03 | 49 | cmd_create defaults to phase branch from caller |
| OR-01 | 50 | phase-execute.md creates phase worktree before plans |
| OR-02 | 50 | working_directory injection for agent prompts |
| OR-03 | 50 | Plan worktree creation passes phase branch |
| OR-04 | 50 | Plan worktree merge passes phase branch |
| OR-05 | 50 | Phase branch becomes PR or local merge after waves |
| INV-01 | 50 | main/ stays on main branch at all times |
| DOC-01 | 51 | setup-worktrees.sh README template updated |
| DOC-02 | 51 | git-integration.md branch flow diagram updated |
