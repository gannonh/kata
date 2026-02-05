# Radical Ideas: Final Report

**Explorer:** explorer-radical
**Challenger:** challenger-radical
**Remit:** Paradigm shifts and new directions that agent teams could enable
**Date:** 2026-02-05
**Rounds completed:** 2 (challenger critique + explorer rebuttal, challenger session ended before final round)

---

## Overview

Explorer-radical proposed 7 paradigm-shift ideas for integrating agent teams into Kata. Challenger-radical provided detailed technical critique grounded in codebase analysis (30+ subagent spawn points, full pipeline architecture, v1.6.0 direction, 14 shipped milestones). Explorer-radical delivered a rebuttal contesting three rejected proposals and proposing a two-level implementation strategy.

---

## Consensus Verdicts (Agreed by both sides)

### Rejected (3)

| Idea | Name | Core Issue | Status |
|------|------|------------|--------|
| 1 | Swarm-Driven Development | Abandons structure-produces-quality principle. Pipeline gates exist because of information dependencies, not just technical sequencing. Context isolation loss from inter-agent messaging. | Rejected. Explorer concurs; extract "pipelined execution" as minor optimization. |
| 3 | Agent OS | Depends on session resumption API that doesn't exist. No evidence ephemeral agents caused quality issues in 14 shipped milestones. | Deferred. Explorer agrees, but flags as top priority when platform adds session resumption. |
| 5 | Model Tribunal | Contradicts Claude-native positioning. Multi-model access unavailable to most users. Cross-model output comparison is non-trivial. | Deferred. Explorer agrees on all counts. |

---

## Contested Verdicts (Disagreement)

### Idea 2: Adaptive Plans

**Challenger position:** Valuable insight, wrong mechanism. Implement as adaptive context injection between waves (orchestrator reads SUMMARYs, patches next-wave executor context). Plan stays stable. No agent teams needed.

**Explorer rebuttal:** Challenger's simple version works for linear, single-session pipelines. But when Kata evolves past single-session execution (milestones spanning days, pause/resume mid-phase), the orchestrator-mediated approach breaks because the orchestrator session may not persist. Agent teams provide a durable coordination mechanism that survives session boundaries.

**Resolved position:** Two-level approach.
- **Level 1 (now):** Adaptive context injection between waves. Orchestrator reads completed SUMMARYs and patches context for next wave. No agent teams. Estimated scope: 1 plan.
- **Level 2 (later):** Agent teams version with a dedicated plan-updater teammate that revises plans between waves and can be resumed across sessions. Build when agent teams support session resumption.

### Idea 6: Self-Improving Framework

**Challenger position:** Valuable insight. Implement as post-milestone analysis step in kata-complete-milestone that writes `.planning/LEARNINGS.md`. Single Task() call. No background agent team needed.

**Explorer rebuttal:** Agrees the simple version is sufficient for Level 1. The agent teams version (background learning agent running during quiet periods) is the strategic direction but isn't needed yet.

**Resolved position:** Two-level approach.
- **Level 1 (now):** Post-milestone analysis step. kata-complete-milestone spawns a single Task() that scans SUMMARY.md and VERIFICATION.md files, extracts structural patterns, writes `.planning/LEARNINGS.md`. Injected into planner/checker context. Estimated scope: 1 plan.
- **Level 2 (later):** Background learning agent teammate that continuously refines learnings as execution data accumulates.

### Idea 7: Human-in-the-Swarm

**Challenger position:** Rejected. Inverts user power dynamic. Human response times create blocking.

**Explorer rebuttal:** The scoped version (`type="human"` tasks) doesn't invert the power dynamic. It extends existing checkpoint gates from binary approve/reject to structured task assignments. Kata already pauses for human input at checkpoints. `type="human"` adds specificity to those pauses. Response time asymmetry is solvable by separating human tasks into non-blocking waves.

**Resolved position:** Contested. Explorer argues this is a natural extension of checkpoints. Challenger's concern about power dynamics is valid for the full proposal but overstated for the scoped version. Recommend building scoped version (human task type) as part of a broader checkpoint enhancement, monitoring user reception.
- **Level 1 (now):** Add `type="human"` task type to PLAN.md. Orchestrator pauses and presents clearly. Human tasks in separate non-blocking waves. Estimated scope: 1 phase.
- **Level 2 (later):** Full mixed orchestration with agent teams coordinating human and AI tasks through shared task list.

---

## Niche Proposal (Agreement)

### Idea 4: Red/Blue Development

Both sides agree: the explorer/challenger pattern works for ideation (proven by this brainstorm). Extending it to code during execution has value for high-stakes features but doesn't justify 2x token cost as a default mode. Kata already has kata-verifier + 6 PR review agents for post-execution quality assurance.

**Actionable version:** Optional `--adversarial` flag on `kata-verify-work` that spawns a parallel attacker agent during verification. Surgical application of Red/Blue for security-critical code. Estimated scope: 1 plan.

---

## Key Debate Points

### Where challenger was right

1. **Task() model is load-bearing.** Synchronous blocking, fresh 200k contexts, and structured returns provide context isolation, deterministic execution, and audit trails. These guarantees cannot be traded away.

2. **Most radical proposals use agent teams because the capability exists, not because it's the optimal tool.** Ideas 1, 3, and 5 are guilty of this. The simpler mechanisms serve the immediate need better.

3. **v1.6.0 direction matters.** Kata is migrating toward standard subagents. Deeper agent coupling conflicts with this trajectory.

4. **Ideation is the strongest use case for agent teams in Kata.** The explorer/challenger brainstorm pattern genuinely benefits from concurrent, adversarial peer interaction. Most execution pipeline stages do not.

### Where explorer pushed back successfully

1. **"Neither requires agent teams" is tactically correct but strategically incomplete.** The simpler versions work now. The agent teams versions scale to scenarios Kata hasn't reached yet (multi-session execution, pause/resume, persistent project context). Building the simple version with a clear upgrade path to agent teams is better than building the simple version and stopping.

2. **Human-in-the-Swarm (scoped) is viable.** The full proposal deserved rejection. The scoped version (human task type) is a natural extension of existing checkpoint patterns and doesn't invert power dynamics.

3. **The data asset argument stands unchallenged.** Kata's 106+ plans of structured execution data is genuinely underutilized. Both sides agree this is the highest-value radical direction.

---

## Actionable Outputs

### Build Now (Level 1, no agent teams required)

1. **Adaptive context injection** (Idea 2): Modify kata-execute-phase to read completed wave SUMMARYs and inject deviation context into next-wave executor prompts. Preserves all existing guarantees. Scope: 1 plan.

2. **Post-milestone learning** (Idea 6): Add execution history analysis to kata-complete-milestone. Write `.planning/LEARNINGS.md`. Inject into planner/checker context. Scope: 1 plan.

3. **Adversarial verification mode** (Idea 4): Optional `--adversarial` flag on kata-verify-work. Scope: 1 plan.

4. **Human task type** (Idea 7): Add `type="human"` to PLAN.md format. Orchestrator handles as enhanced checkpoints. Scope: 1 phase.

### Build Later (Level 2, when agent teams stabilize)

5. **Concurrent plan revision** (Idea 2 Level 2): Plan-updater agent teammate.

6. **Background learning agent** (Idea 6 Level 2): Continuous execution data mining.

7. **Mixed human/AI orchestration** (Idea 7 Level 2): Shared task list for humans and agents.

### Defer Until Platform Evolves

8. **Agent OS** (Idea 3): When agent teams support session resumption.

9. **Model Tribunal** (Idea 5): When multi-model access becomes standard.

---

## Recommended Sequencing

1. **Post-milestone learning** (Idea 6 L1) — Standalone, lowest risk, immediate value from existing data
2. **Adaptive context injection** (Idea 2 L1) — Natural extension of execution pipeline
3. **Human task type** (Idea 7 L1) — Extends checkpoint patterns
4. **Adversarial verification** (Idea 4) — Opt-in, security-focused niche

---

*Report updated: 2026-02-05 (includes explorer rebuttal)*
