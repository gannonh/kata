# Phase 54 Research: Knowledge Architecture & Consumption

**Phase:** 54 - Knowledge Architecture & Consumption
**Researched:** 2026-02-15
**Confidence:** HIGH (verified against actual codebase, milestone research)

## Executive Summary

Phase 54 creates the consumption layer for codebase intelligence. The capture layer (kata-map-codebase) already exists and produces 7 documents in `.planning/codebase/`. The storage layer (`.planning/intel/`) is documented in KATA-STYLE.md but unimplemented. The consumption layer has broken references — agents try to load `.planning/intel/summary.md` but it never exists.

Phase 54 bridges the gap: generate `summary.md` from existing codebase docs, inject into planner and executor prompts. No new skills, no hooks for MVP.

**Critical finding:** The current planner uses keyword-based document loading (lines 1130-1149 of planner-instructions.md) that loads 2 full codebase docs (~400-600 lines, ~8-12k tokens). The proposed approach loads a single summary (~80-150 lines, ~2-3k tokens). This is BOTH more context-efficient AND more comprehensive (all dimensions vs cherry-picked).

## Phase Boundary Clarification

**Phase 54 (this phase):**
- Create `.planning/intel/` directory structure
- Generate `summary.md` from `.planning/codebase/*.md` docs
- Inject summary into planner prompts (kata-plan-phase skill)
- Inject summary into executor prompts (kata-execute-phase skill)
- Update planner-instructions.md to consume summary instead of keyword-based doc loading
- Add executor-instructions.md step to apply codebase intelligence

**Phase 55 (next phase - Capture & Indexing):**
- Extend kata-map-codebase to run the intel-generator script
- Generate index.json and conventions.json alongside summary.md
- Wire verifier integration (kata-verify-work)
- Add intel to kata-resume-work session context

**Rationale for split:** Phase 54 proves the consumption layer works (planners get better output with summary). Phase 55 automates generation and adds structured data (index/conventions). If consumption doesn't improve planning, Phase 55 is pointless.

**Critical question:** Should generate-intel.js live in Phase 54 or Phase 55?

**Answer:** Phase 54. The script is the bridge between capture (codebase docs) and consumption (summary injection). Phase 54 creates end-to-end flow: codebase docs → generate-intel.js → summary.md → planner uses it. Phase 55 extends the script (add index.json, conventions.json) and adds more consumers (executor, verifier).

## Current State: Broken References

### Files That Reference `.planning/intel/summary.md`

**Verified locations:**

1. **planner-instructions.md** (line 1130): `load_codebase_context` step keyword-matches phase description to select 2 codebase docs. No intel reference yet, but milestone research shows this is the replacement target.

2. **executor-instructions.md** (lines 1-100 scanned): NO `load_codebase_intelligence` step exists. Executors currently get NO codebase context at all. They rely on what's embedded in the plan.

3. **entity-generator-instructions.md** (100 lines): Orphaned agent. Writes to `.planning/intel/entities/`. Documents say PostToolUse hook syncs entities to graph.db. Nothing spawns this agent. CRITICAL-intel-system-gaps.md confirms it's dead code.

### Current Planner Keyword Loading

**File:** `skills/kata-plan-phase/references/planner-instructions.md`
**Lines:** 1130-1149

```
<step name="load_codebase_context">
Check for codebase map:

```bash
find .planning/codebase -maxdepth 1 -name "*.md" 2>/dev/null
```

If exists, load relevant documents based on phase type:

| Phase Keywords            | Load These                      |
| ------------------------- | ------------------------------- |
| UI, frontend, components  | CONVENTIONS.md, STRUCTURE.md    |
| API, backend, endpoints   | ARCHITECTURE.md, CONVENTIONS.md |
| database, schema, models  | ARCHITECTURE.md, STACK.md       |
| testing, tests            | TESTING.md, CONVENTIONS.md      |
| integration, external API | INTEGRATIONS.md, STACK.md       |
| refactor, cleanup         | CONCERNS.md, ARCHITECTURE.md    |
| setup, config             | STACK.md, STRUCTURE.md          |
| (default)                 | STACK.md, ARCHITECTURE.md       |
</step>
```

**Analysis:** This is brittle. Keyword matching fails if phase description doesn't include expected terms. Loading 2 full docs consumes ~8-12k tokens. The table itself is valuable metadata but the implementation is inefficient.

**Replacement target:** Single `load_codebase_intelligence` step that reads `.planning/intel/summary.md` (if exists). Summary already compresses all 7 docs into ~2-3k tokens.

## Implementation Details

### 1. Generate-Intel Script Location

**Where:** `skills/kata-map-codebase/scripts/generate-intel.js`

**Why here:**
- kata-map-codebase already produces `.planning/codebase/` docs
- Script is the natural next step after mapper agents complete
- No scripts directory exists in kata-map-codebase yet (verified: no .sh or .js files)

**Pattern reference:** Other skills with scripts:
- `kata-configure-settings/scripts/` — 6 bash scripts + 1 project-root.sh sourced helper
- `kata-doctor/scripts/` — 3 validation scripts
- Pattern: scripts live in `skills/{skill}/scripts/`, never in top-level `scripts/`

**Script design:**
- Node.js script (Node 20+ is hard requirement, no new dependencies)
- Reads `.planning/codebase/*.md` (7 files, ~1400 lines total)
- Extracts key sections from each doc
- Compresses into `.planning/intel/summary.md` (target: 80-150 lines)
- NO subagent spawn — this is deterministic data transformation
- Exit code 0 on success, non-zero on failure (skill checks exit code)

### 2. Summary Schema

**File:** `.planning/intel/summary.md`
**Length:** 80-150 lines (~2-3k tokens)
**Structure:**

```markdown
# Codebase Intelligence Summary

Generated: YYYY-MM-DD | Source: .planning/codebase/

## Stack

[One-liner: language + framework + database + UI]

## Architecture

[Layers, entry points, data flow — extracted from ARCHITECTURE.md]

## Conventions

[Naming patterns, import rules, directory placement — extracted from CONVENTIONS.md]

## Key Patterns

[Error handling, state management, testing approach — extracted from TESTING.md + CONVENTIONS.md]

## Concerns

[Outstanding issues, tech debt — extracted from CONCERNS.md]
```

**Design principles:**
1. **Density over completeness** — Agents need actionable rules, not explanations
2. **Concrete over abstract** — "Use `@/` alias for src/" not "Follow import conventions"
3. **Prescriptive patterns** — "New components: src/components/{feature}/" not "Components are organized by feature"

**Token budget constraint:** 150 lines at ~20 tokens/line = ~3k tokens. Must stay under this cap.

### 3. Planner Integration

**File:** `skills/kata-plan-phase/SKILL.md`
**Step to modify:** Step 7 (Read Context Files)

**Current step 7 (approximate, based on command pattern):**
```bash
# Read project state, roadmap, requirements, phase goal
cat .planning/STATE.md
cat .planning/ROADMAP.md
# etc.
```

**Add to step 7:**
```bash
# Read codebase intelligence summary (if exists)
if [ -f ".planning/intel/summary.md" ]; then
  intel_summary_content=$(cat .planning/intel/summary.md)
else
  intel_summary_content=""
fi
```

**Step 8 modification (Spawn kata-planner):**

Add to the planner Task() prompt:

```xml
<codebase_intelligence>
${intel_summary_content}
</codebase_intelligence>
```

Only include this block if `intel_summary_content` is non-empty. Use bash conditional:

```bash
INTEL_BLOCK=""
if [ -f ".planning/intel/summary.md" ]; then
  INTEL_BLOCK="<codebase_intelligence>\n${intel_summary_content}\n</codebase_intelligence>"
fi
```

**File:** `skills/kata-plan-phase/references/planner-instructions.md`
**Lines to replace:** 1130-1149 (`load_codebase_context` step)

**New step:**

```xml
<step name="load_codebase_intelligence">
If <codebase_intelligence> section exists in your prompt context, apply it:

- Use naming conventions when specifying file paths in plans
- Use directory conventions when determining where new files go
- Reference existing patterns in task <action> elements
- Consider listed concerns when planning (avoid introducing more debt)
- Match testing patterns in verification commands

The summary compresses all codebase documents. You get architecture, stack, conventions, and concerns in one place.

If no <codebase_intelligence> section: skip (no error). Plans are still valid without codebase context.
</step>
```

**Rationale:** Replaces keyword-based loading (8-12k tokens) with single summary consumption (2-3k tokens). Saves context while improving coverage.

### 4. Executor Integration

**File:** `skills/kata-execute-phase/SKILL.md`
**Section to modify:** `<wave_execution>` — the section that spawns executor agents

**Current pattern (approximate):**
```bash
# Read plan content
plan_content=$(cat "$PLAN_PATH")

# Spawn executor
Task(
  name="kata-executor",
  context="""
  ${plan_content}
  ...
  """
)
```

**Add before spawning:**
```bash
# Read codebase intelligence summary (if exists)
intel_summary_content=""
if [ -f ".planning/intel/summary.md" ]; then
  intel_summary_content=$(cat .planning/intel/summary.md)
fi
```

**Add to executor Task() prompt:**
```
{INTEL_BLOCK}
```

Where `INTEL_BLOCK` is conditionally constructed:
```bash
INTEL_BLOCK=""
if [ -f ".planning/intel/summary.md" ]; then
  INTEL_BLOCK="<codebase_intelligence>\n${intel_summary_content}\n</codebase_intelligence>"
fi
```

**File:** `skills/kata-execute-phase/references/executor-instructions.md`
**Line to insert after:** Line 86 (after `load_plan` step, before execution steps)

**New step:**

```xml
<step name="apply_codebase_intelligence">
If <codebase_intelligence> section exists in your prompt:

- Follow naming conventions for new files and functions
- Place new files in the correct directories per project structure
- Match existing import patterns (aliases, ordering)
- Follow error handling patterns
- Match testing patterns when writing tests
- Avoid introducing issues listed in Concerns

This is guidance, not override. Plan instructions take precedence if there's conflict.
</step>
```

**Rationale:** Executors currently get NO codebase context. They rely on plan details. Adding the summary ensures they write code that fits the existing codebase.

### 5. Kata-Map-Codebase Integration (Deferred to Phase 55)

**Why deferred:** Phase 54 proves consumption works. Generate-intel.js can be run manually during Phase 54 development. Phase 55 automates it by wiring the script into kata-map-codebase SKILL.md.

**Phase 55 integration preview (for context):**

**File:** `skills/kata-map-codebase/SKILL.md`
**After:** Step 4 (mapper agents complete)
**Before:** Step 5 (commit)

**New step 5:**
```xml
<step name="generate_intel">
Generate machine-readable intelligence from codebase docs:

```bash
node "./scripts/generate-intel.js"
```

This reads `.planning/codebase/*.md` and produces `.planning/intel/` artifacts (summary.md, index.json, conventions.json).

Check exit code:
- 0 → Success
- Non-zero → Report error, show generate-intel.js output

If generation fails, codebase mapping is still valid. Intel is optional enhancement.
</step>
```

**Modified step 6 (commit):** Include both `.planning/codebase/` and `.planning/intel/` in commit.

## Existing Codebase Structure

### Current Codebase Docs

**Directory:** `.planning/codebase/`
**Files:** 7 documents, 1399 lines total

| File | Lines | Purpose |
|------|-------|---------|
| ARCHITECTURE.md | 176 | System layers, entry points, data flow |
| CONCERNS.md | 142 | Tech debt, TODOs, outstanding issues |
| CONVENTIONS.md | 334 | Naming patterns, file structure, code style |
| INTEGRATIONS.md | 129 | External dependencies, API patterns |
| STACK.md | 91 | Languages, frameworks, dependencies |
| STRUCTURE.md | 221 | Directory layout, file organization |
| TESTING.md | 306 | Test patterns, coverage, commands |

**Content quality:** Kata's own codebase docs are comprehensive and well-structured. They serve as excellent source material for summary generation.

**Example from STACK.md:**
- Zero runtime dependencies (Node.js built-ins only)
- Node.js >= 16.7.0 required
- Published to npm as `kata-cli`
- Claude Code CLI is target platform

**Example from CONVENTIONS.md:**
- Files: kebab-case
- Commands: `kata:verb-noun`
- XML tags: kebab-case
- Bash variables: CAPS_UNDERSCORES

**Key insight:** The codebase docs already contain the exact information agents need. The problem is volume (1399 lines) and format (human prose). Generate-intel.js compresses and restructures for agent consumption.

## Script Patterns

### Project Root Detection

**All skill scripts source this pattern:**

```bash
#!/usr/bin/env bash
# Source project-root.sh at the top

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"
```

**File:** `skills/kata-configure-settings/scripts/project-root.sh` (25 lines)

**Detection priority:**
1. `KATA_PROJECT_ROOT` env var
2. CWD contains `.planning/`
3. CWD/workspace contains `.planning/` (bare repo worktree)
4. CWD/main contains `.planning/` (bare repo legacy)
5. Error with instructions

**Why this matters:** Generate-intel.js must find `.planning/` directory reliably across standard repos and worktree setups.

### Node.js Script Pattern

**Reference:** `skills/kata-configure-settings/scripts/read-config.sh`

**Pattern:**
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/project-root.sh"

# Use env vars to pass data to Node
KEY="$KEY" FALLBACK="$FALLBACK" node << 'NODE_EOF'
const fs = require('fs');
const KEY = process.env.KEY;
// ... Node code here
NODE_EOF
```

**Key principles:**
1. Bash handles path resolution and CWD
2. Node handles JSON/file parsing
3. Heredoc keeps Node code inline (no separate .js file)
4. Exit codes propagate (pipefail + Node process.exit)

**Generate-intel.js will follow different pattern:** Standalone Node script (not heredoc) because:
- More complex logic (200-300 lines estimated)
- Needs to be testable independently
- May need to parse multiple files
- Heredoc is for short scripts (<50 lines)

## Build System Integration

**File:** `scripts/build.js` (464 lines)

**Relevant findings:**

1. **Scripts are included in plugin distribution** (line 57 comment: "skills/*/scripts/ to be copied for skill helper scripts")

2. **Path transformation for plugin target:**
   - Source uses `@~/.claude/kata/` for canonical paths
   - Build.js transforms to `@./kata/` for plugin-relative paths
   - This is automatic — no action needed in Phase 54

3. **No special registration for scripts** — they're just files copied to `dist/plugin/skills/{skill}/scripts/`

**Action for Phase 54:** Create `skills/kata-map-codebase/scripts/generate-intel.js`. Build system will automatically include it in plugin distribution.

## Validation Approach

**How to validate Phase 54 completion:**

1. **Hand-write test summary.md** for Kata's own codebase (compress existing codebase docs)
2. **Place in `.planning/intel/summary.md`**
3. **Run kata-plan-phase** on a test phase
4. **Inspect planner's output:**
   - Does it reference conventions from summary?
   - Does it place files in correct directories per summary structure?
   - Does it avoid concerns listed in summary?
5. **Run kata-execute-phase** on a test plan
6. **Inspect executor's code:**
   - Does it match naming conventions?
   - Does it follow import patterns?
   - Does it use project's error handling style?

**Success criteria:** Measurable improvement in file assignments and convention adherence. If no improvement, the feature doesn't work and Phase 55 should be cancelled.

## Risks and Mitigations

### Risk 1: Summary Too Generic

**Likelihood:** MEDIUM
**Impact:** HIGH (agents ignore summary because it adds no value)

**Mitigation:**
- Test with hand-written summary first
- Include concrete file paths and code snippets, not abstractions
- Kata's own codebase docs are already concrete (good source material)
- Summary template in references/ codifies expected specificity

### Risk 2: Context Budget Overflow

**Likelihood:** LOW
**Impact:** MEDIUM (agents degrade past 50% context usage)

**Current budget analysis:**
- Executor instructions: ~8k tokens (4%)
- Plan content: ~4-8k tokens (2-4%)
- STATE.md: ~2k tokens (1%)
- Intel summary: ~2-3k tokens (1-1.5%)
- **Total prompt: ~17-22k tokens (9-11%)**
- **With execution overhead: ~77-102k tokens (39-51%)**

Still within quality threshold. Planners actually SAVE context (replace 8-12k keyword-loaded docs with 2-3k summary).

**Mitigation:** Hard cap summary at 150 lines in generate-intel.js.

### Risk 3: Stale Summary

**Likelihood:** HIGH (codebase changes, summary doesn't auto-update)
**Impact:** MEDIUM (agents use outdated conventions)

**Mitigation for MVP:** Include generation timestamp in summary header. Manual re-run of kata-map-codebase refreshes both codebase/ and intel/.

**Future (Phase 55+):** Staleness detection via git log comparison, PostToolUse hooks for incremental updates.

### Risk 4: Generate-Intel.js Fails Silently

**Likelihood:** LOW (deterministic Node script, simple I/O)
**Impact:** HIGH (broken intel generation with no user feedback)

**Mitigation:**
- Script exits with non-zero code on failure
- Kata-map-codebase (Phase 55) checks exit code and reports errors
- For Phase 54 manual testing: run script directly, inspect stderr

## Entity-Generator Cleanup

**File to remove:** `skills/kata-review-pull-requests/references/entity-generator-instructions.md`

**Verified findings:**
- grep shows 11 files reference "entity-generator"
- Most are research docs or completed phase artifacts
- CRITICAL-intel-system-gaps.md confirms: "completely orphaned — nothing spawns it"
- No command or skill spawns this agent
- Creates entities in `.planning/intel/entities/` that nothing consumes

**Action for Phase 54:** Document removal in plan, but defer actual deletion to Phase 55 cleanup. Focus Phase 54 on building consumption layer.

## Dependencies and Prerequisites

**What Phase 54 needs:**

1. **Existing artifacts (already present):**
   - `.planning/codebase/*.md` (7 docs from kata-map-codebase)
   - planner-instructions.md with load_codebase_context step (line 1130)
   - executor-instructions.md (file exists, needs new step added)

2. **New artifacts to create:**
   - `skills/kata-map-codebase/scripts/generate-intel.js`
   - `skills/kata-map-codebase/references/summary-template.md` (reference for generate-intel.js)
   - Modifications to planner-instructions.md (replace step 1130-1149)
   - Modifications to executor-instructions.md (add step after line 86)

3. **No external dependencies:**
   - Node.js built-ins only (fs, path)
   - No npm packages
   - No new skills
   - No hooks for MVP

**What Phase 54 does NOT need:**

- Hooks (SessionStart, PostToolUse) — deferred to post-MVP
- index.json or conventions.json — deferred to Phase 55
- Kata-map-codebase modifications — deferred to Phase 55
- Verifier integration — deferred to Phase 55

## Open Questions

**Q1: Should summary.md template live in kata/templates/ or skills/kata-map-codebase/references/?**

**Answer:** `skills/kata-map-codebase/references/summary-template.md`. Rationale: generate-intel.js needs it, and it's specific to the mapping/intel generation process. Templates in kata/templates/ are user-facing outputs (PLAN.md, ROADMAP.md). This is internal.

**Q2: How does generate-intel.js handle missing codebase docs?**

**Answer:** Graceful degradation. If STACK.md missing, skip Stack section. If all docs missing, exit with error code 1 (nothing to generate from). Phase 55 integration will check exit code.

**Q3: Should planner-instructions.md preserve the keyword table as documentation?**

**Answer:** No. The table is implementation detail that's being replaced. If the mapping is valuable, capture it in the summary-template.md reference (guide generate-intel.js to extract relevant sections based on phase patterns). But the planner itself just consumes the summary.

## Success Metrics

**Phase 54 is complete when:**

1. `.planning/intel/summary.md` exists and follows schema (80-150 lines)
2. Planner agents receive `<codebase_intelligence>` section in their prompt
3. Executor agents receive `<codebase_intelligence>` section in their prompt
4. Planner-instructions.md has `load_codebase_intelligence` step (replaced keyword loading)
5. Executor-instructions.md has `apply_codebase_intelligence` step (new)
6. Manual test shows planner output improves with summary vs without

**What "improve" means:**
- More accurate file path assignments (uses project directory structure)
- Convention adherence (matches naming patterns, import styles)
- Concern awareness (doesn't add more debt in flagged areas)

## Confidence Levels

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Planner keyword loading location | HIGH | Verified at planner-instructions.md:1130 |
| Executor has no intel step | HIGH | Read executor-instructions.md:1-100, no match |
| Entity-generator is orphaned | HIGH | Verified via grep, confirmed in CRITICAL-intel-system-gaps.md |
| Context budget analysis | HIGH | Measured current token usage, calculated summary cost |
| Codebase docs structure | HIGH | Read actual files, counted lines, analyzed content |
| Script patterns | HIGH | Read project-root.sh, read-config.sh for reference |
| Build system behavior | MEDIUM | Read build.js, inferred script handling |
| Summary compression feasibility | MEDIUM | Based on milestone research, not validated with real compression |

## References

**Milestone-level research:**
- `.planning/research/SUMMARY.md` — Complete pipeline analysis
- `.planning/research/ARCHITECTURE.md` — Component breakdown, data flow
- `.planning/research/FEATURES.md` — Feature landscape, differentiators

**Codebase artifacts:**
- `.planning/codebase/*.md` — 7 source documents (1399 lines total)
- `skills/kata-plan-phase/references/planner-instructions.md` — Current keyword loading (line 1130)
- `skills/kata-execute-phase/references/executor-instructions.md` — Current flow (no intel step)
- `.planning/deltas/CRITICAL-intel-system-gaps.md` — Documents broken state

**Script patterns:**
- `skills/kata-configure-settings/scripts/project-root.sh` — Path detection pattern
- `skills/kata-configure-settings/scripts/read-config.sh` — Node heredoc pattern
- `scripts/build.js` — Distribution build system

**Style guide:**
- `KATA-STYLE.md` — Documented but unimplemented intel schema (lines 516-570)
- `CLAUDE.md` — Overall project conventions

---

**Bottom Line:** Phase 54 wires consumption into existing skills. Generate-intel.js bridges codebase docs to agent-readable summary. Planner and executor get `<codebase_intelligence>` sections. No hooks, no new skills, no external dependencies. Phase proves the concept; Phase 55 automates and extends.
