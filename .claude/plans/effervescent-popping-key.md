# Fix Agent Reference Path Resolution

## Problem

Agents (`kata-executor.md`, `kata-planner.md`) use `@./references/` paths in their system prompts, but these paths don't resolve correctly. When agents run, `@./references/` resolves to `.planning/references/` instead of the agent's actual location.

**Root cause:** Skills are directories with `references/` subdirectories — `@./references/` works. Agents are flat `.md` files — `@./references/` doesn't resolve relative to the agent.

## Solution

**Option B: Orchestrator passes content** — Skills load references and pass them to agents via Task prompt.

This aligns with Kata's existing pattern where skills read plan content before spawning agents (see `kata-executing-phases/SKILL.md` line 523-538: "The `@` syntax does not work across Task() boundaries").

**Key finding:** All 4 files in `agents/references/` are **identical** to files already in `skills/kata-executing-phases/references/`. The skill already has the references — agents just need to stop trying to load them directly.

## Files to Modify

### 1. Agent System Prompts — Remove broken `@./references/` lines

**`agents/kata-executor.md`:**
- Line 356: Remove `**See @./references/checkpoints.md**`
- Line 613: Remove `**Use template from:** @./references/summary-template.md`
- Add note: "Checkpoint protocol and summary template are provided via Task prompt"

**`agents/kata-planner.md`:**
- Lines 410-411: Remove `@./references/execute-plan.md` and `@./references/summary-template.md`
- Add note: "Plan format and summary template are provided via Task prompt"

### 2. Skills — Pass reference content when spawning agents

**`skills/kata-executing-phases/SKILL.md`:**
- The skill already has `@./references/checkpoints.md` and `@./references/summary-template.md`
- Update Task prompt to include these references as inline content sections

**`skills/kata-planning-phases/SKILL.md`:**
- Copy or symlink `execute-plan.md` and `summary-template.md` to its `references/` directory
- Update Task prompt to include these references as inline content sections

**`skills/kata-executing-quick-tasks/SKILL.md`:**
- Ensure it passes reference content when spawning either agent

### 3. Delete Duplicate Reference Directory

Delete `agents/references/` — all 4 files are duplicates:
- `checkpoints.md` ✓ identical to `skills/kata-executing-phases/references/checkpoints.md`
- `summary-template.md` ✓ identical to `skills/kata-executing-phases/references/summary-template.md`
- `execute-plan.md` ✓ identical to `skills/kata-executing-phases/references/execute-plan.md`
- `git-integration.md` ✓ identical to `skills/kata-executing-phases/references/git-integration.md`

## Implementation Steps

### Step 1: Add references to `kata-planning-phases`

`kata-planning-phases/references/` only has `ui-brand.md`. Need to add:
- Copy `summary-template.md` from `kata-executing-phases/references/`
- Copy `execute-plan.md` from `kata-executing-phases/references/`

(Or symlink, but copies are simpler for plugin builds)

### Step 2: Create references for `kata-executing-quick-tasks`

`kata-executing-quick-tasks/` has no `references/` directory. Need to create:
- `skills/kata-executing-quick-tasks/references/`
- Copy required references for both planner and executor

### Step 3: Update skill prompts to pass content

**`skills/kata-executing-phases/SKILL.md`:**
- Already reads plan content before spawning
- Add: Read `@./references/checkpoints.md` content
- Add: Read `@./references/summary-template.md` content
- Include both in kata-executor Task prompt as inline sections

**`skills/kata-planning-phases/SKILL.md`:**
- Add: Read `@./references/execute-plan.md` content
- Add: Read `@./references/summary-template.md` content
- Include both in kata-planner Task prompt as inline sections

**`skills/kata-executing-quick-tasks/SKILL.md`:**
- Step 5 (planner): Include execute-plan.md and summary-template.md in prompt
- Step 6 (executor): Include checkpoints.md and summary-template.md in prompt

### Step 4: Update agent system prompts

**`agents/kata-executor.md`:**
- Remove line 356: `**See @./references/checkpoints.md**`
- Remove line 613: `**Use template from:** @./references/summary-template.md`
- Add note: "The checkpoint protocol and summary template are provided in your Task prompt"

**`agents/kata-planner.md`:**
- Remove lines 410-411: `@./references/execute-plan.md` and `@./references/summary-template.md`
- Add note: "The plan format and summary template are provided in your Task prompt"

### Step 5: Delete `agents/references/` directory

```bash
rm -rf agents/references/
```

All files are duplicates of what's already in `skills/kata-executing-phases/references/`.

### Step 6: Test

1. Install as plugin to test project
2. Run `/kata-plan-phase` and verify planner works
3. Run `/kata-execute-phase` and verify executor works
4. Check that SUMMARY.md is created correctly (proves summary-template was received)
5. Check that checkpoints display correctly (proves checkpoints.md was received)

## Verification

After changes:
- [ ] No `@./references/` in agent files
- [ ] `agents/kata-executor.md` has note about content via Task prompt
- [ ] `agents/kata-planner.md` has note about content via Task prompt
- [ ] `kata-executing-phases/SKILL.md` passes checkpoints.md and summary-template.md
- [ ] `kata-planning-phases/SKILL.md` passes execute-plan.md and summary-template.md
- [ ] `kata-planning-phases/references/` has execute-plan.md and summary-template.md
- [ ] `kata-executing-quick-tasks/SKILL.md` passes references to both agents
- [ ] `kata-executing-quick-tasks/references/` directory exists with needed files
- [ ] `agents/references/` directory deleted
- [ ] Works when installed as NPX
- [ ] Works when installed as plugin
