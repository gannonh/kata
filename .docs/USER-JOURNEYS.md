# Kata Orchestrator: User Journeys

This document maps the complete user experience through Kata's spec-driven development workflows, showing how skills orchestrate specialized agents to deliver structured, traceable development processes.

---

## Table of Contents

1. [High-Level Orchestration](#1-high-level-orchestration)
2. [Project Lifecycle](#2-project-lifecycle)
3. [Planning Flow](#3-planning-flow)
4. [Execution Flow](#4-execution-flow)  
5. [Verification Flow](#5-verification-flow)
6. [PR Workflow](#6-pr-workflow)
7. [Quick Reference](#quick-reference)

---

## 1. High-Level Orchestration

**Pattern:** User → Skill (Orchestrator) → Agent (Specialist)

This is the fundamental architecture of Kata Orchestrator. Users interact with **skills** using natural language or slash commands. Skills act as **thin orchestrators** (~15% context budget), spawning **specialized agents** that receive fresh context (100% of 200k tokens) to perform deep work.

```mermaid
flowchart LR
    subgraph User["User Interface"]
        CMD["/kata:kata-skill-name"]
        NL["Natural Language"]
    end

    subgraph Skills["Skills (Orchestrators)"]
        SP["starting-projects"]
        PP["planning-phases"]
        EP["executing-phases"]
        VW["verifying-work"]
    end

    subgraph Agents["Subagents"]
        RM["kata-roadmapper"]
        PL["kata-planner"]
        EX["kata-executor"]
        VF["kata-verifier"]
    end

    CMD --> Skills
    NL --> Skills

    SP --> RM
    PP --> PL
    EP --> EX
    VW --> VF
```

> **Note:** This diagram shows the core skill-to-agent pattern. The complete Kata suite includes 27 skills and 19 specialized agents. See the [full catalog](#quick-reference) below.

### Why This Architecture?

**Context efficiency:** Skills stay lean by delegating deep work to agents. Each agent loads full project context (PROJECT.md, ROADMAP.md, research, etc.) in a fresh 200k token window.

**Specialization:** Agents are purpose-built:
- `kata-planner` → Creates execution plans with dependency analysis
- `kata-executor` → Executes a single plan with checkpointing
- `kata-verifier` → Post-execution goal verification
- `kata-debugger` → Root cause analysis for failures
- `kata-code-reviewer` → PR code review with 6 analysis dimensions

**Natural invocation:**
```
User: "plan phase 2"
Assistant: [Invokes /kata:kata-planning-phases 2]

User: "execute the foundation phase"
Assistant: [Invokes /kata:kata-executing-phases 1]

User: "run UAT on phase 3"
Assistant: [Invokes /kata:kata-verifying-work 3]
```

---

## 2. Project Lifecycle

**Journey:** Project initialization → Milestone definition → Phase work (plan → execute → verify) → Completion → Release

This state machine shows the complete development lifecycle managed by Kata.

```mermaid
flowchart TD
    subgraph Init["Project Initialization"]
        NP["/kata:kata-starting-projects"]
        PROJ["PROJECT.md"]
        CFG["config.json"]
    end

    subgraph Milestone["Milestone Definition"]
        AMI["/kata:kata-adding-milestones"]
        REQ["REQUIREMENTS.md"]
        ROAD["ROADMAP.md"]
    end

    subgraph Phase["Phase Work"]
        PLN["/kata:kata-planning-phases"]
        PLAN["PLAN.md files"]
        EXE["/kata:kata-executing-phases"]
        SUM["SUMMARY.md files"]
        VER["/kata:kata-verifying-work"]
        UAT["UAT.md"]
    end

    subgraph Complete["Completion"]
        AUD["/kata:kata-auditing-milestones"]
        CMP["/kata:kata-completing-milestones"]
        TAG["Git tag + Release"]
    end

    NP --> PROJ
    NP --> CFG
    PROJ --> AMI
    AMI --> REQ
    AMI --> ROAD
    ROAD --> PLN
    PLN --> PLAN
    PLAN --> EXE
    EXE --> SUM
    SUM --> VER
    VER --> UAT
    UAT -->|"All phases done"| AUD
    UAT -->|"More phases"| PLN
    AUD --> CMP
    CMP --> TAG
    TAG -->|"Next milestone"| AMI
```

### Artifact Trail

Each stage produces traceable artifacts in `.planning/`:

| Stage | Artifacts | Purpose |
|-------|-----------|---------|
| **Initialization** | `PROJECT.md`, `config.json` | Vision, requirements, workflow config |
| **Milestone** | `REQUIREMENTS.md`, `ROADMAP.md` | Scoped requirements (IDs), phase structure |
| **Planning** | `phases/NN-name/NN-NN-PLAN.md`, `RESEARCH.md` | Executable plans, research context |
| **Execution** | `phases/NN-name/NN-NN-SUMMARY.md` | Deliverables, implementation notes |
| **Verification** | `phases/NN-name/NN-VERIFICATION.md`, `UAT.md` | UAT results, gap analysis |
| **Completion** | `milestones/vX.Y.Z/`, Git tag | Archived work, release notes |

---

## 3. Planning Flow

**Skill:** `/kata:kata-planning-phases N`  
**Purpose:** Create executable PLAN.md files for a phase with optional research and mandatory verification

This workflow ensures every phase has thoroughly researched, validated plans before execution begins.

```mermaid
flowchart TD
    START["/kata:kata-planning-phases N"]

    subgraph Validate["Validation"]
        CHK{"Phase exists?"}
        DIR["Ensure phase directory"]
    end

    subgraph Research["Research (optional)"]
        RCHK{"Research needed?"}
        RSKIP["Skip research"]
        SPAWN_R["Spawn kata-phase-researcher"]
        RES["RESEARCH.md"]
    end

    subgraph Plan["Planning"]
        SPAWN_P["Spawn kata-planner"]
        PLANS["PLAN.md files created"]
    end

    subgraph Verify["Verification Loop"]
        VCHK{"Verify plans?"}
        SPAWN_C["Spawn kata-plan-checker"]
        PASS{"Passed?"}
        ISSUES["Issues found"]
        REVISE["Revision iteration"]
        MAX{"Max iterations?"}
        FORCE["User decision: force/retry/abort"]
    end

    subgraph Done["Completion"]
        GH["Update GitHub Issue"]
        DONE["Plans ready for execution"]
    end

    START --> CHK
    CHK -->|"No"| ERROR["Error: Phase not in roadmap"]
    CHK -->|"Yes"| DIR
    DIR --> RCHK
    RCHK -->|"--skip-research"| SPAWN_P
    RCHK -->|"Research exists"| SPAWN_P
    RCHK -->|"Needs research"| SPAWN_R
    SPAWN_R --> RES
    RES --> SPAWN_P
    SPAWN_P --> PLANS
    PLANS --> VCHK
    VCHK -->|"--skip-verify"| GH
    VCHK -->|"Verify"| SPAWN_C
    SPAWN_C --> PASS
    PASS -->|"Yes"| GH
    PASS -->|"No"| ISSUES
    ISSUES --> MAX
    MAX -->|"< 3"| REVISE
    REVISE --> SPAWN_P
    MAX -->|">= 3"| FORCE
    FORCE -->|"Force proceed"| GH
    FORCE -->|"Retry"| SPAWN_P
    GH --> DONE
```

---

## 4. Execution Flow

**Skill:** `/kata:kata-executing-phases N`  
**Purpose:** Execute all plans in a phase with wave-based parallelization, checkpointing, and verification

This is the execution engine of Kata, orchestrating parallel agents with automatic dependency resolution.

```mermaid
flowchart TD
    START["/kata:kata-executing-phases N"]

    subgraph Setup["Setup"]
        VAL["Validate phase exists"]
        DISC["Discover PLAN.md files"]
        WAVE["Group by wave number"]
        BRANCH["Create phase branch (if pr_workflow)"]
    end

    subgraph Execute["Wave Execution"]
        W1["Wave 1"]
        W2["Wave 2"]
        WN["Wave N..."]
        SPAWN["Spawn kata-executor (parallel per wave)"]
        SUMM["SUMMARY.md per plan"]
        CHKPT{"Checkpoint?"}
        PAUSE["Pause for user"]
        RESUME["Fresh continuation agent"]
        GHUPD["Update GitHub Issue checkboxes"]
        PR["Create draft PR (first wave)"]
    end

    subgraph Verify["Post-Execution"]
        VER["Spawn kata-verifier"]
        VSTAT{"Status?"}
        PASSED["Goal verified"]
        GAPS["Gaps found"]
        HUMAN["Human review needed"]
    end

    subgraph Complete["Completion"]
        UPD["Update ROADMAP.md, STATE.md"]
        COMMIT["Commit phase completion"]
        PRREADY["Mark PR ready"]
        OFFER["Offer: UAT / PR review / Merge / Skip"]
    end

    START --> VAL
    VAL --> DISC
    DISC --> WAVE
    WAVE --> BRANCH
    BRANCH --> W1
    W1 --> SPAWN
    SPAWN --> SUMM
    SUMM --> CHKPT
    CHKPT -->|"Yes"| PAUSE
    PAUSE --> RESUME
    RESUME --> SUMM
    CHKPT -->|"No"| GHUPD
    GHUPD --> PR
    PR --> W2
    W2 --> WN
    WN --> VER
    VER --> VSTAT
    VSTAT -->|"passed"| PASSED
    VSTAT -->|"gaps_found"| GAPS
    VSTAT -->|"human_needed"| HUMAN
    PASSED --> UPD
    UPD --> COMMIT
    COMMIT --> PRREADY
    PRREADY --> OFFER
    GAPS -->|"/kata:kata-planning-phases --gaps"| START
    HUMAN --> OFFER
```

---

## 5. Verification Flow

**Skill:** `/kata:kata-verifying-work N`  
**Purpose:** Conversational UAT (User Acceptance Testing) with automated gap diagnosis and fix planning

This workflow transforms deliverables into testable assertions and guides users through validation.

```mermaid
flowchart TD
    START["/kata:kata-verifying-work N"]

    subgraph Extract["Extract Tests"]
        FIND["Find SUMMARY.md files"]
        EXTRACT["Extract testable deliverables"]
        CREATE["Create UAT.md"]
    end

    subgraph Test["Conversational Testing"]
        PRESENT["Present test one at a time"]
        WAIT["Wait for user response"]
        PASS{"Pass?"}
        LOG_P["Log: passed"]
        LOG_F["Log: failed + severity"]
        NEXT{"More tests?"}
    end

    subgraph Results["Process Results"]
        ALL_PASS{"All passed?"}
        DONE["UAT complete"]
        ISSUES["Issues found"]
    end

    subgraph Diagnose["Gap Diagnosis"]
        SPAWN_D["Spawn kata-debugger (parallel)"]
        DIAG["Root cause analysis"]
    end

    subgraph Fix["Fix Planning"]
        SPAWN_P["Spawn kata-planner --gaps"]
        FIX_PLANS["Gap closure plans"]
        SPAWN_C["Spawn kata-plan-checker"]
        VPASS{"Passed?"}
        ITERATE["Iterate (max 3)"]
        READY["Fix plans ready"]
        BLOCKED["Planning blocked"]
    end

    subgraph Output["Completion"]
        ROUTE_A["/kata:kata-planning-phases (next)"]
        ROUTE_B["/kata:kata-auditing-milestones"]
        ROUTE_C["/kata:kata-executing-phases --gaps-only"]
        ROUTE_D["Manual intervention"]
    end

    START --> FIND
    FIND --> EXTRACT
    EXTRACT --> CREATE
    CREATE --> PRESENT
    PRESENT --> WAIT
    WAIT --> PASS
    PASS -->|"yes/y/next"| LOG_P
    PASS -->|"issue described"| LOG_F
    LOG_P --> NEXT
    LOG_F --> NEXT
    NEXT -->|"Yes"| PRESENT
    NEXT -->|"No"| ALL_PASS
    ALL_PASS -->|"Yes + more phases"| ROUTE_A
    ALL_PASS -->|"Yes + last phase"| ROUTE_B
    ALL_PASS -->|"No"| ISSUES
    ISSUES --> SPAWN_D
    SPAWN_D --> DIAG
    DIAG --> SPAWN_P
    SPAWN_P --> FIX_PLANS
    FIX_PLANS --> SPAWN_C
    SPAWN_C --> VPASS
    VPASS -->|"Yes"| READY
    VPASS -->|"No"| ITERATE
    ITERATE -->|"< 3"| SPAWN_P
    ITERATE -->|">= 3"| BLOCKED
    READY --> ROUTE_C
    BLOCKED --> ROUTE_D
```

---

## 6. PR Workflow

**Configuration:** `pr_workflow: true` in `config.json`  
**Purpose:** Branch-based pull request workflow with GitHub integration

This optional workflow creates isolated branches per phase with draft PRs for review.

```mermaid
flowchart TD
    subgraph Config["Configuration"]
        CFG{"pr_workflow: true?"}
        GH{"github.enabled?"}
    end

    subgraph PhaseStart["Phase Start"]
        EXEC["/kata:kata-executing-phases N"]
        BRANCH["Create branch: feat/vX.Y-N-slug"]
        CHECKOUT["Checkout branch"]
    end

    subgraph Execution["During Execution"]
        TASKS["Execute tasks"]
        COMMITS["Atomic commits per task"]
        W1_DONE["First wave complete"]
        PUSH["Push branch"]
        DRAFT["Create draft PR"]
        LINK["Link to phase GitHub Issue"]
    end

    subgraph Complete["Phase Complete"]
        VERIFY["Verification passed"]
        FINAL["Final commits pushed"]
        READY["Mark PR ready for review"]
    end

    subgraph Review["Review Options"]
        UAT["/kata:kata-verifying-work (UAT)"]
        PRREV["/kata:kata-reviewing-pull-requests"]
        AGENTS["6 specialized review agents"]
        FINDINGS["Aggregate findings"]
        FIX["Fix critical/important"]
        BACKLOG["Add suggestions to backlog"]
    end

    subgraph Merge["Merge Flow"]
        APPROVE["PR approved"]
        MERGE["Merge to main"]
        DELETE["Delete branch"]
        CLOSE["Close phase issue"]
    end

    subgraph Release["Release (Milestone Complete)"]
        ALL_MERGED["All phase PRs merged"]
        COMPLETE["/kata:kata-completing-milestones"]
        TAG["Create Git tag"]
        RELEASE["GitHub Release"]
        NOTES["Auto-generate release notes"]
    end

    CFG -->|"Yes"| EXEC
    CFG -->|"No"| DIRECT["Commit directly to main"]
    EXEC --> GH
    GH -->|"Yes"| BRANCH
    GH -->|"No"| BRANCH
    BRANCH --> CHECKOUT
    CHECKOUT --> TASKS
    TASKS --> COMMITS
    COMMITS --> W1_DONE
    W1_DONE --> PUSH
    PUSH --> DRAFT
    DRAFT --> LINK
    LINK --> VERIFY
    VERIFY --> FINAL
    FINAL --> READY
    READY --> UAT
    UAT --> PRREV
    PRREV --> AGENTS
    AGENTS --> FINDINGS
    FINDINGS --> FIX
    FIX --> BACKLOG
    BACKLOG --> APPROVE
    APPROVE --> MERGE
    MERGE --> DELETE
    DELETE --> CLOSE
    CLOSE --> ALL_MERGED
    ALL_MERGED --> COMPLETE
    COMPLETE --> TAG
    TAG --> RELEASE
    RELEASE --> NOTES
```

---

## Quick Reference

### All Skills (27)

**Project Lifecycle:**
- `/kata:kata-starting-projects` - Initialize PROJECT.md with deep questioning
- `/kata:kata-adding-milestones` - Create requirements + roadmap
- `/kata:kata-planning-phases` - Create PLAN.md files with research
- `/kata:kata-executing-phases` - Wave-based execution
- `/kata:kata-verifying-work` - Conversational UAT
- `/kata:kata-auditing-milestones` - Pre-completion audit
- `/kata:kata-completing-milestones` - Archive + release

**Phase Operations:**
- `/kata:kata-discussing-phases` - Phase definition conversation
- `/kata:kata-researching-phases` - Deep research only
- `/kata:kata-archiving-phases` - Move phase to archive
- `/kata:kata-canceling-phases` - Cancel in-progress phase
- `/kata:kata-inserting-phases` - Insert new phase in roadmap
- `/kata:kata-moving-phases` - Reorder phases
- `/kata:kata-renaming-phases` - Rename phase

**Pull Request:**
- `/kata:kata-reviewing-pull-requests` - Spawn 6 review agents

**Debugging:**
- `/kata:kata-debugging` - General debugging with kata-debugger
- `/kata:kata-finding-silent-failures` - Detect subtle bugs

**Todo Management:**
- `/kata:kata-adding-todos` - Add structured todos
- `/kata:kata-completing-todos` - Mark todos complete
- `/kata:kata-listing-todos` - Show all todos
- `/kata:kata-prioritizing-todos` - Reorder by priority

**Tracking:**
- `/kata:kata-tracking-progress` - Status reports
- `/kata:kata-tracking-requirements` - Requirement coverage

**Utility:**
- `/kata:kata-continuing-work` - Resume after checkpoint
- `/kata:kata-mapping-codebase` - Generate codebase map
- `/kata:kata-reviewing-docs` - Documentation review

### All Agents (19)

**Planning:**
- `kata-planner` - Creates PLAN.md files
- `kata-plan-checker` - Validates plans
- `kata-roadmapper` - Creates ROADMAP.md

**Execution:**
- `kata-executor` - Executes single plan
- `kata-verifier` - Post-execution verification

**Research:**
- `kata-project-researcher` - Project-level research
- `kata-phase-researcher` - Phase-specific research
- `kata-research-synthesizer` - Consolidate findings
- `kata-codebase-mapper` - Generate codebase map
- `kata-integration-checker` - Validate integrations

**Debugging:**
- `kata-debugger` - Root cause analysis
- `kata-failure-finder` - Find breaking changes
- `kata-silent-failure-hunter` - Detect subtle bugs

**Review:**
- `kata-code-reviewer` - Code quality review
- `kata-pr-test-analyzer` - Test coverage analysis
- `kata-type-design-analyzer` - TypeScript/type analysis
- `kata-comment-analyzer` - Documentation coverage
- `kata-code-simplifier` - Suggest simplifications

**Entity:**
- `kata-entity-generator` - Generate data models

---

## Key Concepts

### Plans ARE Prompts

PLAN.md files are **executable XML documents**, not just markdown descriptions. The planner crafts these as precise instructions for the executor agent.

**Example plan structure:**

```xml
<plan>
  <context>
    @.planning/PROJECT.md
    @.planning/REQUIREMENTS.md (REQ-001, REQ-003)
    @src/models/task.ts
  </context>

  <objective>
    Implement REST API endpoints for task CRUD operations
  </objective>

  <wave>1</wave>
  <depends_on></depends_on>

  <tasks>
    <task>
      <description>Create Express router for /tasks</description>
      <acceptance>
        - Router file exists at src/routes/tasks.ts
        - Router registered in src/app.ts
        - TypeScript compiles without errors
      </acceptance>
    </task>

    <task>
      <description>Implement GET /tasks endpoint</description>
      <implementation_notes>
        - Use Task model from src/models/task.ts
        - Return all tasks from database
        - Handle empty result (return empty array)
        - Error handling: 500 on database errors
      </implementation_notes>
      <acceptance>
        - Endpoint responds to GET /tasks
        - Returns JSON array of tasks
        - Status code 200 on success
        - Status code 500 on errors
      </acceptance>
      <test_requirements>
        - Unit test: mock database, verify task return
        - Integration test: real database, verify full flow
        - Error test: database failure returns 500
      </test_requirements>
    </task>
  </tasks>

  <verification>
    <command>npm test</command>
    <success_criteria>
      - All tests pass
      - Coverage > 80% for new files
    </success_criteria>
  </verification>
</plan>
```

The executor reads this as its primary instruction set, supplemented with full project context.

### Wave-Based Parallelization

**Why waves?** Plans often have dependencies. Running them in parallel would cause race conditions or missing prerequisites.

**How it works:**
1. Planner analyzes dependencies
2. Assigns wave numbers (1 = foundation, 2+ = depends on earlier waves)
3. Executor groups by wave
4. Runs wave 1 plans in parallel
5. Waits for all wave 1 to complete
6. Runs wave 2 plans in parallel
7. Continues until complete

**Example:**

```
Phase 2: API Layer

Wave 1 (parallel):
  - 02-01-database-models.md (foundation)
  - 02-02-api-types.md (foundation)

Wave 2 (depends on wave 1):
  - 02-03-rest-endpoints.md (needs models)
  - 02-04-graphql-schema.md (needs types)

Wave 3 (depends on wave 2):
  - 02-05-api-tests.md (needs endpoints)
```

### Thin Orchestrators, Fresh Agents

**Problem:** Long-running skills accumulate context, hitting token limits.

**Solution:** Skills stay lean (~15% context), delegating to fresh agents (100% context per spawn).

**Example:** `/kata:kata-executing-phases 3`

```
Skill context budget (~30k tokens):
  - Read ROADMAP.md
  - Discover PLAN.md files (3 plans)
  - Group by wave
  - Spawn 3 kata-executor agents (parallel)

Each agent's context budget (~200k tokens):
  - @.planning/PROJECT.md (full vision)
  - @.planning/REQUIREMENTS.md (all requirements)
  - @.planning/ROADMAP.md (full roadmap)
  - @.planning/phases/03-*/03-RESEARCH.md (research findings)
  - @.planning/phases/03-*/03-01-PLAN.md (just this plan)
  - @src/** (all relevant code files)
  - Full execution autonomy
```

---

## Configuration

**Location:** `.planning/config.json`

```json
{
  "mode": "interactive",              // "yolo" | "interactive"
  "depth": "standard",                // "quick" | "standard" | "comprehensive"
  "model_profile": "balanced",        // "quality" | "balanced" | "budget"
  "workflow": {
    "research": true,                 // Research before planning
    "plan_check": true,               // Verify plans
    "verifier": true                  // Post-execution verification
  },
  "github": {
    "enabled": false,                 // GitHub integration
    "issueMode": "auto",             // "auto" | "ask" | "never"
    "repo": "owner/repo"             // Auto-detected from git remote
  },
  "pr_workflow": false,               // Branch + PR per phase
  "commit_docs": true,                // Track .planning/ in git
  "parallelization": true             // Parallel plan execution
}
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-30  
**Maintainer:** Kata Orchestrator Team
