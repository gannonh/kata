# High-Value Features: Agent Teams for Kata -- Final Report

## Debate Participants
- **Explorer:** explorer-highvalue (proposed 7 features)
- **Challenger:** challenger-highvalue (challenged all 7, proposed alternatives)
- **Rounds:** 3 (initial proposals, challenges, concessions + synthesis)

## Executive Summary

Of 7 proposed high-value features leveraging Anthropic's agent teams API, **none survived as originally designed**. Two were refined into simpler subagent-based improvements. One meta-workflow (brainstorming) emerged as the only genuine use case for agent teams in Kata.

The central finding: **Kata's core workflows are pipelines. Agent teams excel at convergent workflows.** These are different shapes, and forcing team-based solutions onto pipeline workflows adds cost and complexity without proportional benefit.

## Design Principle

> Agent teams for convergent workflows (brainstorming, debate). Task-based subagents for pipeline workflows (plan, execute, verify). File-mediated coordination as the universal state transfer mechanism.

## Recommendations

### 1. USE AGENT TEAMS: Brainstorming / Ideation Skill

**What:** A `kata-brainstorm` skill that spawns an explorer/challenger team to debate ideas before they enter Kata's requirements pipeline.

**Why it fits teams:** The value emerges from the interaction itself. Neither agent alone produces the same quality of output. Sequential subagents cannot achieve adversarial pressure because there is no back-and-forth.

**Architecture:**
- Contained to a single skill (`kata-brainstorm`)
- Stateless: no file modifications, no git commits, no state transitions during debate
- Output: `.planning/brainstorms/{timestamp}/report.md` feeds into existing workflows via file-mediated coordination
- If the teams API breaks, brainstorming degrades but core build workflows are unaffected
- Token cost is justified because brainstorming's value IS the interaction

**Risk level:** Low. Isolated from critical path. Degrades gracefully.

**Relates to:** Issue at `.planning/issues/open/2026-02-05-integrate-brainstorming-skill-into-kata.md`

---

### 2. IMPLEMENT WITHOUT TEAMS: Post-Task Verification Checkpoints

**Original proposal:** Persistent Verifier agent running alongside executors during wave execution (Continuous Verification Monitor, proposal #4).

**Why teams don't work here:** Race conditions between Verifier messages and executor task boundaries break atomicity. No guaranteed message ordering in agent teams.

**Revised design:** After each task commit, the orchestrator (kata-execute-phase) spawns a lightweight verification subagent that checks the committed code against the task's relevant must_haves. If gaps are found, the orchestrator instructs the executor to address them in the next task.

**Implementation path:**
1. Add `must_haves_addressed` field to each task during planning (kata-planner derives from task files/done vs plan must_haves)
2. Add post-task verification step in kata-execute-phase between task completion and next-task-start
3. Create lightweight `kata-task-verifier` agent scoped to per-task must_haves checks
4. If gap found: orchestrator appends fix instruction to next task prompt; if last task: report gap for orchestrator to handle

**Cost analysis:** 2-3 lightweight subagent spawns per plan. A single prevented gap-closure cycle saves 4-6 subagent contexts. Pays for itself if it prevents one gap-closure cycle per phase.

**Risk level:** Low-medium. Uses existing subagent patterns. No experimental API dependency.

---

### 3. IMPLEMENT WITHOUT TEAMS: Debug Journal Pattern

**Original proposal:** Persistent Lead Investigator + Specialist team for debugging (proposal #3).

**Why teams don't work here:** Most debugging is simple (single cause, single fix). Team overhead penalizes the common case to optimize the rare case. The persistent Lead hits the same context limit as the current checkpoint/resume pattern.

**Revised design:** The orchestrator maintains a debug journal in `.planning/debug/{slug}.md` that accumulates findings across debugger spawns. Each fresh debugger reads the journal, runs one investigation round, appends findings and updated hypotheses. The orchestrator decides when to stop based on journal state.

**Implementation path:**
1. Define journal format: hypotheses (with confidence), evidence collected, paths eliminated, next investigation priorities
2. Modify kata-debug orchestrator to pass journal content (not just symptoms) to each debugger spawn
3. Each debugger appends structured findings to the journal before returning
4. Orchestrator checks journal state to decide: spawn another round, present findings, or escalate to user

**Future consideration:** If debug journal proves insufficient for complex multi-system bugs (measure by tracking cases that exceed 5 investigation rounds), consider persistent debug teams as an opt-in escalation. Gate this on evidence, not speculation.

**Risk level:** Low. Enhances existing file-mediated pattern. No new API dependencies.

---

### 4. DO NOT IMPLEMENT

| Proposal | Reason for Rejection | Simpler Alternative |
|---|---|---|
| #1 Adversarial Plan Review | Structured issue format already provides sufficient signal for revision. LLM debates tend toward agreement, not adversarial pressure. Edge-case optimization for the 3-iteration cap. | Keep current plan->check->revise loop. Consider debate as low-cost addition IF teams are adopted for brainstorming. |
| #2 Cross-Executor Conflict Resolution | Planner already computes file ownership. Plan-checker validates it. Distributed locking between LLM agents is fragile. Adding negotiation to the 780-line executor is high-risk. | Detect conflicts post-wave via git. Improve planner file ownership analysis if conflicts are frequent. |
| #5 Collaborative Research Synthesis | O(n^2) communication overhead with 4 researchers (12 directed channels). Coordination cost exceeds coordination value. Current parallel-then-synthesize works because researchers are domain-scoped. | Shared claims-board file for deduplication if needed. |
| #6 Self-Correcting Executor with Live Code Review | Token economics don't work (5 reviewer instances vs 6 post-hoc review agents). Per-executor reviewers miss cross-cutting concerns (consistency, integration gaps) that require full-plan visibility. | Enhance executor deviation rules with self-review checklist. Keep post-hoc PR review for cross-cutting concerns. |
| #7 Adaptive Phase Orchestrator | Directly contradicts Kata's core architecture. Quality degradation curve makes persistent orchestrator untenable for multi-hour workflows. "Plans as prompts" means plans ARE the context transfer. /clear between stages is a feature, not a bug. Stateless skills + STATE.md are fault-tolerant; persistent orchestrators are not. | No alternative needed. Current architecture is correct. |

## Key Insight: Pipelines vs. Convergent Workflows

Kata's core workflows (research -> plan -> execute -> verify) are **pipelines**: Agent A produces an artifact, Agent B consumes it. Pipelines are naturally sequential. File-mediated coordination (PLAN.md, SUMMARY.md, STATE.md, VERIFICATION.md) is the optimal transfer mechanism for pipelines because it is:
- Cheaper than persistent agents (agents terminate after producing artifacts)
- Fault-tolerant (files survive crashes; persistent agents do not)
- Inspectable (users can read and modify artifacts between stages)
- Composable (any downstream agent can consume any upstream artifact)

Agent teams excel at **convergent workflows**: multiple agents working toward a shared understanding through interaction. The value comes from the exchange, not from either agent's individual output. Brainstorming is convergent. Planning, executing, and verifying are pipelines.

Trying to add real-time messaging to pipeline workflows creates two competing coordination mechanisms (files AND messages) without proportional benefit. The proposals that failed (#2, #5, #6, #7) all made this mistake.

## Debate Process Notes

The explorer/challenger format was effective at killing weak proposals early. Of 7 initial proposals:
- 5 were rejected outright (the challenger identified simpler alternatives or architectural incompatibilities)
- 2 were refined into substantially different (and better) designs
- 1 meta-insight emerged (brainstorming as the genuine teams use case) that neither participant proposed initially

The structured adversarial pressure forced specificity on cost analysis, race condition analysis, and architectural compatibility that the explorer's initial proposals lacked.
