# Quick Wins: Agent Teams Integration Ideas

## 1. Team-Based PR Review

**What:** Replace the current 6-parallel-Task() PR review pattern in `kata-review-pull-requests` with an agent team. Each review agent (kata-code-reviewer, kata-comment-analyzer, kata-pr-test-analyzer, etc.) becomes a teammate instead of a Task() subagent. The team lead aggregates findings.

**Why:** The current pattern spawns 6 independent subagents that cannot coordinate. With agent teams, reviewers can message each other to resolve conflicts (e.g., when kata-code-simplifier and kata-type-design-analyzer disagree about type complexity). The shared task list gives the user visibility into which reviews are done. The skill already uses `context: fork` and parallel Task() calls, so the mapping to a team is natural.

**Scope:** Small. The PR review skill already orchestrates multiple agents in parallel. Replace Task() calls with Teammate spawns, add TaskCreate for each review dimension, let agents self-coordinate. The SKILL.md is 210 lines, mostly workflow description. The actual change is the spawning mechanism and result aggregation.

**Risks:**
- Higher token cost per review (teams are more expensive than subagents)
- Agent teams are experimental with known limitations (no session resumption, one team per session)
- Review agents currently have focused prompts that work well with Task(); team messaging overhead might slow them down
- The one-team-per-session limit means you cannot run a PR review team and then an execution team in the same session

---

## 2. Researcher Cross-Talk During Phase Planning

**What:** In `kata-plan-phase`, the sequential Research -> Plan -> Verify flow currently uses isolated subagents. Convert to a team where the researcher, planner, and plan-checker are teammates. The planner can ask the researcher clarifying questions mid-planning instead of working from a static RESEARCH.md file.

**Why:** The biggest failure mode in planning is when the planner encounters a question the research didn't anticipate. Currently the planner either guesses or returns PLANNING INCONCLUSIVE. With a team, the planner can DM the researcher: "What testing framework does this project use?" and get an answer without a full re-research cycle. This addresses a real quality gap.

**Scope:** Medium. The kata-plan-phase skill is 700 lines with a complex flow. The core change is replacing 3 sequential Task() calls with a team of 3, but the orchestration logic (retry loop, checker feedback) needs adaptation. The researcher would need to stay alive while the planner works.

**Risks:**
- Increased cost: researcher stays alive during planning instead of terminating after RESEARCH.md is written
- The planner-checker verification loop (max 3 iterations) becomes more complex with team coordination vs simple sequential spawns
- If researcher answers wrong, there's no RESEARCH.md artifact for the user to review and correct
- Context leakage: researcher might influence planner in unintended ways through casual messaging

---

## 3. Brainstorming as First-Class Kata Workflow

**What:** Port the `brainstorming-with-explorer-challenger-teams` skill (currently a personal skill) into Kata as `kata-brainstorm`. Auto-inject Kata project context (PROJECT.md, ROADMAP.md, open issues, STATE.md) and route output to `.planning/brainstorms/`. Offer to convert surviving proposals into Kata issues.

**Why:** This brainstorming session itself demonstrates the pattern works. The skill already uses agent teams. Integrating it into Kata connects ideation to the planning lifecycle: brainstorm -> issues -> milestone -> roadmap -> phases -> execution. The issue at `.planning/issues/open/2026-02-05-integrate-brainstorming-skill-into-kata.md` already captures this request.

**Scope:** Small. The skill already exists and works. Main work is: (1) copy SKILL.md into `skills/kata-brainstorm/`, (2) add Kata context injection (read PROJECT.md, ROADMAP.md, issues), (3) add output routing to `.planning/brainstorms/`, (4) add optional issue creation from proposals. Estimated 1 phase, 2-3 plans.

**Risks:**
- Agent teams are experimental: tying a core workflow to an experimental feature
- Token cost for 6 agents is high for what might be a low-frequency activity
- Brainstorm quality depends on project context density; new projects with thin PROJECT.md produce thin brainstorms
- One-team-per-session limit blocks running brainstorm then immediately executing its outputs

---

## 4. Parallel Wave Execution with Team Coordination

**What:** In `kata-execute-phase`, plans within a wave already run in parallel via multiple Task() calls. Replace with a team where each executor is a teammate. Executors can coordinate on shared files (e.g., "I'm modifying the router, hold off on your API endpoint changes until I commit").

**Why:** The current wave execution has a known limitation: parallel executors can create merge conflicts when modifying the same files. The PLAN.md frontmatter tries to prevent this with `files_modified` declarations, but it's imperfect. With teams, executors can DM each other to coordinate writes, reducing conflicts.

**Scope:** Medium-Large. The kata-execute-phase skill is 742 lines with complex wave orchestration, commit protocols, GitHub integration, and PR workflow. Converting the wave spawning from Task() to team requires rethinking the commit protocol (who commits what, when) and state management.

**Risks:**
- Executors currently operate in isolation (each gets fresh 200k context). Team messaging could pollute context with coordination overhead
- Commit ordering becomes nondeterministic with team coordination vs sequential Task returns
- The current per-task atomic commit protocol might break if executors negotiate about shared files
- Higher cost: executors stay alive during coordination instead of terminating after plan completion
- The orchestrator's wave-by-wave control flow is harder to maintain when executors can message each other

---

## 5. Live Verification During Execution

**What:** Add a kata-verifier teammate to the execution team that runs continuous verification checks as executors complete tasks. Instead of waiting until all plans finish to spawn a verifier, the verifier watches task completions and flags issues in real-time.

**Why:** The current flow is: execute all plans -> verify phase goal -> find gaps -> re-plan -> re-execute. The gap-closure loop adds significant time and context cost. Early detection catches stubs and wiring issues while executors still have context about what they built.

**Scope:** Medium. Requires adding a verifier teammate to the execution team and defining a protocol for incremental verification. The verifier agent already has well-defined checks (artifact existence, stub detection, wiring verification). The challenge is defining what to verify after each plan vs waiting for the full phase.

**Risks:**
- Verifier messages could distract executors mid-task
- Partial verification (after plan 1 of 3) may produce false negatives since wiring isn't complete yet
- Increases team size and token cost during execution
- Verification checks designed for post-execution may not work incrementally (e.g., checking imports between components that different executors create)

---

## 6. Self-Coordinating Research Teams for New Projects

**What:** In `kata-new-project` and `kata-add-milestone`, the 4 parallel researchers (when spawned) work independently. Convert to a team where researchers can share discoveries. If the API researcher finds the project uses GraphQL, the database researcher can adjust its investigation accordingly.

**Why:** Independent parallel research produces duplicate work and missed connections. The current `kata-research-synthesizer` agent tries to resolve this post-hoc, but a team approach lets researchers build on each other's discoveries in real-time. This directly improves the quality of PROJECT.md and REQUIREMENTS.md.

**Scope:** Small-Medium. The kata-new-project skill already spawns 4 researchers in parallel. Converting to a team adds messaging between them but preserves the parallel structure. The synthesizer role becomes the team lead's summary step.

**Risks:**
- Researchers might converge too quickly, losing the benefit of independent perspectives
- Messaging overhead could slow down what's currently a fast parallel operation
- Research quality may decrease if agents spend context on coordination instead of investigation
- The synthesizer agent's role becomes redundant or needs redefinition

---

## 7. Interactive Debugging Teams

**What:** When `kata-verify-work` finds gaps, spawn a debugging team: the verifier explains what's broken, a debugger investigates root causes, and an executor applies fixes. The three can coordinate through the shared task list and messaging.

**Why:** The current gap-closure flow is: verifier creates VERIFICATION.md -> planner reads it and creates new plans -> executor runs them -> verifier checks again. This multi-step loop loses context at each handoff. A debugging team keeps the verifier's analysis live while the debugger and executor work, enabling faster iteration.

**Scope:** Medium. Requires a new team composition (verifier + debugger + executor) and integration with the existing gap-closure flow. The agents already exist individually. The challenge is defining the coordination protocol and deciding when to escalate to full re-planning vs team-based fixes.

**Risks:**
- Three agents working on the same codebase simultaneously increases conflict risk
- The debugger agent is currently designed for diagnostic-only work; it would need execution capabilities
- Hard to define when team-based debugging should give up and escalate to re-planning
- Token cost for 3 agents is high for what might be minor gap fixes
