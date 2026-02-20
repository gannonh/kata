# Plan: Strengthen Vertical Slicing in Milestone Planning Workflows

## Context

Kata already recommends vertical slicing in its roadmapper and planner instructions, but the guidance is scattered and lacks:
- Unified principles document explaining WHY vertical slices work
- Milestone-level evaluation criteria (current guidance focuses on task→plan→phase levels)
- Decision trees for common dilemmas (when to defer setup vs do it upfront)
- Explicit naming of anti-patterns (infrastructure-first, premature abstraction)
- Defense mechanisms against scope anxiety (pressure to combine plans)

**Key Principle:** PRs happen at the phase level. Every phase must be demo-able (shippable, testable, verifiable). Phase = PR = Demo unit.

**Goal:** Consolidate and strengthen vertical slicing guidance at all levels (milestone, phase, plan) with concrete evaluation criteria, decision trees, and anti-pattern examples. Emphasize that phases must be independently demo-able since they map to PRs.

## Implementation Approach

### 1. Create Foundational Reference: `slicing-principles.md`

**File:** `skills/kata-add-milestone/references/slicing-principles.md`

**Content structure:**
- Core philosophy (vertical = incremental value, horizontal = delayed value)
- **Phase = PR = Demo Unit** (emphasize demo-ability at phase completion)
- Three levels: Milestone, Phase, Plan
- Infrastructure Setup Decision Tree (inline vs dedicated vs defer)
- Scope Anxiety Defense (context degradation math)
- Anti-Patterns by Name (infrastructure-first, premature abstraction, scope creep)
- Case Studies (e-commerce MVP, SaaS dashboard - good vs bad examples)

**Why this location:** Milestone creation is the earliest decision point. Place principles where they'll cascade down to phase/plan decisions.

### 2. Create Evaluation Checklist: `milestone-scope-checklist.md`

**File:** `skills/kata-add-milestone/references/milestone-scope-checklist.md`

**Content structure:**
- User Value Check (shippable after milestone?)
- **Demo-ability Check (can you demo each phase? Phase = PR boundary)**
- Independence Check (phases loosely coupled?)
- Slicing Check (phases vertical not horizontal?)
- Red Flags (setup-only phases, layer-focused phases, strictly sequential, non-demo-able phases)
- Compression vs Splitting guidance
- Depth calibration (quick/standard/comprehensive)

**Purpose:** Concrete evaluation criteria roadmapper applies after creating ROADMAP.md draft.

### 3. Inject Slicing Evaluation into Roadmapper

**File:** `skills/kata-add-milestone/references/roadmapper-instructions.md`

**Change 1:** Add references in execution context (after line 32):
```markdown
<slicing_guidance>
@./slicing-principles.md
@./milestone-scope-checklist.md

Apply vertical slicing principles during phase identification and evaluation.
</slicing_guidance>
```

**Change 2:** Insert new `<milestone_evaluation>` section after `<phase_identification>` (after line 222):
- Run checklist: user value, **demo-ability (can you show what each phase does?)**, independence, slicing, red flags
- **Emphasize:** Phase = PR = Demo unit. If you can't demo it, phase is too small/incomplete or wrong boundary
- Common fixes: inline setup with first feature, identify parallel opportunities, regroup into vertical slices
- Reference case studies from slicing-principles.md

### 4. Enhance Phase Planner Guidance

**File:** `skills/kata-plan-phase/references/planner-instructions.md`

**Change 1:** Add reference at top of `<task_breakdown>` (after line 112):
```markdown
## Slicing Principles
@../../kata-add-milestone/references/slicing-principles.md
Apply at plan and task level.
```

**Change 2:** Insert new sections after "Task Sizing" (after line 178):
- **Infrastructure Setup: Inline vs Dedicated Phase** — Decision tree with examples
- **Defending Against Scope Anxiety** — Context degradation math showing 3 small plans outperform 1 large plan

### 5. Add Slicing Validation to Phase Insertion

**File:** `skills/kata-add-phase/SKILL.md`

**Change:** Insert new step 4.5 after phase number determination, before ROADMAP.md update (around line 150):
- Read slicing-principles.md
- Check: complete capability? feature-focused? independent execution?
- Red flags: horizontal layer name, excessive dependencies, continuation of previous phase
- Use AskUserQuestion if red flag detected, present alternative structure

## Critical Files

**New files:**
- `skills/kata-add-milestone/references/slicing-principles.md` — Foundational reference (philosophy, decision trees, anti-patterns, case studies)
- `skills/kata-add-milestone/references/milestone-scope-checklist.md` — Evaluation criteria

**Modified files:**
- `skills/kata-add-milestone/references/roadmapper-instructions.md` — Add slicing evaluation after phase identification (line ~222)
- `skills/kata-plan-phase/references/planner-instructions.md` — Add infrastructure decision tree and scope anxiety defense (line ~178)
- `skills/kata-add-phase/SKILL.md` — Add slicing validation before phase insertion (line ~150)

## Verification Approach

**Test Scenarios:**

1. **Demo-ability Test** — Create milestone with phases "Setup DB", "Create Models", "Add API"
   - Expected: Guidance flags non-demo-able phases, suggests regroup into "User Management (full stack)"

2. **Infrastructure-Heavy Project** — Milestone requiring DB + Auth + API + Workers + UI
   - Expected: Phases are feature-vertical (e.g., "User Auth full stack"), not layer-horizontal (e.g., "All Models")
   - Expected: Each phase independently demo-able (can show working login, working profile, etc.)

3. **Scope Anxiety** — Phase with 8 requirements compressible to 2-3 plans
   - Expected: Planner creates 4-5 plans, cites context quality curve

4. **Setup Decision** — E-commerce checkout with Stripe integration
   - Expected: Stripe setup inlined with first payment task (not dedicated phase)

5. **Mid-Milestone Insertion** — Add phase to existing milestone
   - Expected: Slicing validation runs, prevents horizontal layer insertion, checks demo-ability

**Validation Method:**
- Manual testing with deliberate anti-patterns (non-demo-able phases, horizontal layers)
- Verify agents reference slicing principles in their reasoning
- Confirm pushback on infrastructure-first patterns
- **Confirm agents ask "can you demo this phase?"** as evaluation criterion
- Check wave-based parallelism remains optimal

## Integration Points

**Where guidance loads:**
- Milestone Creation (`/kata-add-milestone`) → Roadmapper loads principles, runs checklist
- Phase Planning (`/kata-plan-phase`) → Planner loads principles, applies decision trees
- Phase Insertion (`/kata-add-phase`) → Skill validates before ROADMAP update

**Backward compatibility:** All additive changes. No breaking modifications. No migration required.
