# Quick Wins Report: Agent Teams Integration for Kata

## Session Summary

Explorer-challenger debate on low-effort, high-impact ways to integrate Anthropic's agent teams into Kata. 7 proposals evaluated through 3 rounds of critique. Key finding: the decision heuristic for teams vs Task() maps to whether a workflow is **divergent** (brainstorming, debate, exploration) or **convergent** (planning, execution, verification). Kata's core pipeline is convergent; teams fit divergent standalone activities.

## Recommendations

### IMPLEMENT: Brainstorming as Kata Workflow

**Proposal:** Port the existing `brainstorming-with-explorer-challenger-teams` skill into Kata as `kata-brainstorm`. Auto-inject project context (PROJECT.md, ROADMAP.md, STATE.md, open issues), route outputs to `.planning/brainstorms/`, and offer to convert surviving proposals into Kata issues via `kata-add-issue`.

**Why this is the clear winner:**
- The skill already exists and works with agent teams. The integration is context injection and output routing, not new agent logic.
- The one-team-per-session limitation is acceptable because brainstorming is a standalone activity with a natural session boundary. Users brainstorm, then `/clear` and start planning.
- The issue creation integration connects ideation to Kata's execution pipeline: brainstorm -> issues -> milestone -> roadmap -> phases -> execution.
- Agent teams are the right tool here. Explorer/challenger debate is genuine peer interaction, not orchestrated coordination. The shared task list and messaging are load-bearing features, not overhead.

**Scope:** 1 phase, 2-3 plans. Port SKILL.md, add context injection, add output routing, add issue creation integration.

**Design decisions from debate:**
- Frame as an optional add-on workflow, not a core pipeline stage. Brainstorming does not appear in the Research -> Plan -> Execute -> Verify chain.
- Add project maturity guard: if PROJECT.md is under a threshold size or ROADMAP.md doesn't exist, warn that brainstorm quality will be limited.
- Prioritize issue creation integration over brainstorm mechanism refinement. The mechanism works; the pipeline connection is the new value.

**Existing issue:** `.planning/issues/open/2026-02-05-integrate-brainstorming-skill-into-kata.md` already captures this request.

---

### IMPLEMENT (NON-TEAMS): Automated Research Retry on Planning Failure

**Derived from Proposal 2 (Researcher Cross-Talk).**

**Problem:** When the planner encounters a question the research didn't anticipate, it either guesses or returns PLANNING INCONCLUSIVE. The user must manually provide context or retry. This is the biggest quality gap in the planning pipeline.

**Solution (no teams required):** Automate the INCONCLUSIVE -> re-research -> retry loop within kata-plan-phase. When the planner returns PLANNING INCONCLUSIVE with a structured question, the orchestrator extracts the question, spawns a focused researcher Task() with that specific query, feeds the answer back into a new planner Task(). This preserves the existing sequential Task() model, RESEARCH.md artifact creation, and orchestrator control.

**Why teams are wrong for this:** The Research -> Plan -> Verify flow is inherently sequential. The orchestrator needs to control iteration count, artifact creation, and state transitions. Converting to a team trades orchestrator control for peer messaging, which adds complexity without proportional benefit. The "planner asks researcher a question" scenario is better modeled as an orchestrator-mediated retry than as a peer DM.

**Scope:** Medium. Modify kata-plan-phase steps 8-12 to handle INCONCLUSIVE with an automated re-research path. The planner agent needs a structured RESEARCH_QUERY return format alongside PLANNING COMPLETE and PLANNING INCONCLUSIVE.

---

### IMPLEMENT (NON-TEAMS): Per-Wave Verification

**Derived from Proposal 5 (Live Verification During Execution).**

**Problem:** Verification runs once after ALL waves complete. If wave 1 produces stubs, waves 2-3 build on top of them. The gap-closure loop (verify -> plan -> execute -> verify) adds significant time.

**Solution (no teams required):** After each wave completes in kata-execute-phase (step 4), spawn a lightweight kata-verifier Task() that checks artifacts from that wave only. Per-wave verification criteria come from the wave's plans' `must_haves` frontmatter. The orchestrator decides whether to continue to the next wave or halt for gap closure.

**Why teams are wrong for this:** A verifier running continuously alongside executors produces false negatives (checking wiring between components that aren't all created yet). Per-wave verification at the orchestrator's checkpoint is cleaner: the wave is complete, all its artifacts exist, and the verifier can check them without race conditions.

**Scope:** Small-Medium. Add a Task() call in kata-execute-phase step 4 (after wave completion, before next wave). Define per-wave verification criteria. The verifier agent already has the right checks; the change is when it runs, not what it does.

---

### DEFERRED

**Proposal 1: Team-Based PR Review.** The one-team-per-session constraint is blocking because PR review occurs mid-session during kata-execute-phase step 10.6. Independent reviews producing diverse perspectives is a feature of the current design, not a limitation. Defer until agent teams support multiple teams per session.

**Proposal 6: Self-Coordinating Research Teams.** Marginal improvement over the current pattern. Independent parallel research followed by synthesis preserves perspective diversity. If implemented, scope to a single reconciliation round between research and synthesis, not continuous cross-talk. Low priority.

**Proposal 7: Interactive Debugging Teams.** The debugger agent is read-only (no Write/Edit tools). Three agents on the same codebase simultaneously recreates the concurrent-access problem Kata's wave model prevents. The current gap-closure loop (verify -> plan -> execute) is slow but reliable. Defer until agent teams mature and concurrent file access protocols exist.

### REJECTED

**Proposal 4: Parallel Wave Execution with Team Coordination.** Fundamentally undermines Kata's deterministic parallel execution model. The planner pre-computes waves, dependencies, and file ownership to make parallel execution safe without runtime coordination. Converting to team-based runtime negotiation trades correctness guarantees for agent improvisation. If file conflicts occur, the fix belongs in the planner (better file ownership analysis), not in the executor.

---

## Key Finding: Convergent vs. Divergent Workflows

This brainstorm produced a decision heuristic for when to use agent teams vs. Task() subagents in Kata.

**Divergent workflows -> Teams.** No single "correct" output. Value comes from agents disagreeing, pushing back, and refining through debate. The interaction is conversational. Examples: brainstorming, retrospectives, design reviews, competitive analysis.

**Convergent workflows -> Task().** Each step produces a defined artifact that feeds the next step. The orchestrator manages flow control, iteration limits, and state transitions. Deterministic execution order matters. Examples: research, planning, execution, verification.

**Kata's core pipeline (Research -> Plan -> Execute -> Verify) is convergent.** Each step produces an artifact (RESEARCH.md, PLAN.md, SUMMARY.md, VERIFICATION.md) consumed by the next step. The orchestrator controls sequencing, retry loops, and quality gates. Task() subagents give each step fresh context without coordination overhead.

**Brainstorming is divergent.** There is no "correct" output. Explorer/challenger debate produces better proposals precisely because agents push back on each other. Messaging and the shared task list are load-bearing features, not overhead.

**Practical heuristic for future integration decisions:** "Is this workflow convergent or divergent?" Convergent -> Task(). Divergent -> Teams.

---

## Task() Enhancements Surfaced by This Analysis

Three concrete improvements to existing Kata workflows emerged from proposals that were originally framed as teams integrations but turned out to be better served by Task() enhancements. These can ship independently of any teams work.

1. **Automated INCONCLUSIVE retry in kata-plan-phase** (from Proposal 2). When the planner returns PLANNING INCONCLUSIVE, the orchestrator extracts the structured question, spawns a focused researcher Task(), and feeds the answer into a new planner Task(). Eliminates the manual user intervention currently required.

2. **Per-wave verification in kata-execute-phase** (from Proposal 5). After each wave completes (step 4), spawn a kata-verifier Task() to check that wave's artifacts. Catches stubs and wiring issues before subsequent waves build on them, reducing gap-closure cycles.

3. **Post-research reconciliation in kata-new-project** (from Proposal 6). After 4 parallel researchers complete but before the synthesizer runs, add a single reconciliation round where researchers share key findings. Gives the synthesizer better input without the convergence risk of continuous cross-talk.

---

## Implementation Priority

1. **kata-brainstorm skill** — Genuine quick win. Skill exists. Port + integrate.
2. **Per-wave verification** — Small scope, high impact. Catches stubs earlier in the pipeline.
3. **Automated research retry** — Medium scope, addresses a documented failure mode in planning.
