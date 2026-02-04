# Research Summary: Agent Skills Subagent Migration

**Project:** Kata v1.6.0 Milestone
**Synthesized:** 2026-02-04
**Research Files:** STACK.md, FEATURES.md, SUBAGENT-MIGRATION.md (ARCHITECTURE), PITFALLS.md
**Overall Confidence:** HIGH

---

## Executive Summary

The v1.6.0 milestone goal was to convert Kata's custom subagents to Agent Skills resources. Research reveals a critical finding: **the Agent Skills specification does not define subagent patterns**. Agent Skills is a format specification for SKILL.md files, not an orchestration framework. Subagent instantiation is a Claude Code implementation detail, not part of the Agent Skills standard.

**What we learned:**
1. **Agent Skills scope** - Defines SKILL.md format (frontmatter + markdown), directory structure (skills/references/scripts/assets/), and progressive disclosure. Does NOT define multi-agent orchestration.
2. **Claude Code subagents** - A proprietary extension built on Agent Skills, supporting custom agent definitions in `.claude/agents/` or `<plugin>/agents/` directories.
3. **Kata's current architecture** - Already uses Claude Code's native subagent system correctly. Agents live in `agents/` directory, copied to `.claude-plugin/agents/` during build.

**The real question:** Should Kata's architecture change to better leverage Claude Code's plugin agent features? The answer is **yes, with refinements**, not a wholesale migration.

**Recommended scope:** Polish Kata's existing architecture to align with Claude Code's latest subagent conventions, specifically:
- Update frontmatter fields to match Claude Code's schema
- Rename `subagent_type` parameter to `agent` in Task() calls
- Explore optional features (skills preloading, permissionMode, lifecycle hooks)
- Test behavior equivalence after changes

This is a polish pass, not a rewrite. Estimated effort: 2-3 hours code changes, 1 hour testing.

---

## Key Findings by Research Area

### From STACK.md: Architecture and Standards

**Critical finding:** Agent Skills spec has no concept of subagent definition, spawning, delegation, or multi-agent orchestration. These are platform-specific implementations.

**Claude Code's subagent system:**
- Location: `.claude/agents/` (project), `~/.claude/agents/` (user), `<plugin>/agents/` (plugin)
- Format: Markdown with YAML frontmatter (same as SKILL.md)
- Frontmatter fields: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `hooks`
- Spawning: Task tool with `subagent_type` (legacy) or `agent` (preferred) parameter
- Constraint: Subagents cannot spawn other subagents

**Kata's current architecture:**
- Skills are orchestrators (invoke Task tool)
- Agents live in `agents/kata-*.md` with markdown + YAML frontmatter
- Build system copies to `.claude-plugin/agents/` and transforms namespaces
- Already 90% compliant with Claude Code's plugin agent standard

**Recommended approach:** Hybrid architecture
1. Agents distributed as plugin subagents (`.claude-plugin/agents/`)
2. Skills reference agents via Task tool (`agent="kata:kata-planner"`)
3. Optional: Skills field in agent frontmatter for preloading domain knowledge

**Technology stack:**
- No new dependencies required
- Build system updates: minor regex changes
- Agent frontmatter updates: add `model`, move `color` to `metadata`
- Task invocation updates: `subagent_type` → `agent`

### From FEATURES.md: Required Capabilities

**Table stakes (must-have):**
- Custom subagent definitions (already supported)
- Tool restrictions per agent (frontmatter `tools:` field)
- Model selection per agent (frontmatter `model:` field)
- Task tool spawning (already working)
- Plugin distribution (already implemented)
- Context isolation (built-in behavior)

**Differentiators (should-have):**
- Skills preloading into subagents (inject domain knowledge via `skills:` field)
- Permission modes (control prompts: `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`)
- Lifecycle hooks per agent (PreToolUse, PostToolUse, Stop)
- Color coding (visual identification, already used)

**Anti-features to address:**
- Missing `name` field in frontmatter (inferred from filename, should be explicit)
- Custom frontmatter fields (verify compatibility with Claude Code)
- Very long agent prompts (consider references/ structure)
- No progressive disclosure for agents (main file only, no references/)

**MVP recommendation:**
1. Verify frontmatter compatibility
2. Add `name` field to all agents
3. Test Task() spawning with plugin agents
4. Add `permissionMode` to verifier (read-only) and executor (auto-approve edits)
5. Add `model` to agent frontmatter (remove from Task() calls)

### From SUBAGENT-MIGRATION.md: Migration Path

**Current architecture:**
```
agents/kata-*.md           → Agent definitions (19 files)
skills/kata-*/SKILL.md     → Orchestrators
scripts/build.js           → Copies agents to .claude-plugin/agents/
```

**Target architecture:**
```
agents/kata-*.md           → Agent definitions (source)
.claude-plugin/agents/     → Built plugin agents
skills/kata-*/SKILL.md     → Orchestrators (no change)
```

**Gap analysis:**

| Kata Current | Claude Code Standard | Action |
|--------------|---------------------|---------|
| `name` (inferred) | `name` (required) | Add explicit field |
| `tools` | `tools` | Keep format |
| `color` | (not standard) | Move to `metadata.color` |
| `subagent_type="kata-*"` | `agent="kata:kata-*"` | Rename parameter |
| (missing) | `model` | Add where needed |

**Migration steps:**
1. **Phase 1:** Update agent frontmatter (add `model`, move `color`)
2. **Phase 2:** Update Task invocations (`subagent_type` → `agent`)
3. **Phase 3:** Update build.js transform regex
4. **Phase 4:** Update tests (artifact validation, frontmatter schema)
5. **Phase 5:** Update documentation (CLAUDE.md, KATA-STYLE.md)

**No structural changes needed.** The `agents/` directory already matches Claude Code's expected layout.

**Backwards compatibility:** Keep dual transforms in build.js during transition to support both `subagent_type` (legacy) and `agent` (preferred).

**Rollback strategy:** Git revert. Changes are additive, not destructive.

### From PITFALLS.md: Risk Mitigation

**Critical pitfalls:**

1. **Context passing assumption mismatch** (Severity: HIGH)
   - Kata orchestrators inline context via Task prompts
   - @-references don't work across Task boundaries
   - Agents must receive all required context explicitly
   - **Prevention:** Audit every Task invocation, design explicit context injection
   - **Affects:** Phase 1 (POC)

2. **Tool allowlist semantic drift** (Severity: HIGH)
   - `allowed-tools` controls permission prompting, not tool availability
   - Agents may gain unintended capabilities if allowlist misunderstood
   - **Prevention:** Map tool lists carefully, test with restricted access
   - **Affects:** Phase 1 (POC) and Phase 2 (each agent)

3. **Model selection regression** (Severity: HIGH)
   - Kata's model_profile config (quality/balanced/budget) controls model per agent
   - Agent Skills `model` field is static
   - **Prevention:** Keep model selection in orchestrator, use `model: inherit`
   - **Affects:** Phase 1 (design decision)

4. **Structured return contract breakage** (Severity: HIGH)
   - Orchestrators parse agent output (`## PLANNING COMPLETE`, `## CHECKPOINT REACHED`)
   - Agent Skills don't enforce return formats
   - **Prevention:** Maintain explicit output requirements, validate parsing
   - **Affects:** Phase 1 (POC)

5. **Subagent-cannot-spawn-subagent hierarchy violation** (Severity: CRITICAL)
   - Kata Skills ARE orchestrators that spawn multiple agents
   - Claude Code constraint: subagents cannot spawn other subagents
   - **Prevention:** Skills must NOT use `context: fork` if they spawn agents
   - **Affects:** Phase 1 (architecture validation)

**Moderate pitfalls:**
- Discovery pattern incompatibility (skill location matters)
- Description mismatch for invocation (rewrite for triggers)
- Hook migration gap (explicit hooks for implicit behaviors)
- @-reference syntax preservation (build system transforms)
- Checkpoint protocol translation (no native support)

**Kata-specific risk factors:**
- High: Context inlining pattern (all 15+ agents affected)
- High: Orchestrator hierarchy (8 skills spawn subagents)
- Medium: Structured return contracts (10+ patterns)
- Medium: Model profile system (3 profiles, per-agent models)
- Low: Visual identity (6 color values)

---

## Implications for Roadmap

### Revised Milestone Goal

**Original:** Convert custom subagents to Agent Skills resources

**Revised:** Align Kata's subagent architecture with Claude Code plugin conventions

The milestone is still valid but needs scoping adjustment. Kata already uses Claude Code's native subagent system. The work is polish and optimization, not wholesale migration.

### Suggested Phase Structure

#### Phase 1: POC — Validate Architecture (2-4 hours)
**Goal:** Prove that Kata's current architecture works with Claude Code plugin agents, identify any breaking changes.

**Delivers:**
- Frontmatter field audit (all 19 agents)
- Test harness for agent spawning
- Context passing contract documentation
- Model selection strategy decision

**Features from FEATURES.md:**
- Verify frontmatter compatibility
- Add `name` field to 2-3 sample agents
- Test Task() spawning with plugin namespace

**Pitfalls to avoid:**
- Context passing mismatch (test with kata-planner)
- Subagent hierarchy violation (verify orchestrator can spawn)
- Model selection regression (test config.json profiles)

**Research flag:** No additional research needed. Architecture validated.

---

#### Phase 2: Update Frontmatter (1-2 hours)
**Goal:** Bring all agent definitions up to Claude Code's plugin agent standard.

**Delivers:**
- All 19 agents have explicit `name` field
- `color` moved to `metadata.color`
- `model` field added where appropriate
- Frontmatter validated against schema

**Features from FEATURES.md:**
- Table stakes: explicit name field
- Nice-to-have: permissionMode for verifier, executor

**Pitfalls to avoid:**
- Tool allowlist drift (verify tools field semantics)
- Description mismatch (rewrite for invocation triggers if needed)

**Research flag:** Standard patterns, no research needed.

---

#### Phase 3: Update Task Invocations (1 hour)
**Goal:** Modernize Task() calls to use `agent` parameter instead of legacy `subagent_type`.

**Delivers:**
- All SKILL.md files use `agent="kata-*"`
- Build system transforms to `agent="kata:kata-*"`
- Tests validate parameter change

**Features from FEATURES.md:**
- Task tool spawning (modernize syntax)

**Pitfalls to avoid:**
- Build transform misses cases (grep for all patterns)

**Research flag:** Standard patterns, no research needed.

---

#### Phase 4: Explore Optional Features (2-3 hours)
**Goal:** Evaluate and selectively adopt Claude Code's advanced subagent features.

**Delivers:**
- Skills preloading tested (inject plan-format into planner)
- permissionMode applied to appropriate agents
- Lifecycle hooks POC (pre-commit validation in executor)
- Decision document on what to adopt

**Features from FEATURES.md:**
- Skills preloading (differentiator)
- Permission modes (differentiator)
- Lifecycle hooks (nice-to-have)

**Pitfalls to avoid:**
- Skills preloading bloats context (test selectively)
- Hook migration gap (audit implicit behaviors)

**Research flag:** Experimental features. May need iteration based on testing.

---

#### Phase 5: Update Build System & Documentation (1 hour)
**Goal:** Finalize build transformations and update project documentation.

**Delivers:**
- Build.js handles new patterns
- CLAUDE.md documents agent conventions
- KATA-STYLE.md updated with frontmatter rules
- Tests validate build output

**Features from FEATURES.md:**
- Plugin distribution (validate)

**Pitfalls to avoid:**
- @-reference syntax changes
- Discovery pattern incompatibility

**Research flag:** Standard patterns, no research needed.

---

### Research Flags

**Needs additional research:**
- None. All questions answered by current research.

**Standard patterns (skip research):**
- Frontmatter updates (Phase 2)
- Task invocation syntax (Phase 3)
- Build system transforms (Phase 5)

**Experimental (may need iteration):**
- Skills preloading (Phase 4) - Test with small sample first
- Lifecycle hooks (Phase 4) - Validate hook behavior matches expectations

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified with official Claude Code docs and Agent Skills spec |
| Features | HIGH | Based on documented Claude Code subagent capabilities |
| Architecture | HIGH | Kata codebase analyzed, build.js validated, directory structure confirmed |
| Pitfalls | HIGH | Based on Kata patterns + industry best practices for subagent systems |

### Gaps Addressed

**Original uncertainty:** How do Agent Skills define subagents?

**Resolution:** They don't. Agent Skills defines SKILL.md format. Claude Code implements subagents as a platform feature. Kata already uses Claude Code's system correctly.

**Original uncertainty:** Should agents become skill resources?

**Resolution:** No. Keep agents as plugin agents (`.claude-plugin/agents/`). Skills remain orchestrators. This aligns with Claude Code's architecture.

**Original uncertainty:** What breaks during migration?

**Resolution:** Very little. Changes are primarily:
1. Frontmatter field updates (add `name`, move `color`)
2. Parameter rename (`subagent_type` → `agent`)
3. Optional feature adoption (skills preloading, permissionMode)

### Risks Requiring Attention During Planning

1. **Context passing** - Must test that agents receive all required context after changes
2. **Structured returns** - Must validate that orchestrators can still parse agent output
3. **Model profiles** - Must ensure config.json model_profile setting still works
4. **Tool permissions** - Must verify agents don't gain unintended capabilities

---

## Sources Aggregated

### Agent Skills Specification
- [Agent Skills Specification](https://agentskills.io/specification.md) - SKILL.md format definition
- [Integrate Skills](https://agentskills.io/integrate-skills.md) - Integration guidance

### Claude Code Documentation
- [Create Custom Subagents](https://code.claude.com/docs/en/sub-agents) - Complete subagent reference
- [Skills Documentation](https://code.claude.com/docs/en/skills) - Skills and subagent interaction
- [Plugin Components Reference](https://code.claude.com/docs/en/plugins-reference) - Plugin structure

### Kata Codebase
- `scripts/build.js` - Plugin build with namespace transformation
- `agents/kata-*.md` - Current agent definitions (19 files)
- `skills/kata-*/SKILL.md` - Current skill orchestrators
- `CLAUDE.md`, `KATA-STYLE.md` - Project conventions

### Community Resources
- [Task Tool: Claude Code's Agent Orchestration System](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2)
- [Claude Code Customization Guide](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
- [Best Practices for Claude Code Sub-Agents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)

---

## Ready for Requirements Definition

This research provides sufficient foundation for requirements definition. The milestone scope is clear:

**Core objective:** Polish Kata's subagent architecture to align with Claude Code plugin conventions.

**Deliverables:**
1. Frontmatter updated across all 19 agents
2. Task invocations modernized (agent parameter)
3. Build system handles new patterns
4. Optional features evaluated and selectively adopted
5. Documentation reflects current conventions

**Estimated effort:** 7-12 hours total (5 phases)

**Risk level:** Low. Changes are incremental, additive, and easily reversible.

The roadmapper can proceed with confidence that the technical approach is sound and the scope is well-defined.
