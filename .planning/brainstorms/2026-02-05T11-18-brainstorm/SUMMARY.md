# Brainstorm: Agent Teams Integration for Kata

**Date:** 2026-02-05
**Topic:** Should Kata integrate Anthropic's new agent teams orchestration?
**Structure:** 3 explorer/challenger pairs (6 agents), 21 proposals evaluated
**Output:** 3 debated reports (quick wins: 3 rounds, high value: 3 rounds, radical: 2 rounds)

---

## Verdict

Agent teams have one clear use case in Kata: **divergent workflows** (brainstorming, ideation, retrospectives). Kata's core pipeline (research, plan, execute, verify) is convergent and better served by the existing Task-based subagent model.

All three pairs independently converged on the same design principle:

> **Agent teams for divergent workflows. Task-based subagents for pipeline workflows.**

---

## Surviving Proposals

### Tier 1: Implement with Agent Teams

| Proposal | Category | What | Scope |
|----------|----------|------|-------|
| kata-brainstorm skill | Quick Win | Port existing brainstorming skill into Kata with project context injection and issue creation integration | 1 phase, 2-3 plans |

**Why:** The explorer/challenger debate pattern genuinely requires peer-to-peer interaction. Sequential subagents cannot achieve adversarial pressure. The brainstorming skill already exists and works. Integration work is context injection (PROJECT.md, ROADMAP.md, STATE.md, open issues) and output routing (`.planning/brainstorms/` + `kata-add-issue`). The one-team-per-session limitation is acceptable because brainstorming has a natural session boundary.

**Existing issue:** `.planning/issues/open/2026-02-05-integrate-brainstorming-skill-into-kata.md`

### Tier 2: Implement WITHOUT Agent Teams (surfaced by debate)

| Proposal | Category | What | Scope |
|----------|----------|------|-------|
| Per-wave verification | Quick Win | After each wave, spawn lightweight verifier to check wave artifacts before next wave starts | Small-medium |
| Automated research retry | Quick Win | When planner returns INCONCLUSIVE, orchestrator auto-spawns focused researcher, feeds answer back to planner | Medium |
| Adaptive context injection | Radical | Read completed wave SUMMARYs and inject deviation info into next-wave executor context | Small (1 plan) |
| Debug journal pattern | High Value | Persistent `.planning/debug/{slug}.md` accumulates findings across debugger spawns | Small-medium |
| Post-milestone learning | Radical | Analysis step in kata-complete-milestone writes `.planning/LEARNINGS.md` from execution history | Small (1 plan) |
| Human task type | Radical | Add `type="human"` to PLAN.md, extends existing checkpoint pattern for structured human tasks | 1 phase |
| Adversarial verification | Radical | Optional `--adversarial` flag on kata-verify-work spawns parallel attacker agent | Small (1 plan) |

These emerged when proposals originally framed as agent teams integrations were pressure-tested and found to work better as Task-based subagent enhancements. The debate was productive here: it exposed genuine workflow gaps in Kata's current pipeline.

The radical pair also produced a **two-level implementation strategy**: build simple Task-based versions now (Level 1), design clear upgrade paths to agent-teams-native versions later (Level 2) when the API stabilizes. This prevents premature coupling while keeping the door open.

### Tier 3: Interesting Niche (Deferred)

| Proposal | Why Deferred |
|----------|-------------|
| Red/Blue concurrent development | Viable for security-critical code as optional mode. Kata already has verifier + 6 PR review agents. 2x token cost for 30min earlier detection may not justify. Revisit when agent teams stabilize. |
| Post-research reconciliation | Single reconciliation round between parallel researchers before synthesis. Low priority, marginal improvement over current pattern. |

---

## Rejected Proposals (13)

| Category | Proposal | Core Rejection Reason |
|----------|----------|----------------------|
| Quick Win | Team-based PR review | One-team-per-session blocks mid-execution PR reviews. Current parallel Task() already works. |
| Quick Win | Parallel wave execution with team coordination | Undermines deterministic execution model. Planner pre-computes wave safety. |
| Quick Win | Interactive debugging teams | Concurrent codebase access recreates conflicts Kata's wave model prevents. |
| Quick Win | Self-coordinating research teams | Marginal over parallel+synthesize. O(n^2) coordination overhead. |
| High Value | Adversarial plan review | LLM debates tend toward agreement. Structured checker issues already sufficient. |
| High Value | Cross-executor conflict resolution | Planner already computes file ownership. Distributed locking between LLM agents is fragile. |
| High Value | Collaborative research synthesis | O(n^2) communication with 4 researchers. Domain-scoped parallel works. |
| High Value | Self-correcting executor with live review | Token economics worse than post-hoc review. Per-executor reviewers miss cross-cutting concerns. |
| High Value | Adaptive phase orchestrator | Contradicts stateless skills + STATE.md architecture. Persistent orchestrator hits quality curve. |
| Radical | Swarm-driven development | Abandons structure (Kata's core value). 30+ spawn points require ground-up rewrite. |
| Radical | Agent OS (persistent roles) | Depends on non-existent session resumption. No evidence ephemeral agents cause quality issues. |
| Radical | Model tribunal (multi-model consensus) | Contradicts Claude-native positioning. Multi-model access unavailable to most users. |
| Radical | Human-in-the-swarm (full version) | Full version inverts power dynamic. Scoped version (`type="human"` tasks) survived as Tier 2 item above. |

---

## Cross-Cutting Themes

**1. Agent teams are experimental infrastructure, not a core dependency.**
All three pairs flagged the experimental status as a gating concern. The recommended strategy: use agent teams for isolated, optional workflows (brainstorming) that degrade gracefully if the API changes. Do not build core pipeline stages on agent teams.

**2. Kata's file-mediated coordination is a strength, not a limitation.**
PLAN.md, SUMMARY.md, STATE.md, VERIFICATION.md form a durable, inspectable, fault-tolerant coordination layer. Multiple proposals tried to replace file coordination with agent messaging and failed the cost/benefit analysis. Files are cheaper, more robust, and user-auditable.

**3. The debate process itself proved the best use case.**
This brainstorm session (6 agents debating in 3 pairs) demonstrated that adversarial peer interaction produces output that sequential subagents cannot match. The quick-wins and high-value pairs independently identified brainstorming as the only genuine agent teams use case.

**4. v1.6.0 direction matters.**
Kata is actively moving toward general-purpose subagents with inlined instructions (away from custom agent types). Proposals that deepen agent coupling conflict with this trajectory. Agent teams integration should be additive, not architectural.

---

## Recommended Sequencing

1. **kata-brainstorm skill** (agent teams) -- genuine quick win, skill already exists, issue already filed
2. **Per-wave verification** (Task-based) -- small scope, high impact on gap-closure cycles
3. **Adaptive context injection between waves** (Task-based) -- small scope, addresses cascading deviation problem
4. **Automated research retry** (Task-based) -- medium scope, addresses documented planning failure mode
5. **Post-milestone learning** (Task-based) -- small scope, unlocks value from existing execution history
6. **Debug journal pattern** (Task-based) -- small-medium scope, improves complex debugging
7. **Human task type** (Task-based) -- extends checkpoint patterns for structured human work
8. **Adversarial verification mode** (Task-based) -- opt-in for security-critical code

---

## Full Reports

- [Quick Wins Report](quickwins-report.md) -- 3 rounds of debate, 7 proposals evaluated
- [High Value Report](highvalue-report.md) -- 3 rounds, 7 proposals evaluated
- [Radical Report](radical-report.md) -- 2 rounds, 7 proposals evaluated, two-level strategy
