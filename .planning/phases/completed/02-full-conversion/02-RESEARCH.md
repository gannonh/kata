# Phase 2: Full Conversion - Research

**Researched:** 2026-02-05
**Domain:** Agent-to-skill resource migration, Claude Code subagent patterns
**Confidence:** HIGH

## Summary

Phase 1 POC successfully validated the agent-as-skill-resource pattern with kata-planner and kata-executor. Phase 2 requires migrating 17 remaining agents (19 total - 2 POC done) to skill resources and updating 7 skills to inline instructions using general-purpose subagents.

The migration follows a mechanical pattern established in POC: extract agent body to `skills/{parent-skill}/references/{agent-name}-instructions.md`, wrap in `<agent-instructions>` tags when spawning, use `subagent_type="general-purpose"` instead of `subagent_type="kata:kata-{name}"`.

**Key finding:** 2 agents (kata-silent-failure-hunter, kata-entity-generator) appear to be unused legacy code with no active skill references. These can be migrated to kata-review-pull-requests/references/ for completeness, but are not currently invoked.

**Primary recommendation:** Follow the POC migration pattern for all 17 remaining agents. Validate each migration with automated test (CONV-04) before proceeding to next agent.

## Standard Stack

### Core Pattern (Established in POC)

| Component | Implementation | Source |
|-----------|---------------|--------|
| Agent extraction | Copy agent body (no frontmatter) to skill references/ | POC-01, POC-02 |
| Instruction inlining | Read instruction file, wrap in `<agent-instructions>` tags | POC-03, POC-04 |
| Subagent type | `subagent_type="general-purpose"` replaces custom types | POC-03, POC-04 |
| Task spawning | `Task(prompt="...<agent-instructions>content</agent-instructions>...")` | kata-plan-phase, kata-execute-phase |

### Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js test runner | Built-in (Node 20+) | Test suite execution (CONV-04, CONV-05) |
| npm test | package.json script | Current test invocation pattern |
| scripts/build.js | Custom | Plugin build with agent namespace transform |

### Installation

No new dependencies required. Uses existing Node.js test infrastructure.

## Architecture Patterns

### Agent-to-Skill Mapping

**17 remaining agents map to 7 parent skills:**

#### kata-plan-phase (2 agents)
- kata-plan-checker (verification loop)
- kata-phase-researcher (domain research)

#### kata-verify-work (2 agents)
- kata-verifier (goal verification)
- kata-debugger (gap diagnosis)

#### kata-new-project (2 agents)
- kata-project-researcher (stack/domain research)
- kata-roadmapper (phase breakdown)

#### kata-add-milestone (3 agents)
- kata-project-researcher (stack/domain research)
- kata-research-synthesizer (research aggregation)
- kata-roadmapper (phase breakdown)

#### kata-research-phase (1 agent)
- kata-phase-researcher (domain research)

#### kata-track-progress (2 agents)
- kata-debugger (root cause analysis)
- kata-codebase-mapper (project intelligence)

#### kata-audit-milestone (1 agent)
- kata-integration-checker (milestone audit)

#### kata-review-pull-requests (6 agents + 2 unused)
- kata-code-reviewer (quality review) - ALSO referenced by kata-execute-phase
- kata-code-simplifier (polish pass)
- kata-comment-analyzer (comment accuracy)
- kata-pr-test-analyzer (test quality)
- kata-type-design-analyzer (type safety)
- kata-failure-finder (error handling)
- kata-silent-failure-hunter (UNUSED - no skill references)
- kata-entity-generator (UNUSED - no skill references)

**Special case:** kata-code-reviewer is referenced by TWO skills:
1. kata-review-pull-requests (primary use)
2. kata-execute-phase (model profile table only - not spawned)

**Resolution:** Migrate to kata-review-pull-requests/references/. If kata-execute-phase needs it later, can read from there or copy.

### Migration Pattern (Per Agent)

```
1. Extract agent body (skip frontmatter)
   - Read agents/kata-{name}.md
   - Extract everything after YAML frontmatter
   - Write to skills/{parent}/references/{name}-instructions.md

2. Update parent skill SKILL.md
   - Add @./references/{name}-instructions.md to execution_context
   - Before Task() call: Read instruction file content
   - Wrap in <agent-instructions> tags
   - Change subagent_type="kata:kata-{name}" to subagent_type="general-purpose"

3. Verify build still works
   - npm run build:plugin
   - Check dist/plugin/agents/ still has files (build copies agents/)
   - Check dist/plugin/skills/ has new instruction files

4. Run migration validation test (CONV-04)
```

### File Naming Convention

```
Agent: agents/kata-{name}.md
Instruction file: skills/{parent-skill}/references/{name}-instructions.md

Examples:
- agents/kata-plan-checker.md → skills/kata-plan-phase/references/plan-checker-instructions.md
- agents/kata-verifier.md → skills/kata-verify-work/references/verifier-instructions.md
- agents/kata-project-researcher.md → skills/kata-new-project/references/project-researcher-instructions.md
```

**Note:** Drop "kata-" prefix in instruction filename for brevity.

### PR Review Toolkit Pattern

kata-review-pull-requests skill uses `context: fork` (runs as subagent itself) but does NOT spawn Task() subagents. Instead, it describes 8 review agents in its instructions and Claude's parent context spawns them.

**Current pattern:** Skill body contains agent descriptions, main session spawns agents.

**Migration impact:** Move agent instruction files to kata-review-pull-requests/references/, skill body can reference them as supporting documentation.

**Alternative:** Skill could spawn agents via Task() if it changes to orchestrator pattern (not using context: fork).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent migration validation | Manual UAT per agent | Automated test suite (CONV-04) | 17 agents × manual testing = high error rate |
| Test suite detection | Hardcode "npm test" | Check package.json scripts field | Projects use different test runners (jest, vitest, etc.) |
| Agent body extraction | Manual copy/paste | Script with frontmatter detection | Prevents accidental inclusion of YAML in instruction files |
| Instruction file reading | Inline in SKILL.md | Read at runtime before Task() | Allows updating instructions without rebuilding skill |

**Key insight:** Migration is mechanical and repetitive (17 agents). Automation via scripts or validation tests prevents human error.

## Common Pitfalls

### Pitfall 1: Including YAML frontmatter in instruction files

**What goes wrong:** Copying entire agent file to instruction file includes frontmatter, breaking prompt structure.

**Why it happens:** Agents are markdown files with frontmatter. Copy/paste includes everything.

**How to avoid:** Extract only markdown body (skip YAML between `---` markers).

**Warning signs:** Instruction file starts with `---\nname:` instead of `<role>`.

### Pitfall 2: Forgetting to update subagent_type

**What goes wrong:** Skill still references `subagent_type="kata:kata-{name}"` which won't exist after agents/ deleted.

**Why it happens:** Find/replace misses some occurrences, or agent name doesn't match pattern.

**How to avoid:** Grep for all `subagent_type="kata:` patterns before declaring migration complete (CONV-03).

**Warning signs:** Build passes but skill fails at runtime with "Unknown subagent type" error.

### Pitfall 3: Shared agents between skills

**What goes wrong:** Multiple skills reference same agent (kata-project-researcher, kata-debugger, kata-phase-researcher, kata-roadmapper). Migrating to one skill breaks the other.

**Why it happens:** One-to-many relationship between agent and skills not accounted for.

**How to avoid:**
- Choose primary skill as canonical location
- Other skills read from primary skill's references/ directory
- OR: Copy instruction file to each skill's references/ (duplication, but isolated)

**Warning signs:** Skill A works after migration, Skill B fails with "file not found".

### Pitfall 4: Assuming all agents are actively used

**What goes wrong:** Migrating unused agents (silent-failure-hunter, entity-generator) wastes effort.

**Why it happens:** agents/ directory contains legacy code never cleaned up.

**How to avoid:** Grep skills/ for references before migrating each agent. If 0 matches, flag as "unused - migrate for completeness only".

**Warning signs:** No skill references agent in Task() calls or descriptions.

### Pitfall 5: PR review toolkit context confusion

**What goes wrong:** kata-review-pull-requests uses `context: fork` so it runs AS a subagent. Trying to make it spawn Task() subagents breaks the pattern.

**Why it happens:** Misunderstanding skill execution modes (inline vs fork).

**How to avoid:** Leave kata-review-pull-requests as-is. It doesn't spawn agents via Task(), so migration is just moving instruction files to references/ for documentation.

**Warning signs:** Adding Task() calls to a skill with `context: fork` in frontmatter.

## Code Examples

### Pattern 1: Extract Agent Body

```bash
# Source: agents/kata-plan-checker.md
# Extract body (skip frontmatter) to instruction file

# Find where frontmatter ends (second ---) and extract everything after
awk '/^---$/{if(++n==2){f=1;next}}f' agents/kata-plan-checker.md > skills/kata-plan-phase/references/plan-checker-instructions.md
```

### Pattern 2: Inline Instructions in Skill

```markdown
<!-- Source: skills/kata-plan-phase/SKILL.md -->
<execution_context>
@./references/planner-instructions.md
@./references/plan-checker-instructions.md
</execution_context>

<!-- In process section, before Task() call: -->
**Read plan checker instructions:**
```bash
CHECKER_INSTRUCTIONS=$(cat skills/kata-plan-phase/references/plan-checker-instructions.md)
```

**Spawn plan checker:**
```javascript
Task(
  prompt=`
Review the plan and verify it meets quality standards.

<agent-instructions>
${CHECKER_INSTRUCTIONS}
</agent-instructions>

<plan-to-review>
[plan content here]
</plan-to-review>
`,
  subagent_type="general-purpose",
  model="${checker_model}",
  description="Plan verification"
)
```
```

### Pattern 3: Shared Agent Resolution

```markdown
<!-- Option A: Reference primary skill's instruction file -->
<!-- In kata-add-milestone/SKILL.md: -->
<execution_context>
@../kata-new-project/references/project-researcher-instructions.md
@../kata-new-project/references/roadmapper-instructions.md
</execution_context>

<!-- Option B: Duplicate to both skills -->
<!-- Copy to both locations: -->
skills/kata-new-project/references/project-researcher-instructions.md
skills/kata-add-milestone/references/project-researcher-instructions.md
```

**Recommendation:** Use Option A (cross-reference) to avoid duplication. If skills diverge later, instruction files can be copied independently.

### Pattern 4: Migration Validation Test (CONV-04)

```javascript
// Source: tests/migration-validation.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Agent migration validation', () => {
  const ROOT = process.cwd();
  const AGENTS_DIR = path.join(ROOT, 'agents');
  const SKILLS_DIR = path.join(ROOT, 'skills');

  // Agent-to-skill mapping (from research)
  const AGENT_MAPPINGS = {
    'kata-plan-checker': 'kata-plan-phase',
    'kata-phase-researcher': 'kata-research-phase',
    'kata-verifier': 'kata-verify-work',
    'kata-debugger': 'kata-verify-work',
    'kata-project-researcher': 'kata-new-project',
    'kata-research-synthesizer': 'kata-add-milestone',
    'kata-roadmapper': 'kata-new-project',
    'kata-codebase-mapper': 'kata-track-progress',
    'kata-integration-checker': 'kata-audit-milestone',
    'kata-code-reviewer': 'kata-review-pull-requests',
    'kata-code-simplifier': 'kata-review-pull-requests',
    'kata-comment-analyzer': 'kata-review-pull-requests',
    'kata-pr-test-analyzer': 'kata-review-pull-requests',
    'kata-type-design-analyzer': 'kata-review-pull-requests',
    'kata-failure-finder': 'kata-review-pull-requests',
    'kata-silent-failure-hunter': 'kata-review-pull-requests',
    'kata-entity-generator': 'kata-review-pull-requests'
  };

  for (const [agentName, skillName] of Object.entries(AGENT_MAPPINGS)) {
    test(`${agentName} migrated to ${skillName}`, () => {
      const agentFile = path.join(AGENTS_DIR, `${agentName}.md`);
      const instructionName = agentName.replace('kata-', '') + '-instructions.md';
      const instructionFile = path.join(SKILLS_DIR, skillName, 'references', instructionName);

      // Verify instruction file exists
      assert.ok(fs.existsSync(instructionFile),
        `Missing instruction file: ${skillName}/references/${instructionName}`);

      // Verify agent body matches instruction file (no frontmatter)
      const agentContent = fs.readFileSync(agentFile, 'utf8');
      const instructionContent = fs.readFileSync(instructionFile, 'utf8');

      // Extract agent body (after second ---)
      const agentBodyMatch = agentContent.match(/^---[\s\S]*?^---\s*\n([\s\S]*)$/m);
      assert.ok(agentBodyMatch, `Cannot parse frontmatter in ${agentName}.md`);

      const agentBody = agentBodyMatch[1].trim();
      assert.strictEqual(instructionContent.trim(), agentBody,
        `Instruction file body doesn't match agent body for ${agentName}`);
    });
  }

  test('No remaining kata:kata-* subagent types in skills', () => {
    const skillFiles = fs.readdirSync(SKILLS_DIR, { recursive: true })
      .filter(f => f.endsWith('SKILL.md'))
      .map(f => path.join(SKILLS_DIR, f));

    for (const skillFile of skillFiles) {
      const content = fs.readFileSync(skillFile, 'utf8');
      const matches = content.match(/subagent_type="kata:kata-[^"]+"/g);
      assert.ok(!matches || matches.length === 0,
        `${path.basename(path.dirname(skillFile))} still has custom subagent types: ${matches?.join(', ')}`);
    }
  });

  test('Skills read instruction files before Task() calls', () => {
    // For each skill with agents, verify it reads instruction files
    const skillsWithAgents = ['kata-plan-phase', 'kata-verify-work', 'kata-new-project',
      'kata-add-milestone', 'kata-research-phase', 'kata-track-progress', 'kata-audit-milestone'];

    for (const skillName of skillsWithAgents) {
      const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
      const content = fs.readFileSync(skillFile, 'utf8');

      // Verify references/@-includes instruction files
      const hasInstructionRefs = content.includes('-instructions.md');
      assert.ok(hasInstructionRefs,
        `${skillName} doesn't reference instruction files`);

      // Verify Task() calls use general-purpose
      const taskCalls = content.match(/Task\([^)]+subagent_type="general-purpose"/g);
      assert.ok(taskCalls && taskCalls.length > 0,
        `${skillName} doesn't use general-purpose subagent type`);

      // Verify <agent-instructions> wrapper exists
      const hasAgentInstructions = content.includes('<agent-instructions>');
      assert.ok(hasAgentInstructions,
        `${skillName} doesn't wrap instructions in <agent-instructions> tags`);
    }
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|---------|
| Custom subagent types (kata:kata-{name}) | Standard general-purpose subagent with inlined instructions | v1.6.0 (Phase 1 POC) | Makes Kata portable across Agent Skills platforms |
| Agent definitions in agents/ directory | Agent instructions in skill references/ | v1.6.0 (Phase 2) | Skills are self-contained, no separate agent registry |
| Build system copies agents/ to plugin | Build system namespace-transforms agent references | v1.6.0 (Phase 2) | Simpler plugin structure, agents deprecated |

**Deprecated/outdated:**
- `subagent_type="kata:kata-{name}"` - replaced with `subagent_type="general-purpose"` + inlined instructions
- Separate agents/ directory - replaced with skill references/ subdirectories
- Agent frontmatter (name, description, model, color) - replaced with skill configuration only

## Open Questions

### 1. How to handle CONV-05 (test suite before verification)?

**What we know:**
- kata-execute-phase orchestrator has step 6 "Aggregate results" before step 7 "Verify phase goal"
- Config has `workflow.verifier: true/false` to enable/disable verification
- Need to run project test suite between aggregation and verification

**What's unclear:**
- Should test suite run ONLY if project has package.json test script?
- What if test suite fails? Block verification or include failure in verification report?
- Does this apply to gap closure phases (which may not have verification)?

**Recommendation:**
- Insert test suite step between current steps 6 and 7
- Detect test runner: check package.json for "test" script, otherwise skip
- If tests fail: report failure, still proceed to verification (verifier will catch test failures as goal mismatch)
- Skip test suite for gap phases (VERIFICATION.md already exists, gaps mode)

### 2. Should unused agents be migrated?

**What we know:**
- kata-silent-failure-hunter and kata-entity-generator have 0 skill references
- Build system still copies agents/ to plugin
- Deleting them breaks nothing (no active callers)

**What's unclear:**
- Were these experimental and never finished?
- Should they be preserved for future use or deleted?

**Recommendation:**
- Migrate to kata-review-pull-requests/references/ for completeness (prevents "missing file" errors if anyone tries to use them)
- Add note in migration commit: "Unused agents migrated for completeness - no active callers"
- Phase 4 (Cleanup) deletes agents/ directory anyway

### 3. How to handle agent model profiles in migration?

**What we know:**
- Agent frontmatter has `model:` field (opus, sonnet, haiku, inherit)
- Skills have model lookup tables based on config.json model_profile
- POC removed agent frontmatter entirely

**What's unclear:**
- Should model selection move to skill lookup table or instruction file metadata?

**Recommendation:**
- Keep model selection in skill SKILL.md (lookup table based on model_profile)
- Don't preserve agent frontmatter model field in instruction files
- Skills already have this pattern (see kata-plan-phase model table)

## Sources

### Primary (HIGH confidence)
- POC Phase 1 artifacts: .planning/phases/completed/01-proof-of-concept/
- POC-validated patterns: skills/kata-plan-phase/references/planner-instructions.md, skills/kata-execute-phase/references/executor-instructions.md
- Current codebase: agents/ (19 files), skills/ (7 parent skills), scripts/build.js
- Requirements: .planning/REQUIREMENTS.md (CONV-01 through CONV-05)

### Secondary (MEDIUM confidence)
- Claude Code subagent documentation: /Users/gannonhall/.claude/rules/sub-agents.md (general-purpose, Explore, Plan types)
- Build system behavior: scripts/build.js lines 37, 152, 180 (agents/ copied to plugin)
- Test infrastructure: package.json (npm test uses node:test), tests/build.test.js

### Tertiary (LOW confidence)
- None - all findings verified with codebase

## Metadata

**Confidence breakdown:**
- Agent-to-skill mapping: HIGH - verified with grep, all 19 agents mapped
- Migration pattern: HIGH - POC established byte-for-byte equivalence
- Shared agent handling: MEDIUM - multiple resolution strategies possible
- Test suite integration: MEDIUM - flow insertion point clear, detection logic needs validation
- Unused agents: HIGH - 0 grep matches confirms no references

**Research date:** 2026-02-05
**Valid until:** 2026-03-07 (30 days - stable codebase, experimental branch)
