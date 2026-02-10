# Requirements: v1.10.0 Git Worktree Support

## v1.10.0 Requirements

### Config Infrastructure

- [x] **CFG-01**: `worktree.enabled` added to config schema in `planning-config.md`
- [x] **CFG-02**: `read-config.sh` created for reading nested JSON keys (Node-based, mirrors `set-config.sh`)
- [x] **CFG-03**: `setup-worktrees.sh` script converts existing repo to bare repo + worktree layout (non-destructive)
- [x] **CFG-04**: `kata-new-project` Phase 5 asks worktree question (conditional on `pr_workflow: true`)
- [x] **CFG-05**: `kata-configure-settings` supports worktree toggle for existing projects

### Execution Integration

- [x] **EXEC-01**: `manage-worktree.sh` script with create/merge/remove/list subcommands
- [ ] **EXEC-02**: `kata-execute-phase` step 4 creates plan worktrees per wave, merges after wave, cleans up
- [ ] **EXEC-03**: `phase-execute.md` updated with worktree lifecycle documentation
- [ ] **EXEC-04**: `executor-instructions.md` updated with `<working_directory>` worktree awareness

### Downstream Skills

- [ ] **DOWN-01**: `git-integration.md` updated with two-tier branch flow documentation
- [ ] **DOWN-02**: `kata-complete-milestone` updated for worktree-aware release branch creation

### Housekeeping

- [x] **HOUSE-01**: Extract inline scripts to standalone files where beneficial during worktree implementation
- [ ] **HOUSE-02**: `kata-complete-milestone` offers release tasks at milestone completion (verify/fix, GitHub #83)

## Future Requirements

(Deferred to later milestones)

- Multi-agent conflict resolution tooling (automatic merge conflict handling)
- Worktree support for non-GitHub remotes
- VS Code workspace integration for worktree directories

## Out of Scope

- Worktree support without `pr_workflow: true` — worktrees extend the branching model
- Automatic conflict resolution — agents use standard git merge; conflicts are manual
- IDE-specific worktree UX — CLI only for now

## Traceability

| REQ ID   | Phase | Plan | Status  |
| -------- | ----- | ---- | ------- |
| CFG-01   | 44    | 01   | Complete |
| CFG-02   | 44    | 01   | Complete |
| CFG-03   | 44    | 02   | Complete |
| CFG-04   | 44    | 02   | Complete |
| CFG-05   | 44    | 02   | Complete |
| EXEC-01  | 45    | 01   | Complete |
| EXEC-02  | 46    |      | Pending |
| EXEC-03  | 46    |      | Pending |
| EXEC-04  | 46    |      | Pending |
| DOWN-01  | 47    |      | Pending |
| DOWN-02  | 47    |      | Pending |
| HOUSE-01 | 45    | 02   | Complete |
| HOUSE-02 | 47    |      | Pending |

---

**Source:** GitHub Issue #125 + backlog issues
*Created: 2026-02-09*
