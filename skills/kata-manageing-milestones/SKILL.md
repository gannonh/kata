---
name: kata-manageing-milestones
description: Use this skill when creating new milestones, completing milestones, archiving milestones, auditing milestones, or checking milestone coverage. Triggers include "new milestone", "create milestone", "start milestone", "complete milestone", "finish milestone", "archive milestone", "audit milestone", "check milestone", "milestone gaps", "milestone coverage", and "requirements coverage".
user-invocable: false
---

# Milestone Management Orchestrator

Handles milestone lifecycle: creation (questioning, research, requirements, roadmap), completion (archiving), and auditing (gap analysis).

## When to Use

- User asks to "start a new milestone" or "create milestone"
- User wants to "complete milestone" or "archive milestone"
- User needs to "audit milestone" or check requirements coverage
- User asks about "milestone gaps" or "missing requirements"

## Workflow Overview

```
1. Determine operation (new, complete, audit)
2. Execute appropriate workflow
3. Spawn sub-agents as needed
4. Present results with next steps
```

## Execution Flow

### Step 1: Determine Operation

Parse user request to identify operation type:

- **NEW:** "new milestone", "start milestone", "create milestone"
- **COMPLETE:** "complete milestone", "finish milestone", "archive milestone"
- **AUDIT:** "audit milestone", "check milestone", "coverage", "gaps"

### Step 2: Validate Environment

Check for Kata project structure:

```bash
ls .planning/ 2>/dev/null
```

If not found, user should run `/kata-starting-new-projects` first.

### Step 3: Route to Workflow

Based on operation type, execute the appropriate workflow:

---

## NEW MILESTONE Workflow

See `./references/milestone-creation.md` for complete details.

### Quick Flow

1. **Validate project exists**
   ```bash
   [ -f .planning/PROJECT.md ] || echo "Run /kata-starting-new-projects first"
   ```

2. **Check for active milestone**
   ```bash
   [ -f .planning/ROADMAP.md ] && echo "ACTIVE_MILESTONE"
   ```
   If active, ask: complete first or continue anyway?

3. **Present context**
   - Last milestone accomplishments (from MILESTONES.md)
   - Validated requirements (from PROJECT.md)
   - Pending todos (from STATE.md)

4. **Deep questioning**
   - Ask: "What do you want to build next?"
   - Follow threads, probe vague terms
   - Challenge assumptions, find edges
   - Loop until ready to proceed

5. **Determine version**
   - Parse last version from MILESTONES.md
   - Suggest patch/major options
   - Allow custom version

6. **Update PROJECT.md**
   - Add "Current Milestone" section
   - Update Active requirements
   - Commit

7. **Research decision**
   If user wants research, spawn 4 parallel researchers:
   ```
   Task(
     prompt="Research [dimension] for [domain]...",
     subagent_type="kata-project-researcher",
     description="[Dimension] research"
   )
   ```
   Dimensions: Stack, Features, Architecture, Pitfalls
   Then spawn synthesizer for SUMMARY.md

8. **Define requirements**
   - Present features by category
   - Scope each category (multiSelect)
   - Identify gaps
   - Generate REQUIREMENTS.md with REQ-IDs
   - Commit

9. **Create roadmap**
   Spawn kata-roadmapper:
   ```
   Task(
     prompt="Create roadmap from requirements...
       @.planning/PROJECT.md
       @.planning/REQUIREMENTS.md
       @.planning/research/SUMMARY.md (if exists)
       Starting phase number: [N]",
     subagent_type="kata-roadmapper",
     description="Create roadmap"
   )
   ```

10. **Present completion.** Output this markdown directly (not as a code block):

    KATA > MILESTONE INITIALIZED

    **v[X.Y] [Name]**

    | Artifact     | Location                  |
    | ------------ | ------------------------- |
    | Project      | .planning/PROJECT.md      |
    | Research     | .planning/research/       |
    | Requirements | .planning/REQUIREMENTS.md |
    | Roadmap      | .planning/ROADMAP.md      |

    ───────────────────────────────────────────────────────────

    ## ▶ Next Action

    **Phase [N]: [Name]** — [Goal]

    > Instructions can be given conversationally (recommended) or via /commands.

    | Action                | Natural Trigger    | Explicit Command        |
    | --------------------- | ------------------ | ----------------------- |
    | ⭐ **Plan the phase** | "Plan phase [N]"   | `/kata-planning-phases` |

    <sub>★ recommended · /clear first → fresh context window</sub>

    ───────────────────────────────────────────────────────────

---

## COMPLETE MILESTONE Workflow

See `./references/milestone-completion.md` for complete details.

### Quick Flow

1. **Check for audit**
   ```bash
   ls .planning/v*-MILESTONE-AUDIT.md 2>/dev/null
   ```
   - No audit: recommend `/kata-manageing-milestones audit` first
   - Audit has gaps: recommend `/kata-managing-project-roadmap`
   - Audit passed: proceed

2. **Verify readiness**
   - All phases in milestone have SUMMARY.md
   - Present scope and stats
   - Wait for confirmation

3. **Gather stats**
   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline

4. **Extract accomplishments**
   - Read all phase SUMMARY.md files
   - Extract 4-6 key accomplishments

5. **Archive milestone**
   - Create `.planning/milestones/v[X.Y]-ROADMAP.md`
   - Create `.planning/milestones/v[X.Y]-REQUIREMENTS.md`
   - Delete originals (fresh for next milestone)

6. **Update PROJECT.md**
   - Move shipped requirements to Validated
   - Add "Current State" section
   - Update Key Decisions

7. **Commit and tag**
   ```bash
   git tag -a v[X.Y] -m "[milestone summary]"
   git commit -m "chore: complete v[X.Y] milestone"
   ```

8. **Present completion.** Output this markdown directly (not as a code block):

   KATA > MILESTONE v[X.Y] COMPLETE 🎉

   Archived:
   - milestones/v[X.Y]-ROADMAP.md
   - milestones/v[X.Y]-REQUIREMENTS.md

   ───────────────────────────────────────────────────────────

   ## ▶ Next Action

   **Start next milestone** — questioning → research → requirements → roadmap

   > Instructions can be given conversationally (recommended) or via /commands.

   | Action                     | Natural Trigger | Explicit Command             |
   | -------------------------- | --------------- | ---------------------------- |
   | ⭐ **Start new milestone** | "New milestone" | `/kata-manageing-milestones` |

   <sub>★ recommended · /clear first → fresh context window</sub>

   ───────────────────────────────────────────────────────────

---

## AUDIT MILESTONE Workflow

See `./references/milestone-auditing.md` for complete details.

### Quick Flow

1. **Determine scope**
   - Parse version from arguments or detect from ROADMAP.md
   - Identify phase directories in scope
   - Extract milestone definition of done

2. **Read phase verifications**
   For each phase, extract from VERIFICATION.md:
   - Status (passed/gaps_found)
   - Critical gaps (blockers)
   - Non-critical gaps (tech debt)
   - Anti-patterns (TODOs, stubs)

3. **Spawn integration checker**
   ```
   Task(
     prompt="Check cross-phase integration and E2E flows.
       Phases: {phase_dirs}
       Phase exports: {from SUMMARYs}
       API routes: {routes created}",
     subagent_type="kata-integration-checker",
     description="Integration check"
   )
   ```

4. **Check requirements coverage**
   For each requirement:
   - Find owning phase
   - Check phase verification status
   - Determine: satisfied | partial | unsatisfied

5. **Create audit report**
   Write `.planning/v{version}-MILESTONE-AUDIT.md` with:
   ```yaml
   ---
   milestone: {version}
   audited: {timestamp}
   status: passed | gaps_found | tech_debt
   scores:
     requirements: N/M
     phases: N/M
     integration: N/M
   ---
   ```

6. **Present results**
   Route by status:

   **If passed:** Output this markdown directly (not as a code block):

   ───────────────────────────────────────────────────────────

   ## ▶ Next Action

   **Audit passed** — proceed to milestone completion

   > Instructions can be given conversationally (recommended) or via /commands.

   | Action                      | Natural Trigger      | Explicit Command             |
   | --------------------------- | -------------------- | ---------------------------- |
   | ⭐ **Complete milestone**   | "Complete milestone" | `/kata-manageing-milestones` |

   <sub>★ recommended · /clear first → fresh context window</sub>

   ───────────────────────────────────────────────────────────

   **If gaps_found:** Output this markdown directly (not as a code block):

   ───────────────────────────────────────────────────────────

   ## ▶ Next Action

   **Gaps found** — plan closure phases

   > Instructions can be given conversationally (recommended) or via /commands.

   | Action                    | Natural Trigger      | Explicit Command                 |
   | ------------------------- | -------------------- | -------------------------------- |
   | ⭐ **Plan gaps**          | "Plan gaps"          | `/kata-managing-project-roadmap` |
   | Complete anyway           | "Complete milestone" | `/kata-manageing-milestones`     |

   <sub>★ recommended · /clear first → fresh context window</sub>

   ───────────────────────────────────────────────────────────

   **If tech_debt:** Choose to complete or plan cleanup

---

## Key References

For detailed guidance:

- **Creation workflow:** See `./references/milestone-creation.md`
- **Completion workflow:** See `./references/milestone-completion.md`
- **Auditing workflow:** See `./references/milestone-auditing.md`

## Sub-Agent Summary

| Agent                               | Purpose                             | When Spawned                     |
| ----------------------------------- | ----------------------------------- | -------------------------------- |
| kata-project-researcher             | Research domain (4 dimensions)      | New milestone with research      |
| kata-researching-phases-synthesizer | Create research SUMMARY.md          | After researchers complete       |
| kata-roadmapper                     | Create ROADMAP.md from requirements | New milestone after requirements |
| kata-integration-checker            | Verify cross-phase wiring           | Audit milestone                  |

## Quality Standards

Milestones must satisfy:

- [ ] Clear version identifier (v1.0, v1.1, v2.0)
- [ ] Requirements scoped with REQ-IDs
- [ ] All v1 requirements mapped to phases (100% coverage)
- [ ] Proper archiving before deletion
- [ ] STATE.md updated after each operation
- [ ] Git commits at appropriate checkpoints
