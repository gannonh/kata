# Phase 52 Research: Documentation — Updated Worktree Structure Docs

## Standard Stack

No external libraries. This phase modifies two files in the Kata source tree:
- `skills/kata-configure-settings/scripts/setup-worktrees.sh` (README template, lines 170-209)
- `skills/kata-execute-phase/references/git-integration.md` (branch_flow section, lines 256-305)

**Note on file location:** The research scope listed `setup-worktrees.sh` under `kata-execute-phase/scripts/`. It actually lives at `skills/kata-configure-settings/scripts/setup-worktrees.sh`.

## Architecture Patterns

### Current Documentation State

Phase 51-02 already updated both target files to describe the workspace model. The current documentation reflects the implementation from Phases 49-51.

#### setup-worktrees.sh README template (lines 170-209)

The embedded README template **already shows**:
- `workspace/` as primary working directory
- `main/` as read-only reference
- Plan worktrees as sibling directories (`plan-{phase}-{plan}/`)
- Branch layout: `main` -> `feat/v1.0-01-phase-name` (in workspace/) -> `plan/01-01`
- "How It Works" section describing workspace-base branch switching between phases

#### git-integration.md branch_flow section (lines 256-305)

The `<branch_flow>` section **already describes**:
- "Workspace Architecture" heading
- Layout diagram with `main/` and `workspace/`
- Configuration variants table (3 rows for different config combos)
- Plan branch lifecycle referencing workspace/ as merge target
- Phase cleanup via workspace-base branch switching

### Gap Analysis Against Success Criteria

| Success Criterion | Current State | Status |
|---|---|---|
| README template shows workspace/ as persistent working directory | Lines 196-198: "workspace/ is the persistent working directory" | MET |
| README template shows main/ as read-only | Lines 198: "main/ is a read-only reference worktree" | MET |
| git-integration.md shows main -> phase branch (in workspace) -> plan branch | Lines 264-269: layout + lines 274-298: lifecycle | MET |
| Directory structure examples include workspace/, main/, plan-{phase}-{plan}/ | Both files have these in diagrams | MET |

### Requirement Text vs Implementation Mismatch

The REQUIREMENTS.md DOC-01 description says "phase worktree as sibling to main/" which reflects the Phase 49 model. Phase 51 replaced that model with workspace/ (persistent worktree that switches branches). The docs already describe the Phase 51 model (workspace/), which is correct. The requirement description is stale but the intent is satisfied.

## Don't Hand-Roll

- Do not rewrite working documentation sections
- Do not invent new documentation patterns; match existing format in both files

## Common Pitfalls

### Pitfall 1: Docs Already Updated — Risk of Redundant Work
Phase 51-02 (commits 6d41ae9, fab8daa) already updated both files to describe workspace architecture. The planner must verify whether any gaps remain before generating tasks. If both DOC-01 and DOC-02 success criteria are already met, this phase may require only a verification task (or may be closeable without code changes).

### Pitfall 2: REQUIREMENTS.md DOC-01 Description is Stale
DOC-01 says "phase worktree as sibling to main/" but the actual model is "workspace/ as persistent working directory." The planner should update REQUIREMENTS.md to reflect the final architecture if it creates any tasks.

### Pitfall 3: Editing the Wrong File
`setup-worktrees.sh` is in `kata-configure-settings/scripts/`, not `kata-execute-phase/scripts/`.

## Code Examples

### setup-worktrees.sh README Template (Current — Lines 170-209)

The heredoc at line 170 produces the project-root README. Key sections:

**Structure diagram:**
```
project-root/
├── .bare/           # shared git object store (do not modify)
├── main/            # read-only reference (always on main branch)
├── workspace/       # primary working directory (active phase branch)
├── plan-01-01/      # plan worktree (created during execution, temporary)
└── plan-01-02/      # plan worktree (created during execution, temporary)
```

**Branch layout:**
```
main
 └── feat/v1.0-01-phase-name        (phase branch, checked out in workspace/)
      ├── plan/01-01  → merge back
      ├── plan/01-02  → merge back
      └── plan/01-03  → merge back
```

### git-integration.md branch_flow Section (Current — Lines 256-305)

Key structural elements:
- `<branch_flow>` XML container
- "## Workspace Architecture" heading
- "### Layout" with directory tree
- Tier 1 and Tier 2 descriptions
- "### Configuration Variants" table
- "### Plan Branch Lifecycle" numbered steps
- "### Phase Cleanup" description

## Planner Guidance

**Confidence: HIGH** — Both documentation files were already updated in Phase 51-02.

The planner has three options:

1. **Verification-only plan:** Single task to verify DOC-01 and DOC-02 are met, update REQUIREMENTS.md checkboxes, mark phase complete. Appropriate if no gaps are found.

2. **Minor refinement plan:** If the planner finds specific wording improvements needed (e.g., the README could be clearer about `cd workspace` being the first step), create a small plan with 1-2 tasks.

3. **Close phase without planning:** If verification confirms all criteria met, the orchestrator can skip planning entirely and close the phase.

The planner should read both files and compare against success criteria before deciding. Do not generate tasks for work that Phase 51-02 already completed.
