---
name: kata-managing-project-roadmap
description: Use this skill when adding phases to the roadmap, inserting urgent phases between existing phases, removing future phases, planning gap closure phases, or managing the project roadmap structure. Triggers include "add a phase", "add phase to roadmap", "new phase", "create a phase", "I need a phase", "insert phase", "urgent phase", "remove phase", "plan gaps", "fill gaps", "coverage gaps", "roadmap management", and "decimal phase numbering". This skill handles all roadmap modifications.
---

# Roadmap Management Orchestrator

Manages project roadmap operations: adding phases, inserting urgent phases (decimal numbering), removing phases, and planning gap closure phases.

## When to Use

- User says "add a phase" or "I need a new phase"
- User says "let's add X to the roadmap"
- User asks to "add phase N" or "create a phase"
- User needs to "insert urgent work" between existing phases
- User wants to "remove a phase" or "delete phase N"
- User asks to "plan gaps" or "fill coverage gaps"
- User asks about decimal phase numbering (e.g., 2.1, 3.1)

## Workflow Overview

```
1. Determine operation from natural language
2. Load roadmap and state context
3. Execute operation (add, insert, remove, plan-gaps)
4. Spawn kata-roadmapper for complex operations
5. Update STATE.md
6. Present results with next steps
```

## Operation Detection

Parse user request to identify operation:

| User says                                       | Operation | Description                |
| ----------------------------------------------- | --------- | -------------------------- |
| "add phase", "add X to roadmap"                 | ADD       | Append to end of milestone |
| "insert phase", "urgent work", "between phases" | INSERT    | Decimal insertion          |
| "remove phase", "delete phase"                  | REMOVE    | Remove future phase        |
| "plan gaps", "fill gaps", "coverage gaps"       | PLAN-GAPS | Create gap closure phases  |

## ADD Phase Operation

Add a new integer phase to the end of the current milestone.

### Workflow

1. **Parse description** from user request
2. **Load roadmap** from `.planning/ROADMAP.md`
3. **Find current milestone** section
4. **Calculate next phase number:**
   - Find highest integer phase (ignore decimals)
   - Add 1 for next phase
   - Format as two-digit: `printf "%02d" $next`
5. **Generate slug** from description (kebab-case)
6. **Create phase directory:**
   ```bash
   mkdir -p ".planning/phases/${PHASE_NUM}-${SLUG}"
   ```
7. **Update ROADMAP.md** with new phase entry
8. **Update STATE.md** with roadmap evolution note

### Phase Entry Template

```markdown
### Phase {N}: {Description}

**Goal:** [To be planned]
**Depends on:** Phase {N-1}
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase {N} to break down)

**Details:**
[To be added during planning]
```

### Completion Output

Output this markdown directly (not as a code block):

Phase {N} added to current milestone:
- Description: {description}
- Directory: .planning/phases/{phase-num}-{slug}/
- Status: Not planned yet

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase {N}: {description}**

`/kata-planning-phases {N}`

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

## INSERT Phase Operation (Urgent)

Insert a decimal phase for urgent work between existing integer phases.

### When to Use

- Urgent work discovered mid-milestone
- Must complete BEFORE next integer phase
- Can't wait until end of milestone

### Workflow

1. **Parse target phase** (insert AFTER which phase)
2. **Parse description** from user request
3. **Verify target phase exists** in ROADMAP.md
4. **Find existing decimals** after target (e.g., 2.1, 2.2)
5. **Calculate next decimal:**
   - No existing decimals → `.1`
   - Has 2.1 → `.2`
   - Has 2.1, 2.2 → `.3`
6. **Generate slug** from description
7. **Create phase directory:**
   ```bash
   mkdir -p ".planning/phases/${DECIMAL_PHASE}-${SLUG}"
   # Example: .planning/phases/02.1-fix-critical-bug/
   ```
8. **Update ROADMAP.md** with `(INSERTED)` marker
9. **Update STATE.md** with evolution note

### Decimal Numbering Reference

See `./references/decimal-numbering.md` for detailed conventions.

Key rules:
- Format: `{two-digit-integer}.{decimal}` (e.g., `02.1`, not `2.1`)
- Execute in order: 2 → 2.1 → 2.2 → 3
- Mark with `(INSERTED)` in roadmap
- Directory naming matches: `02.1-fix-name/`

### Phase Entry Template (Inserted)

```markdown
### Phase {N.M}: {Description} (INSERTED)

**Goal:** [Urgent work - to be planned]
**Depends on:** Phase {N}
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata:plan-phase {N.M} to break down)

**Details:**
[To be added during planning]
```

## REMOVE Phase Operation

Remove an unstarted future phase and renumber subsequent phases.

### Prerequisites

- Phase must be FUTURE (greater than current)
- Phase must be UNSTARTED (no SUMMARY.md files)
- User must confirm removal

### Workflow

1. **Parse target phase** from user request
2. **Load STATE.md** to find current phase
3. **Validate phase:**
   - Must exist in ROADMAP.md
   - Must be > current phase
   - No SUMMARY.md files in phase directory
4. **Gather info:**
   - Phase name from roadmap
   - Phase directory
   - Subsequent phases needing renumber
5. **Confirm with user:**
   ```
   Removing Phase {N}: {Name}

   This will:
   - Delete: .planning/phases/{N}-{slug}/
   - Renumber: Phases {N+1}-{M} → {N}-{M-1}

   Proceed? (y/n)
   ```
6. **Execute removal:**
   - Delete phase directory (if exists)
   - Renumber subsequent directories (descending order)
   - Rename files inside directories
   - Update ROADMAP.md (remove section, renumber)
   - Update STATE.md (phase count, progress)
   - Update internal references
7. **Commit changes:**
   ```bash
   git add .planning/
   git commit -m "chore: remove phase {N} ({original-name})"
   ```

### Renumbering Reference

See `./references/phase-operations.md` for detailed renumbering rules.

Key rules:
- Process in descending order (avoid conflicts)
- Rename directories: `18-dashboard` → `17-dashboard`
- Rename files: `18-01-PLAN.md` → `17-01-PLAN.md`
- Update dependencies: `Depends on: Phase 18` → `Phase 17`
- Handle decimals under removed integer

## PLAN-GAPS Operation

Create phases to close gaps identified by milestone audit.

### Prerequisites

Requires MILESTONE-AUDIT.md file from `/kata:audit-milestone`

### Workflow

1. **Load audit results:**
   ```bash
   ls -t .planning/v*-MILESTONE-AUDIT.md | head -1
   ```
2. **Parse gaps:**
   - `gaps.requirements` — unsatisfied requirements
   - `gaps.integration` — missing cross-phase connections
   - `gaps.flows` — broken E2E flows
3. **Prioritize gaps:**
   | Priority | Action                         |
   | -------- | ------------------------------ |
   | `must`   | Create phase, blocks milestone |
   | `should` | Create phase, recommended      |
   | `nice`   | Ask user: include or defer?    |
4. **Group into phases:**
   - Same affected phase → combine
   - Same subsystem → combine
   - Dependency order (fix stubs before wiring)
   - Keep phases focused: 2-4 tasks each
5. **Calculate phase numbers** (continue from highest)
6. **Present gap closure plan:**
   ```markdown
   ## Gap Closure Plan

   **Gaps to close:** {N} requirements, {M} integration, {K} flows

   ### Proposed Phases

   **Phase {N}: {Name}**
   Closes:
   - {REQ-ID}: {description}
   - Integration: {from} → {to}

   Create these {X} phases? (yes / adjust / defer all optional)
   ```
7. **On confirmation:**
   - Update ROADMAP.md with new phases
   - Create phase directories
   - Commit roadmap update

### Gap-to-Phase Reference

See `./references/gap-planning.md` for mapping rules.

## Sub-Agent Spawning

For complex operations, spawn kata-roadmapper:

```
Task(
  prompt=roadmap_operation_prompt,
  subagent_type="kata-roadmapper",
  description="Execute {operation} for Phase {phase}"
)
```

### When to Spawn

| Operation    | Spawn Agent? | Reason                          |
| ------------ | ------------ | ------------------------------- |
| ADD (simple) | No           | Orchestrator handles directly   |
| INSERT       | Yes          | Complex ROADMAP.md updates      |
| REMOVE       | Yes          | Renumbering complexity          |
| PLAN-GAPS    | Yes          | Gap analysis and phase creation |

## Key References

For detailed guidance on specific operations:

- **Phase operations:** See `./references/phase-operations.md` for add, insert, remove workflows
- **Decimal numbering:** See `./references/decimal-numbering.md` for urgent insertion conventions
- **Gap planning:** See `./references/gap-planning.md` for audit-to-phase mapping

## Quality Standards

All roadmap operations must:

- [ ] Preserve roadmap formatting and structure
- [ ] Update STATE.md with evolution notes
- [ ] Maintain phase number continuity (no gaps)
- [ ] Use correct directory naming (`{NN}-{slug}` or `{NN.M}-{slug}`)
- [ ] Not modify completed phases
- [ ] Commit changes with descriptive message

## Anti-Patterns

- **Don't renumber completed phases** - Only future phases can be modified
- **Don't use decimal for planned work** - Decimals are for urgent insertions only
- **Don't create gaps** - Always renumber subsequent phases after removal
- **Don't skip confirmation** - Remove operation requires user confirmation
- **Don't commit without message** - Git history serves as audit trail
