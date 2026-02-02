# PRD: Skills-Only Architecture Migration

## Introduction

Migrate Kata from a hybrid skills + agents architecture to a 100% skills-based model. Agents become skills with `context: fork` frontmatter, enabling them to run as subagents while conforming to the industry-standard Agent Skills format. This unifies Kata's abstractions, improves distribution compatibility with skill marketplaces, and simplifies the mental model without changing user-facing behavior.

## Goals

- Unify on a single abstraction (skills) instead of two (skills + agents)
- Enable distribution via any tool that supports the Agent Skills standard
- Maintain all current orchestration capabilities (sequential calls, parallel spawning)
- Preserve backward compatibility - users interact with Kata the same way
- Reduce codebase complexity by eliminating agent-specific code paths

## User Stories

### US-001: Define skill-to-skill invocation pattern
**Description:** As a skill author, I need to understand how skills invoke other skills so I can convert agent-spawning orchestrators.

**Acceptance Criteria:**
- [ ] Document the `Skill(skill-name)` tool syntax for direct invocation
- [ ] Document how `context: fork` skills receive arguments via `$ARGUMENTS`
- [ ] Document how results flow back to the calling skill
- [ ] Create example showing orchestrator skill calling worker skill
- [ ] Typecheck passes (if any code changes)

---

### US-002: Define parallel skill spawning pattern
**Description:** As a skill author, I need to spawn multiple skills in parallel (like current wave-based agent execution) so orchestrators can parallelize work.

**Acceptance Criteria:**
- [ ] Document how to invoke multiple `Skill()` calls in parallel
- [ ] Document how parallel skill results are collected
- [ ] Document wave-based execution pattern using skills
- [ ] Create example showing orchestrator spawning 3 skills in parallel
- [ ] Verify parallel execution actually happens (not sequential)

---

### US-003: Convert kata-executor agent to skill
**Description:** As a developer, I want to convert the kata-executor agent to a skill so it follows the skills-only pattern.

**Acceptance Criteria:**
- [ ] Create `skills/executor/SKILL.md` with equivalent content from `agents/kata-executor.md`
- [ ] Add `context: fork` to frontmatter for subagent execution
- [ ] Add appropriate `allowed-tools` matching current agent capabilities
- [ ] Preserve all task execution, checkpoint, and deviation handling logic
- [ ] Update orchestrator references from `Task(kata-executor)` to `Skill(executor)`
- [ ] Delete `agents/kata-executor.md` after migration verified
- [ ] Typecheck passes

---

### US-004: Convert kata-planner agent to skill
**Description:** As a developer, I want to convert the kata-planner agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/planner/SKILL.md` with equivalent content from `agents/kata-planner.md`
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve plan generation, task breakdown, and wave computation logic
- [ ] Update orchestrator references to use `Skill(planner)`
- [ ] Delete `agents/kata-planner.md` after migration verified
- [ ] Typecheck passes

---

### US-005: Convert kata-verifier agent to skill
**Description:** As a developer, I want to convert the kata-verifier agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/verifier/SKILL.md` with equivalent content from `agents/kata-verifier.md`
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve goal-backward verification logic
- [ ] Update orchestrator references to use `Skill(verifier)`
- [ ] Delete `agents/kata-verifier.md` after migration verified
- [ ] Typecheck passes

---

### US-006: Convert kata-debugger agent to skill
**Description:** As a developer, I want to convert the kata-debugger agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/debugger/SKILL.md` with equivalent content from `agents/kata-debugger.md`
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve scientific method debugging, checkpoint management
- [ ] Update orchestrator references to use `Skill(debugger)`
- [ ] Delete `agents/kata-debugger.md` after migration verified
- [ ] Typecheck passes

---

### US-007: Convert kata-phase-researcher agent to skill
**Description:** As a developer, I want to convert the kata-phase-researcher agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/phase-researcher/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools` (including web access)
- [ ] Preserve research methodology and RESEARCH.md output format
- [ ] Update orchestrator references to use `Skill(phase-researcher)`
- [ ] Delete `agents/kata-phase-researcher.md` after migration verified
- [ ] Typecheck passes

---

### US-008: Convert kata-project-researcher agent to skill
**Description:** As a developer, I want to convert the kata-project-researcher agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/project-researcher/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve domain research methodology
- [ ] Update orchestrator references to use `Skill(project-researcher)`
- [ ] Delete `agents/kata-project-researcher.md` after migration verified
- [ ] Typecheck passes

---

### US-009: Convert kata-roadmapper agent to skill
**Description:** As a developer, I want to convert the kata-roadmapper agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/roadmapper/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve roadmap generation and phase breakdown logic
- [ ] Update orchestrator references to use `Skill(roadmapper)`
- [ ] Delete `agents/kata-roadmapper.md` after migration verified
- [ ] Typecheck passes

---

### US-010: Convert kata-plan-checker agent to skill
**Description:** As a developer, I want to convert the kata-plan-checker agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/plan-checker/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve goal-backward plan verification logic
- [ ] Update orchestrator references to use `Skill(plan-checker)`
- [ ] Delete `agents/kata-plan-checker.md` after migration verified
- [ ] Typecheck passes

---

### US-011: Convert kata-codebase-mapper agent to skill
**Description:** As a developer, I want to convert the kata-codebase-mapper agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/codebase-mapper/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve codebase analysis and documentation output
- [ ] Update orchestrator references to use `Skill(codebase-mapper)`
- [ ] Delete `agents/kata-codebase-mapper.md` after migration verified
- [ ] Typecheck passes

---

### US-012: Convert kata-entity-generator agent to skill
**Description:** As a developer, I want to convert the kata-entity-generator agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/entity-generator/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve semantic entity documentation generation
- [ ] Update orchestrator references to use `Skill(entity-generator)`
- [ ] Delete `agents/kata-entity-generator.md` after migration verified
- [ ] Typecheck passes

---

### US-013: Convert kata-integration-checker agent to skill
**Description:** As a developer, I want to convert the kata-integration-checker agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/integration-checker/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve cross-phase integration verification logic
- [ ] Update orchestrator references to use `Skill(integration-checker)`
- [ ] Delete `agents/kata-integration-checker.md` after migration verified
- [ ] Typecheck passes

---

### US-014: Convert kata-research-synthesizer agent to skill
**Description:** As a developer, I want to convert the kata-research-synthesizer agent to a skill.

**Acceptance Criteria:**
- [ ] Create `skills/research-synthesizer/SKILL.md` with equivalent content
- [ ] Add `context: fork` and appropriate `allowed-tools`
- [ ] Preserve SUMMARY.md synthesis logic
- [ ] Update orchestrator references to use `Skill(research-synthesizer)`
- [ ] Delete `agents/kata-research-synthesizer.md` after migration verified
- [ ] Typecheck passes

---

### US-015: Convert PR review agents to skills
**Description:** As a developer, I want to convert the PR review toolkit agents (code-reviewer, silent-failure-hunter, etc.) to skills.

**Acceptance Criteria:**
- [ ] Create skills for: code-reviewer, silent-failure-hunter, code-simplifier, comment-analyzer, pr-test-analyzer, type-design-analyzer
- [ ] Each skill has `context: fork` and appropriate `allowed-tools`
- [ ] Preserve specialized review logic for each agent type
- [ ] Update review orchestrator to use `Skill()` calls
- [ ] Delete corresponding agent files after migration verified
- [ ] Typecheck passes

---

### US-016: Update execute-phase orchestrator for skills-only
**Description:** As a developer, I want the execute-phase skill to spawn executor skills instead of agents.

**Acceptance Criteria:**
- [ ] Update `skills/execute-phase/SKILL.md` to use `Skill(executor)` instead of `Task(kata-executor)`
- [ ] Preserve wave-based parallel execution using parallel `Skill()` calls
- [ ] Verify executor skills run in forked context
- [ ] Verify results flow back correctly to orchestrator
- [ ] End-to-end test: execute a phase with multiple plans
- [ ] Typecheck passes

---

### US-017: Update plan-phase orchestrator for skills-only
**Description:** As a developer, I want the plan-phase skill to spawn planner/checker skills instead of agents.

**Acceptance Criteria:**
- [ ] Update `skills/plan-phase/SKILL.md` to use `Skill(phase-researcher)`, `Skill(planner)`, `Skill(plan-checker)`
- [ ] Preserve research → plan → verify loop
- [ ] Verify skills run in forked context with correct arguments
- [ ] End-to-end test: plan a phase from scratch
- [ ] Typecheck passes

---

### US-018: Update verify-work orchestrator for skills-only
**Description:** As a developer, I want the verify-work skill to spawn verifier/debugger skills instead of agents.

**Acceptance Criteria:**
- [ ] Update `skills/verify-work/SKILL.md` to use `Skill(verifier)`, `Skill(debugger)`
- [ ] Preserve verification → debug loop
- [ ] Verify skills run in forked context
- [ ] End-to-end test: verify a completed phase
- [ ] Typecheck passes

---

### US-019: Update new-project orchestrator for skills-only
**Description:** As a developer, I want the new-project skill to spawn researcher/roadmapper skills instead of agents.

**Acceptance Criteria:**
- [ ] Update `skills/new-project/SKILL.md` to use `Skill(project-researcher)`, `Skill(roadmapper)`
- [ ] Preserve parallel researcher spawning pattern
- [ ] Verify skills run in forked context
- [ ] End-to-end test: initialize a new project
- [ ] Typecheck passes

---

### US-020: Update map-codebase orchestrator for skills-only
**Description:** As a developer, I want the map-codebase skill to spawn mapper skills instead of agents.

**Acceptance Criteria:**
- [ ] Update `skills/map-codebase/SKILL.md` to use `Skill(codebase-mapper)`, `Skill(entity-generator)`
- [ ] Preserve parallel mapper spawning by focus area
- [ ] Verify skills run in forked context
- [ ] End-to-end test: map an existing codebase
- [ ] Typecheck passes

---

### US-021: Remove agents directory and build infrastructure
**Description:** As a developer, I want to remove the agents/ directory and related build code after all agents are migrated.

**Acceptance Criteria:**
- [ ] Delete `agents/` directory (all files migrated to skills)
- [ ] Update `build.js` to remove agent-specific handling
- [ ] Update `plugin.json` to remove agent references
- [ ] Remove agent-related test files
- [ ] Verify plugin builds successfully without agents/
- [ ] Typecheck passes

---

### US-022: Update CLAUDE.md and documentation
**Description:** As a developer, I want documentation to reflect the skills-only architecture.

**Acceptance Criteria:**
- [ ] Update CLAUDE.md "Architecture" section to describe skills-only model
- [ ] Update CLAUDE.md skill/agent table to show only skills
- [ ] Update KATA-STYLE.md to remove agent-specific conventions
- [ ] Update any references to "agents" in skill files
- [ ] Create migration note in CHANGELOG explaining the change

---

### US-023: Update plugin.json for skills-only
**Description:** As a developer, I want plugin.json to declare only skills (no agents).

**Acceptance Criteria:**
- [ ] Remove `agents` array from plugin.json
- [ ] Verify all skills are declared in `skills` array
- [ ] Verify forked skills have correct frontmatter
- [ ] Plugin validates successfully
- [ ] Typecheck passes

---

### US-024: Create conversion script for agent-to-skill migration
**Description:** As a developer, I want a script to automate the mechanical parts of agent-to-skill conversion.

**Acceptance Criteria:**
- [ ] Script reads agent markdown file
- [ ] Script generates SKILL.md with correct frontmatter (`context: fork`, `allowed-tools`, etc.)
- [ ] Script preserves all content sections
- [ ] Script outputs to correct skills directory structure
- [ ] Script identifies orchestrator references that need manual update
- [ ] Typecheck passes

---

### US-025: End-to-end validation of skills-only architecture
**Description:** As a developer, I want to validate that the entire Kata workflow works with skills-only.

**Acceptance Criteria:**
- [ ] Run `/kata:new-project` end-to-end - all skills spawn correctly
- [ ] Run `/kata:plan-phase` end-to-end - research/plan/check skills work
- [ ] Run `/kata:execute-phase` end-to-end - executor skills work in parallel
- [ ] Run `/kata:verify-work` end-to-end - verifier/debugger skills work
- [ ] Run `/kata:review-pull-requests` end-to-end - review skills work in parallel
- [ ] All existing skill tests pass
- [ ] No regressions in user-facing behavior

## Functional Requirements

- FR-1: Skills with `context: fork` MUST run in isolated subagent context
- FR-2: Skills MUST be able to invoke other skills via `Skill(name)` tool
- FR-3: Multiple `Skill()` calls in a single response MUST execute in parallel
- FR-4: Skill results MUST flow back to the calling skill/orchestrator
- FR-5: Forked skills MUST receive arguments via `$ARGUMENTS` substitution
- FR-6: Forked skills MUST have access to tools specified in `allowed-tools`
- FR-7: User-invocable skills (`/kata:*`) MUST continue to work unchanged
- FR-8: All current orchestration patterns (sequential, parallel, waves) MUST be preservable
- FR-9: Plugin MUST build and validate without agents/ directory
- FR-10: Skill names MUST follow existing `kata-*` naming convention during migration

## Non-Goals

- No changes to user-facing skill invocation (`/kata:plan-phase`, etc.)
- No changes to planning file formats (PLAN.md, SUMMARY.md, etc.)
- No changes to checkpoint or verification workflows
- No new features - this is a refactoring migration
- No performance optimization (preserve existing behavior first)
- No changes to the Claude Code plugin format itself

## Technical Considerations

### Agent-to-Skill Mapping

| Agent File | Skill Directory | Key Frontmatter |
|------------|-----------------|-----------------|
| `agents/kata-executor.md` | `skills/executor/` | `context: fork`, `allowed-tools: Read, Write, Edit, Bash, Grep, Glob` |
| `agents/kata-planner.md` | `skills/planner/` | `context: fork`, `allowed-tools: Read, Write, Bash, Grep, Glob` |
| `agents/kata-verifier.md` | `skills/verifier/` | `context: fork`, `allowed-tools: Read, Bash, Grep, Glob` |
| `agents/kata-debugger.md` | `skills/debugger/` | `context: fork`, `allowed-tools: Read, Write, Edit, Bash, Grep, Glob` |

### Orchestration Pattern Translation

**Current (agents):**
```markdown
Spawn kata-executor agents for each plan in the wave:
- Task(kata-executor, plan: 01-01-PLAN.md)
- Task(kata-executor, plan: 01-02-PLAN.md)
```

**New (skills):**
```markdown
Invoke executor skills for each plan in the wave:
- Skill(executor, $ARGUMENTS: "plan: 01-01-PLAN.md")
- Skill(executor, $ARGUMENTS: "plan: 01-02-PLAN.md")
```

### Directory Structure Change

**Before:**
```
dist/plugin/
├── agents/
│   ├── kata-executor.md
│   ├── kata-planner.md
│   └── ...
├── skills/
│   ├── execute-phase/SKILL.md (orchestrator)
│   └── ...
```

**After:**
```
dist/plugin/
├── skills/
│   ├── execute-phase/SKILL.md (orchestrator)
│   ├── executor/SKILL.md (forked worker)
│   ├── planner/SKILL.md (forked worker)
│   └── ...
```

### Frontmatter Template for Converted Agents

```yaml
---
name: {agent-name-without-kata-prefix}
description: {from agent description or first paragraph}
context: fork
user-invocable: false
allowed-tools: {tools the agent needs}
---

{agent content}
```

## Success Metrics

- All 15+ agents converted to skills with `context: fork`
- All orchestrator skills updated to use `Skill()` instead of `Task()`
- Zero user-facing behavior changes (same commands, same outputs)
- Plugin builds without agents/ directory
- All existing tests pass
- End-to-end workflows complete successfully

## Open Questions

1. **Skill namespacing:** Should forked worker skills be prefixed differently than user-invocable skills? (e.g., `_executor` vs `executor`)

2. **Model selection:** How do forked skills specify which model to use? The `model` frontmatter field should work, but needs verification.

3. **Parallel execution verification:** How do we confirm multiple `Skill()` calls actually execute in parallel vs. sequentially?

4. **Error propagation:** How do errors in forked skills propagate back to orchestrators? Need to verify current behavior matches agent error handling.

5. **Context inheritance:** Do forked skills inherit CLAUDE.md context? The docs suggest yes, but should verify for Kata's use case.

6. **Agent field usage:** The `agent` frontmatter field specifies which subagent type to use. For Kata's worker skills, should we use `general-purpose` or create custom agent types?
