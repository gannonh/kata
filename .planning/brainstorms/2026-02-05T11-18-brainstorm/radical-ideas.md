# Radical Ideas: Agent Teams for Kata

**Explorer:** explorer-radical
**Remit:** Paradigm shifts and new directions that agent teams could enable
**Date:** 2026-02-05

---

## Idea 1: Abolish the Pipeline — Emergent Workflow via Agent Swarm

**Name:** Swarm-Driven Development

**What:** Replace Kata's deterministic pipeline (requirements -> research -> planning -> execution -> verification) with a self-organizing agent swarm. Instead of a fixed sequence, spawn a team of specialized agents (researcher, planner, executor, verifier) that operate on a shared task list and coordinate via peer messaging. No predetermined order. Agents claim work based on what's available and what they can do. The "workflow" emerges from agent interactions rather than being prescribed in SKILL.md files.

A user says "build authentication" and a team spawns. The researcher starts exploring the codebase and relevant APIs. Before research finishes, the planner starts drafting plans for the portions already understood. An executor begins on the first plan while the planner continues. The verifier watches for completed work and starts testing immediately. Research findings late in the process trigger plan revisions, which trigger re-execution of affected tasks.

**Why:** Kata's sequential pipeline wastes time. Execution can't start until planning finishes. Planning can't start until research finishes. Real development isn't sequential. Developers explore, code, test, and plan in overlapping bursts. A swarm model matches how good development actually works: overlapping, adaptive, and feedback-driven.

Strategically, this positions Kata as the first framework that treats AI development the way experienced developers actually think. It also makes full use of agent teams' peer-to-peer communication, which is the core new capability.

**Scope:** Large. Requires rethinking the entire orchestration model. Skills become agent spawning configurations rather than sequential workflows. Task lists replace PLAN.md as the unit of work. Planning artifacts change shape. Probably a full milestone (3-5 phases) to build even a POC.

**Risks:**
- Chaos. Without structure, agents may duplicate work, produce conflicting outputs, or spin in circles.
- Context pollution. Agents passing partial information to each other may compound errors.
- Loss of Kata's core identity. Kata's value proposition is structure and predictability. A swarm could undermine the very thing users rely on.
- Debugging becomes harder when the "execution trace" isn't a linear sequence.
- Token cost explosion from parallel agents all running simultaneously.

---

## Idea 2: Living Plans — Plans that Rewrite Themselves During Execution

**Name:** Adaptive Plans

**What:** Instead of static PLAN.md files that executors follow literally, make plans living documents that adapt during execution. An executor agent discovers that a dependency doesn't work as expected. Rather than following deviation rules and documenting it in SUMMARY.md, it messages a planner agent. The planner revises the current plan and downstream plans in real time. Verification agents can trigger replanning for plans that haven't started yet. The plan evolves as understanding deepens.

The key shift: plans stop being "prompts to execute" and become "working agreements between agents that update as the project evolves."

**Why:** Static plans are the biggest source of wasted effort in Kata today. When an executor encounters something unexpected, the deviation rules handle it locally, but downstream plans don't adapt. This leads to cascading mismatches: Plan 3 was written assuming Plan 2 would produce X, but Plan 2 deviated and produced Y. Plan 3 now has to handle the deviation too.

Agent teams enable this because agents can communicate. An executor discovering new information can tell the planner "Plan 3 needs to change because I found X." No human in the loop required.

**Scope:** Medium-large. Core execution pipeline changes, but the artifact structure (PLAN.md, SUMMARY.md) can evolve rather than be replaced. Could start with a POC where executors message a "plan updater" agent that modifies future plans before they execute.

**Risks:**
- Plans lose their value as stable, reviewable artifacts. If a plan changes during execution, the user can't trust what they reviewed pre-execution.
- Infinite revision loops. Agent A changes the plan, Agent B starts, discovers something, changes it again.
- Context synchronization becomes hard. Which version of the plan is each agent working from?
- Violates "plans are prompts" principle. If the prompt changes while being executed, what does that mean?

---

## Idea 3: Kata as Operating System — Project Workspace with Persistent Agent Roles

**Name:** Agent OS

**What:** Reconceive Kata not as a framework for running workflows, but as an operating system for AI-assisted development. Agents become persistent roles (not ephemeral subagents). A project has a "resident researcher" that continuously indexes the codebase and domain knowledge. A "resident planner" that maintains the roadmap and suggests optimizations. A "resident reviewer" that watches every commit and flags issues. A "resident architect" that tracks cross-cutting concerns and technical debt.

Users interact with named agents that have memory, context, and ongoing state. "Hey architect, how does the auth change affect the API layer?" The architect agent resumes its persistent context and answers based on accumulated understanding.

This requires session resumption (not yet supported by agent teams), but the conceptual model can be built now with workarounds (persistent memory files, state serialization).

**Why:** Ephemeral agents are Kata's weakest point. Every subagent starts with zero context and must rebuild understanding from scratch. This burns tokens and time. For a project that runs over weeks or months, the same codebase is re-analyzed hundreds of times. Persistent agents amortize the context-building cost.

Strategically, this is where the market is heading. GitHub Copilot Workspace, Devin, and similar tools are all building toward "AI teammates" that understand a project over time. Kata can lead this category by building on Claude's strong session and context management.

**Scope:** Very large. This is a fundamental architectural shift. Requires agent state persistence, memory management, context serialization, and a new interaction model. Likely multiple milestones spanning months.

**Risks:**
- Agent teams don't support session resumption yet. Building this on unstable foundations is risky.
- Memory management complexity. What does an agent remember? How does it forget outdated information?
- Token cost for persistent agents is much higher than ephemeral ones.
- Stale context. A "resident architect" that hasn't been refreshed in a week may have outdated understanding.
- Fundamental mismatch with current Claude Code architecture (stateless subagents).

---

## Idea 4: Adversarial Development — Red Team / Blue Team for Every Feature

**Name:** Red/Blue Development

**What:** Every feature gets built twice, by two teams working in parallel. A Blue Team builds the feature. A Red Team simultaneously tries to break it. Not after-the-fact testing: concurrent attack and defense.

The Blue Team follows the normal Kata pipeline: plan, execute, verify. The Red Team reads the same plans and immediately starts generating adversarial test cases, finding edge cases, crafting malicious inputs, identifying race conditions, looking for security holes. As the Blue Team commits code, the Red Team runs attacks against it.

When the Red Team finds issues, they message the Blue Team directly. The Blue Team must fix the issue before proceeding. The final artifact includes both the feature code and the Red Team's attack surface analysis.

**Why:** Verification in Kata today is retrospective: build, then check. The explorer/challenger pattern in brainstorming proves that adversarial pairing produces stronger outputs. Apply the same principle to code.

This addresses a real market pain point: AI-generated code is notorious for missing edge cases, security issues, and error handling. Red/Blue development makes robustness a built-in property rather than an afterthought.

Agent teams make this possible because the two teams can coordinate through shared task lists and direct messaging.

**Scope:** Large. Requires a new orchestration mode alongside the existing pipeline. Needs Red Team agent definitions, adversarial test generation logic, and a protocol for Red/Blue communication during execution.

**Risks:**
- Token cost doubles (or more) for every feature.
- Red Team might find too many issues, creating analysis paralysis.
- Adversarial testing requires security domain expertise that generic agents may lack.
- Blue Team morale (metaphorically). If agents can get frustrated, this would do it.
- Difficult to scope. Where does Red Team testing stop?

---

## Idea 5: Multi-Model Consensus — Cross-Validate with Different AI Models

**Name:** Model Tribunal

**What:** Critical decisions (architecture choices, plan verification, security review) get evaluated by a panel of different AI models. Kata already supports model profiles (quality/balanced/budget). Extend this to spawn the same task to multiple models and require consensus or majority agreement.

A plan checker runs on Claude Opus AND Claude Sonnet AND (hypothetically) GPT-4o. Each independently reviews the plans. If they agree, proceed. If they disagree, flag the specific point of disagreement for human review.

More subtle version: different models handle different phases based on their strengths. Use the fastest model for research (broad pattern matching), the strongest for planning (complex reasoning), and a consensus panel for verification.

**Why:** Single-model blindspots are a known problem. Claude has specific failure modes. Another model has different failure modes. If both independently approve something, confidence is higher. This is the AI equivalent of code review by a different developer.

Agent teams enable this because each team member can independently run the same task with different configurations. The team lead synthesizes disagreements.

**Scope:** Medium. The orchestration layer already handles model selection. Extending it to multi-model consensus requires: spawning parallel tasks with different model parameters, comparing outputs, and handling disagreement resolution.

**Risks:**
- Only works if you have access to multiple models. Currently Kata is Claude-only.
- MCP and tool availability differs across models.
- Comparing outputs from different models is non-trivial (different formats, different levels of detail).
- Token cost multiplied by number of models in the panel.
- Introduces latency waiting for the slowest model.
- Potentially undermines Kata's Claude-native advantage.

---

## Idea 6: Kata Learns From Itself — Retrospective Agent that Mines Execution History

**Name:** Self-Improving Framework

**What:** Create an agent that continuously analyzes Kata's own execution history (SUMMARY.md files, VERIFICATION.md results, deviation logs, git history) to discover patterns and improve future planning. When a planner creates plans for Phase 5, this agent provides: "In the last 3 milestones, phases involving database migrations averaged 40% more tasks than planned. Plans with >3 tasks consistently degraded in quality. The executor deviated from plans involving API design 60% of the time."

The learning agent writes its findings to a persistent `LEARNINGS.md` file that gets injected into planner and checker context. Over time, Kata gets better at planning because it learns from its own track record.

**Why:** Kata already has a gold mine of structured execution data: 106+ completed plans with SUMMARYs, verification results, deviation logs, commit histories. This data is currently unused except for velocity metrics in STATE.md. Mining it for planning intelligence turns past experience into future accuracy.

Agent teams make this more powerful because a dedicated learning agent can run in the background during quiet periods, continuously updating its understanding.

**Scope:** Medium. The data already exists in structured formats. Needs: a pattern extraction agent, a LEARNINGS.md format, integration points into the planner and checker prompts, and a mechanism for the learning agent to run (on-demand or triggered after milestones).

**Risks:**
- Overfitting to past patterns. "Database migrations are always hard" might not apply to the next project.
- Noise in historical data. Some deviations were bugs in the plan, others were discoveries. Distinguishing the two is hard.
- Context cost of injecting learnings. If LEARNINGS.md grows large, it competes with actual plan content for context space.
- Correlation vs. causation. "Plans with 4+ tasks fail" might just mean those were harder features, not that the plan structure was wrong.

---

## Idea 7: User as Agent — The Human Joins the Team

**Name:** Human-in-the-Swarm

**What:** Instead of the user being an external controller who invokes skills and approves checkpoints, make the user a first-class team member. The user gets assigned tasks alongside agents. The user contributes through the same messaging protocol. Agent teammates can ask the user questions, request decisions, or delegate specific subtasks.

The team lead (an agent) coordinates all participants. It might assign "Write the API endpoint" to an executor agent, "Design the database schema" to the user (because it involves domain knowledge), and "Write tests" to another executor. The user works on their task and reports completion through the same task system.

During planning, the planner agent might message the user: "I need a decision on auth strategy before I can plan Phase 3. Options: JWT vs session-based. Please update the task with your choice." The user responds through the task list, and agents pick up from there.

**Why:** Kata currently treats the user as an overseer, not a participant. This limits what Kata can do: it can only handle tasks that Claude can handle alone. Many real development tasks require human judgment, domain expertise, or manual testing. By making the user a team member, Kata can orchestrate mixed human/AI work.

This also changes the power dynamic. Instead of "tell Claude what to do," it becomes "work together on a shared task list." This is closer to how people imagine working with AI.

**Scope:** Medium-large. Agent teams already support direct user interaction with individual agents. The main work is building the orchestration patterns: task assignment to humans, status tracking for human tasks, and coordination protocols that account for human response times (much slower than agents).

**Risks:**
- Users may not want to be "assigned tasks" by an AI. This flips the expected power dynamic.
- Human response times create bottlenecks. Agents finish in seconds; humans take hours or days.
- Task granularity mismatch. What's a single agent task might be a day of human work.
- The user's mental model might not match the team's task model.
- Scope creep: if the user is a team member, does Kata need to track their work history too?
