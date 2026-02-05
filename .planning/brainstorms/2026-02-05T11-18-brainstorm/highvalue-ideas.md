# High-Value Feature Proposals: Agent Teams for Kata

## 1. Adversarial Plan Review (Planner vs. Critic Debate)

**What:** Replace the sequential planner -> checker -> revision loop with a live debate between a Planner agent and a Critic agent. Both are persistent teammates. The Critic reads the plan as the Planner writes it, sends objections in real-time, and the Planner responds. The orchestrator watches the exchange and calls the debate when convergence is reached or a round limit hits.

**Why:** The current flow is 3 sequential Task calls: plan, check, revise. Each agent starts cold with no memory of the previous round. The checker cannot ask the planner "what did you mean by X?" -- it files a structured issue and hopes the planner interprets it correctly on the next pass. With agent teams, the Critic can challenge a specific claim ("this task says 2 files but the schema change will cascade to 5"), the Planner can defend or concede, and both refine understanding through dialogue. This is structurally impossible with fire-and-forget subagents because they cannot exchange messages.

**Scope:** Medium. Requires a new `kata-plan-debate` skill, new Critic agent definition, modifications to `kata-plan-phase` to spawn a team instead of sequential Tasks. The existing plan-checker logic becomes the Critic's seed prompt.

**Risks:**
- Token cost doubles (two persistent agents instead of two sequential subagents)
- Debates can loop without converging; needs a hard round cap
- Quality depends on the Critic being genuinely adversarial, not deferential
- Agent teams are experimental; shutdown/cleanup can be unreliable

---

## 2. Cross-Executor Conflict Resolution During Wave Execution

**What:** When multiple executors run in parallel within a wave, give them a shared task list and direct messaging so they can detect and resolve file conflicts in real-time. If Executor A discovers it needs to modify a file owned by Executor B's plan, it messages B directly to coordinate, rather than failing or silently creating a merge conflict.

**Why:** The current architecture assigns file ownership in plan frontmatter (`files_modified`) and trusts that the planner got it right. In practice, deviation rules (auto-fix bugs, auto-add critical) cause executors to touch files outside their declared scope. With subagents, this results in merge conflicts or silent overwrites discovered only after both complete. The orchestrator cannot mediate because Task calls block until completion -- it never sees intermediate state. With agent teams, executors can negotiate file access mid-execution: "I need to add an import to utils.ts" / "OK, I'm done with that file, go ahead."

**Why it matters strategically:** Wave parallelism is one of Kata's core performance features. File conflicts are the primary failure mode. Solving this removes the main reason users fall back to sequential execution.

**Scope:** Large. Requires modifying kata-executor agent to include team awareness, adding a conflict detection protocol, and changing kata-execute-phase to spawn a team instead of parallel Tasks. Needs careful design of the negotiation protocol.

**Risks:**
- Agents may deadlock waiting for each other
- Negotiation messages consume tokens and slow execution
- Adds complexity to the executor, which is already the most complex agent
- Hard to test: conflicts are stochastic and depend on deviation behavior

---

## 3. Persistent Debug Sessions with Hypothesis Handoff

**What:** Replace the checkpoint-resume pattern in kata-debug with a persistent debugging team: a Lead Investigator and one or more Specialist agents (e.g., one focused on type errors, one on runtime behavior). The Lead forms hypotheses and delegates specific investigations to Specialists. Specialists report findings back. The Lead maintains a running theory across the full session without losing state at each checkpoint.

**Why:** The current debug flow uses checkpoint/resume with fresh continuation agents. Each continuation agent must re-read the debug file and reconstruct the investigation state. Subtle context is lost: the investigator's intuition about which paths are promising, the relative weight of evidence, the "feel" for what's wrong. A persistent Lead agent accumulates this context naturally through conversation. Specialist agents provide fresh context windows for expensive operations (reading large files, running tests) without polluting the Lead's context.

**Scope:** Medium. New `kata-debug-team` skill, modified debugger agent definitions. The existing debug file format (`.planning/debug/*.md`) remains the persistence layer.

**Risks:**
- Debugging is inherently unpredictable; team coordination overhead may slow simple bugs
- The Lead agent's context fills up on long investigations (same problem as today, different shape)
- Agent teams can't resume across sessions, so session interruption still loses state
- Specialists need clear enough instructions to be useful; vague delegation wastes tokens

---

## 4. Continuous Verification Monitor During Execution

**What:** During phase execution, spawn a persistent Verifier agent alongside the executors. The Verifier watches the shared task list. As executors complete tasks and mark them done, the Verifier immediately checks the committed code against the plan's must_haves. If it detects a gap (stub, missing wiring, broken link), it messages the relevant executor before the executor moves to the next task or the orchestrator moves to the next wave.

**Why:** Verification currently happens AFTER all plans in a phase complete. By that point, context about implementation decisions is gone (executor subagents terminated), and gaps require spawning a brand new planner to create gap-closure plans, then new executors to implement them. This is a full extra cycle. With a persistent Verifier watching in real-time, gaps are caught while the executor still has context and can fix them immediately. The feedback loop shrinks from "entire phase completion + gap plan + gap execution" to "next task in the same session."

**Why it matters strategically:** The plan-execute-verify-gap-replan-reexecute loop is Kata's most expensive failure mode. Each cycle burns 3-5 fresh subagent contexts. Catching gaps early could eliminate gap closure plans entirely for most phases.

**Scope:** Large. Requires the Verifier to run as a persistent teammate, the executor to report progress via task list, and the orchestrator to mediate if the Verifier and executor disagree. The existing verification logic (3-level checks: exists, substantive, wired) can be reused.

**Risks:**
- Verifier may slow down execution by flagging false positives
- Communication overhead: messages between Verifier and Executor add latency
- Race conditions: Verifier might check before executor has committed
- Agent teams have no guaranteed ordering on message delivery

---

## 5. Collaborative Research Synthesis

**What:** Replace the sequential researcher -> synthesizer flow in kata-new-project / kata-add-milestone with a research team: 4 parallel researchers that can message each other. When Researcher A finds something relevant to Researcher B's domain, it sends a heads-up. A Synthesizer agent monitors the shared task list, reads research outputs as they appear, and produces a synthesis that accounts for cross-domain interactions the individual researchers couldn't see.

**Why:** The current kata-new-project flow spawns 4 researchers in parallel via Task, waits for all to complete, then spawns a synthesizer. The researchers cannot communicate, so they frequently duplicate work (two researchers both investigate the same library) or miss connections (Researcher A finds a constraint that invalidates Researcher B's recommendation). The synthesizer starts cold and must reconstruct these relationships from 4 independent reports. With team messaging, researchers can coordinate in real-time: "I'm covering auth, found that this OAuth library conflicts with the framework you're recommending."

**Scope:** Medium. Modify kata-new-project and kata-add-milestone to spawn research team. Existing researcher agent prompts adapt to include team communication protocol.

**Risks:**
- 4 researchers messaging each other creates O(n^2) communication; noise may overwhelm signal
- Synthesizer agent may receive findings before they're fully formed
- Token cost increases (persistent agents vs fire-and-forget subagents)
- Marginal value: current synthesis is adequate for most projects

---

## 6. Self-Correcting Executor with Live Code Review

**What:** For each executor in a wave, spawn a paired Code Reviewer agent. The Reviewer reads each file the Executor writes/edits and provides immediate feedback via direct message. The Executor can incorporate feedback before committing, producing higher-quality first-pass code. This replaces the post-hoc PR review with in-line quality assurance.

**Why:** The current flow is: execute all plans -> optionally run PR review (6 parallel agents) -> fix findings -> push. PR review happens after all code is written and committed. Findings require understanding the executor's intent, which is lost after the subagent terminates. With a live Reviewer, feedback arrives while the Executor still holds full context: "this catch block silently swallows the error" prompts an immediate fix rather than a post-hoc finding that requires re-reading the whole function.

**Scope:** Medium-Large. Requires pairing executors with reviewers, defining communication protocol (what triggers a review, how feedback is delivered, when the executor should act on it vs. defer).

**Risks:**
- Reviewer may bottleneck executor (sync review is slower than async execution)
- Token cost: every file write triggers reviewer analysis
- Reviewer and executor may disagree, creating stalemates
- Diminishing returns on simple/boilerplate code

---

## 7. Adaptive Phase Orchestrator

**What:** Replace the static skill-as-orchestrator pattern with a persistent Orchestrator agent that manages the entire phase lifecycle (research -> plan -> execute -> verify) as a single team session. The Orchestrator maintains context across all stages, remembers decisions from research that inform planning, and carries planning context into execution monitoring. Sub-workflows (plan debate, wave execution, verification) are delegated to specialist teammates.

**Why:** The current architecture forces context resets at each workflow boundary. When kata-plan-phase hands off to kata-execute-phase (via user invoking `/clear` + new command), all planning context is lost. The executor operates from PLAN.md alone. Decisions about "why this approach" or "what the user emphasized" must be explicitly captured in artifacts or they vanish. An Adaptive Orchestrator that persists across research, planning, and execution retains this implicit context. It can notice when execution diverges from planning intent and intervene.

**Why it matters strategically:** Kata's /clear-between-stages design is a deliberate tradeoff for context freshness. But it discards valuable implicit context that no artifact fully captures. A persistent orchestrator preserves this without sacrificing subagent context freshness (specialists still get fresh windows).

**Scope:** Very Large. This is an architectural change to how Kata workflows compose. The orchestrator becomes a persistent agent rather than a stateless skill. All existing skills would need adaptation.

**Risks:**
- The orchestrator's context window fills up during long phases, degrading quality
- Contradicts Kata's core design principle of "fresh context per stage"
- Session interruption kills the orchestrator, losing all accumulated context
- Agent teams are experimental; running a team for hours may hit stability issues
- Migration path from current architecture is unclear
