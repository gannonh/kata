# Kata Workflow Diagrams

Mermaid flow diagrams documenting Kata's major workflow paths.

## 1. High-Level Orchestration

How users interact with skills, which orchestrate agents.

```mermaid
%%{init: {'theme': 'dark'}}%%
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

> **Note:** This diagram shows the core skill-to-agent pattern. Additional skills include `adding-milestones`, `reviewing-pull-requests`, and `completing-milestones`. Additional agents include `kata-project-researcher`, `kata-phase-researcher`, `kata-plan-checker`, `kata-debugger`, `kata-code-reviewer`, and others. See [GLOSSARY.md](GLOSSARY.md) for the complete list.

## 2. Project Lifecycle

State machine from project creation to milestone completion.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph Init["Project Initialization"]
        NP["/kata:kata-new-project"]
        PROJ["PROJECT.md"]
        CFG["config.json"]
    end

    subgraph Milestone["Milestone Definition"]
        AMI["/kata:kata-add-milestone"]
        REQ["REQUIREMENTS.md"]
        ROAD["ROADMAP.md"]
    end

    subgraph Phase["Phase Work"]
        PLN["/kata:kata-plan-phase"]
        PLAN["PLAN.md files"]
        EXE["/kata:kata-execute-phase"]
        SUM["SUMMARY.md files"]
        VER["/kata:kata-verify-work"]
        UAT["UAT.md"]
    end

    subgraph Complete["Completion"]
        AUD["/kata:kata-audit-milestone"]
        CMP["/kata:kata-complete-milestone"]
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

## 3. Planning Flow

The planning-phases skill workflow with research and verification loop.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    START["/kata:kata-plan-phase N"]

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

## 4. Execution Flow

The executing-phases skill workflow with wave parallelization.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    START["/kata:kata-execute-phase N"]

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
    GAPS -->|"/kata:kata-plan-phase --gaps"| START
    HUMAN --> OFFER
```

## 5. Verification Flow

The verifying-work skill workflow for UAT and gap closure.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    START["/kata:kata-verify-work N"]

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
        ROUTE_A["/kata:kata-execute-phase (next)"]
        ROUTE_B["/kata:kata-audit-milestone"]
        ROUTE_C["/kata:kata-execute-phase --gaps-only"]
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

## 6. PR Workflow

Branch-based pull request workflow with GitHub integration.

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    subgraph Config["Configuration"]
        CFG{"pr_workflow: true?"}
        GH{"github.enabled?"}
    end

    subgraph PhaseStart["Phase Start"]
        EXEC["/kata:kata-execute-phase N"]
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
        UAT["/kata:kata-verify-work (UAT)"]
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
        COMPLETE["/kata:kata-complete-milestone"]
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
