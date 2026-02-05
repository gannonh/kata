# Domain Pitfalls: Agent Skills Migration

**Domain:** Converting custom subagents to Agent Skills resources
**Researched:** 2026-02-04
**Confidence:** HIGH (based on Kata codebase analysis + industry patterns)

## Executive Summary

This research identifies critical pitfalls when converting Kata's 15+ custom subagents to Agent Skills resources. The migration involves:
- Converting `agents/kata-*.md` files to skill resources
- Preserving tool allowlists and context passing
- Maintaining orchestrator-agent communication patterns
- Testing behavior equivalence

The most dangerous pattern: **context passing assumptions mismatch**. Kata orchestrators inline context via Task prompts. Agent Skills receive context differently. Silent failures occur when agents execute without required context.

---

## Critical Pitfalls

Mistakes that cause rewrites or significant rework.

### Pitfall 1: Context Passing Assumption Mismatch

**What goes wrong:** Custom agents receive context via Task tool prompt parameter with inlined content. Agent Skills receive context differently (SKILL.md content + `$ARGUMENTS`). Migration assumes context flows the same way.

**Why it happens:** Kata's current architecture uses orchestrators to read files with the Read tool, then inline content into Task prompts:

```javascript
// Current pattern in kata-plan-phase and kata-execute-phase
Task(
  prompt="Execute plan at {plan_path}\n\n<plan>\n{plan_content}\n</plan>...",
  subagent_type="kata-executor",
  model="{executor_model}"
)
```

Agent Skills receive their SKILL.md body as the prompt, with `$ARGUMENTS` as the variable input. The `@` syntax for file references does not work across Task boundaries.

**Consequences:**
- Agents receive incomplete context and produce incorrect output
- Plans execute without access to STATE.md, ROADMAP.md, or prior SUMMARYs
- Verification fails because verifier lacks must_haves from PLAN.md frontmatter

**Prevention:**
1. Audit every Task invocation to identify what context is inlined
2. Design explicit context injection mechanism for Skills:
   - Use `!`command`` syntax for dynamic context injection (pre-executes shell commands)
   - Pre-read required files in orchestrator and pass via structured `$ARGUMENTS`
   - Consider the `context: fork` pattern for Skills that need isolation
3. Create context contract documentation for each converted agent

**Detection (warning signs):**
- Agent asks for information that should already be available
- Verification or execution produces "file not found" or "variable undefined" errors
- Output references placeholder values instead of real data

**Which phase should address:** Phase 1 (POC) with kata-planner and kata-executor

---

### Pitfall 2: Tool Allowlist Semantic Drift

**What goes wrong:** Custom agents have explicit `tools:` frontmatter. Agent Skills have `allowed-tools:` with different semantics. During migration, the tool lists get copied but the permission model changes.

**Why it happens:** Current Kata agents specify tools as a simple list:

```yaml
# Current agent (kata-executor.md)
tools: Read, Write, Edit, Bash, Grep, Glob
```

Agent Skills `allowed-tools` field controls permission prompting (tools that run without asking), not tool availability. The Skills documentation states: "If you omit `tools`, you're implicitly granting access to all available tools."

**Consequences:**
- Agents gain unintended capabilities (MCP tools, dangerous operations)
- Security model degrades silently
- Agents perform operations they shouldn't (executing arbitrary code, modifying files outside scope)

**Prevention:**
1. Map current tool lists to explicit `allowed-tools` AND explicit `disallowedTools` in Skills
2. Test each converted agent with all tools disabled, then enable one at a time
3. Consider using `context: fork` with restricted agents for isolation
4. Add hooks (`PreToolUse`) for conditional validation when simple lists are insufficient

**Detection (warning signs):**
- Agent completes tasks suspiciously fast (skipping verification)
- Agent modifies files outside its expected scope
- Agent uses tools not in original allowlist

**Which phase should address:** Phase 1 (POC) and Phase 2 (conversion of each agent)

---

### Pitfall 3: Model Selection Regression

**What goes wrong:** Kata orchestrators select models based on config profiles (quality/balanced/budget). Agent Skills have a `model` field but it's static per skill. Migration loses dynamic model selection.

**Why it happens:** Current orchestrators implement model lookup:

```bash
MODEL_PROFILE=$(cat .planning/config.json | grep '"model_profile"' | ... || echo "balanced")
# Then lookup table:
# | Agent          | quality | balanced | budget |
# | kata-planner   | opus    | opus     | sonnet |
```

Agent Skills `model` field is a single value, not configurable per invocation.

**Consequences:**
- Users lose cost control (budget profile users get expensive models)
- Performance degrades (quality profile users get cheaper models)
- Orchestrator complexity increases to compensate

**Prevention:**
1. Keep model selection in orchestrator, NOT in Skill definition
2. Use `model: inherit` in Skills so orchestrator controls selection
3. If Skills must specify models, create profile-specific Skill variants or use hooks

**Detection (warning signs):**
- Unexpected API costs after migration
- Model-specific behaviors (hallucination rates, context limits) differ from pre-migration
- config.json model_profile setting has no effect

**Which phase should address:** Phase 1 (POC) design decision

---

### Pitfall 4: Structured Return Contract Breakage

**What goes wrong:** Kata agents return structured outputs (`## PLANNING COMPLETE`, `## CHECKPOINT REACHED`, `## DEBUG COMPLETE`). Orchestrators parse these to determine next action. Skills may not maintain the same return contract.

**Why it happens:** Current agents have explicit `<structured_returns>` sections defining output formats:

```markdown
## PLANNING COMPLETE
**Phase:** {phase-name}
**Plans:** {N} plan(s) in {M} wave(s)
...
```

Orchestrators pattern-match on these:

```bash
# Implied in orchestrator logic
if output contains "## PLANNING COMPLETE"
  → proceed to verification
elif output contains "## CHECKPOINT REACHED"
  → present to user
```

Agent Skills don't enforce return formats. The Skill body IS the prompt, but output structure is not guaranteed.

**Consequences:**
- Orchestrators fail to parse agent output
- Workflows hang waiting for patterns that never appear
- Silent failures where orchestrator assumes success

**Prevention:**
1. Maintain explicit output format requirements in Skill body
2. Add output validation in orchestrators after Skill completion
3. Consider hooks (`Stop`) to validate output format before returning to orchestrator
4. Test return format parsing with diverse outputs

**Detection (warning signs):**
- Orchestrator displays raw agent output instead of formatted results
- "Next Up" sections never appear
- State files not updated after agent completion

**Which phase should address:** Phase 1 (POC) with kata-planner and kata-executor

---

### Pitfall 5: Subagent-Cannot-Spawn-Subagent Hierarchy Violation

**What goes wrong:** Kata's architecture relies on Skills spawning subagents via Task tool. The Agent Skills documentation states "Subagents cannot spawn other subagents." If Skills become subagents, the orchestration hierarchy breaks.

**Why it happens:** Current Kata Skills ARE orchestrators. They spawn agents:

```
Skill (kata-plan-phase)
  → spawns Agent (kata-phase-researcher)
  → spawns Agent (kata-planner)
  → spawns Agent (kata-plan-checker)
```

If Skills execute as subagents (via `context: fork`), they lose the ability to spawn further subagents.

**Consequences:**
- Multi-agent workflows become impossible
- kata-plan-phase can't spawn kata-planner
- kata-execute-phase can't spawn kata-executor
- Architecture requires complete redesign

**Prevention:**
1. Skills that orchestrate MUST NOT use `context: fork`
2. Only leaf-node agents (those that do work, not spawn others) should become skill resources
3. Keep orchestrator logic in Skills without `context: fork`
4. Converted agents become skill resources spawned by Task, not Skills with `context: fork`

**Detection (warning signs):**
- "Subagents cannot spawn other subagents" error
- Skill completes but expected subagents never ran
- Workflow produces incomplete results

**Which phase should address:** Phase 1 (POC) architecture validation

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

### Pitfall 6: Discovery Pattern Incompatibility

**What goes wrong:** Claude Code discovers Skills from `.claude/skills/` directories. Kata agents live in `agents/` directory. Migration must maintain discoverability.

**Why it happens:** Claude Code has specific conventions for skill discovery:
- `.claude/skills/<skill-name>/SKILL.md` (project)
- `~/.claude/skills/<skill-name>/SKILL.md` (user)
- Plugin skills in plugin's `skills/` directory

Kata's agents are in `agents/kata-*.md`, a flat structure.

**Prevention:**
- Skills as subagent resources must be installed to `.claude/skills/` or bundled in plugin
- Update build system to place converted agents in correct location
- Test that converted agents are discoverable by Claude Code

**Which phase should address:** Phase 2 (full conversion)

---

### Pitfall 7: Description Mismatch for Invocation

**What goes wrong:** Kata agents have descriptions for documentation. Agent Skills descriptions drive invocation (Claude decides when to use them). A documentation-style description becomes a poor invocation trigger.

**Why it happens:** Current agent descriptions are informational:

```yaml
# Current (documentation-style)
description: Executes Kata plans with atomic commits, deviation handling...
```

Agent Skills descriptions must trigger invocation:

```yaml
# Required (invocation-style)
description: Execute plans. Use when running phase execution, completing plans, or implementing planned tasks.
```

**Prevention:**
- Rewrite descriptions with invocation triggers in mind
- Include action phrases: "use when", "for", "handles"
- Test natural language invocation after conversion
- Follow Kata's existing skill naming guidance (gerund style)

**Which phase should address:** Phase 2 (each agent conversion)

---

### Pitfall 8: Hook Migration Gap

**What goes wrong:** Kata orchestrators have implicit hook-like behavior (post-execution commits, state updates). Agent Skills have explicit hooks (`PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop`). Implicit behaviors don't automatically migrate.

**Why it happens:** Current orchestrators embed post-execution logic:

```bash
# In orchestrator after Task returns
git add .planning/STATE.md
git commit -m "docs({phase}): complete phase"
```

Agent Skills would need hooks to replicate this behavior consistently.

**Prevention:**
- Audit each orchestrator for post-execution behaviors
- Implement explicit hooks for behaviors that must survive migration
- Test that commits, state updates, and artifacts are created correctly

**Which phase should address:** Phase 2 (each agent conversion)

---

### Pitfall 9: @-Reference Syntax Preservation

**What goes wrong:** Kata agents use `@~/.claude/kata/...` paths that the build system transforms. Agent Skills may have different path resolution rules.

**Why it happens:** Kata's build system transforms paths:

| Build Target | Transformation |
| --- | --- |
| Plugin | `@~/.claude/kata/` → `@./kata/` |

Agent Skills may resolve `@` references differently.

**Prevention:**
- Test @-reference resolution after conversion
- Update build system if Skills have different path semantics
- Document path transformation rules

**Which phase should address:** Phase 2 (build system updates)

---

### Pitfall 10: Checkpoint Protocol Translation

**What goes wrong:** Kata agents have explicit checkpoint types (`checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`). Agent Skills don't have native checkpoint support.

**Why it happens:** Current checkpoint flow:

```
Agent hits checkpoint → returns structured CHECKPOINT REACHED
Orchestrator parses → presents to user → gets response
Orchestrator spawns fresh continuation agent with response
```

Agent Skills have no built-in checkpoint concept.

**Prevention:**
- Design checkpoint-to-Skill pattern (return structured output, orchestrator presents, spawn continuation)
- Test full checkpoint flow with converted agents
- Preserve checkpoint semantics even if implementation differs

**Which phase should address:** Phase 1 (POC) with kata-executor

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 11: Color/Branding Loss

**What goes wrong:** Kata agents have `color:` frontmatter for visual identification. Agent Skills don't have equivalent.

**Why it happens:** Current agents have visual differentiation:

```yaml
color: green  # kata-planner
color: yellow # kata-executor
color: orange # kata-debugger
```

Agent Skills spec doesn't include color field.

**Prevention:** Document which visual cues are lost and whether they matter. Consider Claude Code subagent color configuration as alternative.

---

### Pitfall 12: Version Compatibility

**What goes wrong:** Agent Skills standard may evolve. Kata's conversion may depend on features added later.

**Prevention:**
- Pin to specific Agent Skills version/spec
- Document which features are used
- Monitor agentskills.io for spec changes

---

### Pitfall 13: Testing Coverage Gap

**What goes wrong:** Kata has no systematic agent testing. Migration adds complexity without test coverage.

**Prevention:**
- Establish test patterns before migration
- Test agent invocation, output parsing, and state effects
- Add regression tests for critical workflows

**Which phase should address:** Phase 1 (POC) should include test strategy

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
| --- | --- | --- |
| POC with kata-planner | Context passing (1), Structured returns (4) | Design explicit context contracts, validate output parsing |
| POC with kata-executor | Checkpoint handling (10), Tool permissions (2) | Test full execution cycle including checkpoints |
| Architecture validation | Subagent hierarchy (5) | Confirm orchestrators can spawn subagents |
| Full conversion | Description quality (7), Hook migration (8) | Rewrite descriptions for invocation, audit implicit behaviors |
| Build system | Path resolution (9), Discovery (6) | Test end-to-end from source to installed plugin |

---

## Kata-Specific Risk Factors

Based on Kata's architecture:

### High Risk: Context Inlining Pattern
- **Impact:** All 15+ agents receive context via Task prompt inlining
- **Root cause:** `@` references don't work across Task boundaries
- **Mitigation:** Design explicit context passing for converted agents

### High Risk: Orchestrator Hierarchy
- **Impact:** 8 Skills spawn subagents; if Skills become subagents, hierarchy breaks
- **Root cause:** "Subagents cannot spawn other subagents" constraint
- **Mitigation:** Keep orchestrator Skills inline, only convert leaf agents

### Medium Risk: Structured Return Contracts
- **Impact:** Orchestrators parse 10+ different return patterns
- **Root cause:** Agent Skills don't guarantee output format
- **Mitigation:** Add output validation, test parsing thoroughly

### Medium Risk: Model Profile System
- **Impact:** 3 model profiles (quality/balanced/budget) with per-agent models
- **Root cause:** Agent Skills have static model field
- **Mitigation:** Keep model selection in orchestrator, use `model: inherit`

### Low Risk: Visual Identity
- **Impact:** 6 color values for agent differentiation
- **Root cause:** Agent Skills don't support color field
- **Mitigation:** Accept loss or find alternative visual cue

---

## Integration with Existing System

### Preserving Skill-Agent Communication
- **Risk:** Orchestrator Skills (kata-plan-phase, kata-execute-phase) spawn agents
- **What could break:** If agents become skills invoked differently, communication patterns change
- **Prevention:** Test full workflows end-to-end after conversion

### State Management Continuity
- **Risk:** Agents write to `.planning/` files (STATE.md, SUMMARY.md, etc.)
- **What could break:** Skill execution context differs, file writes fail
- **Prevention:** Test file I/O patterns in converted agents

### Commit Protocol Preservation
- **Risk:** Agents commit per-task with specific formats
- **What could break:** Git operations in skill context behave differently
- **Prevention:** Test commit flow including staging, message format, and Co-Authored-By

---

## Research Confidence

| Area | Confidence | Notes |
| --- | --- | --- |
| Context passing pitfalls | HIGH | Based on Kata codebase analysis and Agent Skills docs |
| Tool permission pitfalls | HIGH | Direct from Agent Skills specification and Claude Code docs |
| Model selection pitfalls | HIGH | Based on current Kata config system analysis |
| Subagent hierarchy | HIGH | Claude Code docs explicitly state limitation |
| Checkpoint handling | MEDIUM | Agent Skills checkpoint pattern not fully documented |
| Build system integration | MEDIUM | Depends on Kata's specific build system choices |

---

## Sources

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)
- [Agent Skills Standard](https://agentskills.io)
- [Agent Skills Specification](https://agentskills.io/specification)
- [Claude Code Subagent Best Practices](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [Claude Code Subagent Common Mistakes](https://claudekit.cc/blog/vc-04-subagents-from-basic-to-deep-dive-i-misunderstood)
- [Agent Skills: Universal Standard](https://medium.com/@richardhightower/agent-skills-the-universal-standard-transforming-how-ai-agents-work-fc7397406e2e)
- Kata codebase analysis: `agents/kata-*.md`, `skills/kata-*/SKILL.md`
