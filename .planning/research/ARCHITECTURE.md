# Architecture: Codebase Intelligence Integration

**Project:** Kata Codebase Intelligence
**Researched:** 2026-02-15
**Confidence:** HIGH (patterns verified against codebase, OpenAI Harness Engineering patterns cross-referenced)

## Executive Summary

Codebase intelligence integrates into Kata through three layers: **capture** (extend `kata-map-codebase` to produce machine-readable artifacts alongside human-readable docs), **storage** (`.planning/intel/` directory with JSON index, conventions, and a generated summary), and **consumption** (inject summary into planner and executor subagent prompts via orchestrator-level context assembly). No hooks required for MVP. No new skills needed. The system extends existing patterns without introducing new architectural concepts.

The core constraint: subagent context windows are 200k tokens, and quality degrades past 50%. Intelligence must be compressed to fit within ~2-5% of context (~4k-10k tokens) alongside the plan, state, and instructions that already occupy ~30-40%.

## Current State: Two Knowledge Systems, Neither Complete

### `.planning/codebase/` (Exists, Partially Used)

Produced by `kata-map-codebase`. Seven human-readable documents: STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md.

**How they are consumed today:**

The planner (`skills/kata-plan-phase/references/planner-instructions.md`, line 1130-1149) has a `load_codebase_context` step that selects 2 documents based on phase keywords:

```
| Phase Keywords           | Load These                      |
| UI, frontend, components | CONVENTIONS.md, STRUCTURE.md    |
| API, backend, endpoints  | ARCHITECTURE.md, CONVENTIONS.md |
| database, schema, models | ARCHITECTURE.md, STACK.md       |
```

The mapper instructions (`skills/kata-map-codebase/references/codebase-mapper-instructions.md`, lines 16-24) document this downstream consumption.

**Problem:** These documents are verbose (100-300 lines each), consuming significant context when loaded. The keyword-based selection is brittle. The executor has no `load_codebase_context` step at all; it references codebase docs only indirectly via plan content.

### `.planning/intel/` (Documented in KATA-STYLE.md, Never Implemented)

KATA-STYLE.md (lines 516-570) documents an intel system with `index.json`, `conventions.json`, and `summary.md`. The entity-generator agent (`skills/kata-review-pull-requests/references/entity-generator-instructions.md`) writes to `.planning/intel/entities/`. The `CRITICAL-intel-system-gaps.md` delta documents the mismatch: agents reference `.planning/intel/summary.md` but the generation pipeline does not exist.

**Current references to `.planning/intel/` in the codebase:**
- KATA-STYLE.md: Documents schema and hook-based generation (never implemented)
- entity-generator-instructions.md: Writes entities to `.planning/intel/entities/` (orphaned)
- No skill or script produces `summary.md`
- No SessionStart or PostToolUse hook generates intel artifacts

## Recommended Architecture

### Design Principles

1. **One system, not two.** Unify `.planning/codebase/` and `.planning/intel/` into a single coherent knowledge pipeline. The codebase mapper captures knowledge; the intel directory stores machine-readable derivatives.

2. **Summary is the interface.** Subagents consume a single file: `.planning/intel/summary.md`. This summary is generated from the codebase documents, not from raw code. The codebase docs remain the human-readable source of truth; the summary is the agent-readable projection.

3. **Capture is explicit, consumption is automatic.** Users run `/kata-map-codebase` to capture. Planners and executors load the summary automatically when it exists.

4. **Context budget is king.** The summary must stay under 150 lines (~3k tokens). This leaves room within the 50% quality threshold for plan content, state, and instructions.

5. **No hooks for MVP.** Hooks add complexity and are fragile (see MEMORY.md bug history). Start with explicit capture via skill invocation. Add incremental hooks after the pipeline proves stable.

### System Architecture

```
Capture                    Store                     Consume
-------                    -----                     -------

/kata-map-codebase         .planning/                kata-plan-phase
  |                          |                         |
  +-> mapper agents          +-> codebase/             +-> orchestrator reads
  |   (existing)             |   STACK.md              |   intel/summary.md
  |   write 7 docs           |   ARCHITECTURE.md       |   inlines into
  |                          |   CONVENTIONS.md         |   planner prompt
  +-> intel-generator        |   TESTING.md            |
      (new step)             |   STRUCTURE.md         kata-execute-phase
      reads codebase/        |   INTEGRATIONS.md        |
      writes intel/          |   CONCERNS.md            +-> orchestrator reads
                             |                          |   intel/summary.md
                             +-> intel/                 |   inlines into
                                 index.json             |   executor prompt
                                 conventions.json       |
                                 summary.md          kata-resume-work
                                                        |
                                                        +-> reads summary.md
                                                            for session context
```

### Component Breakdown

#### New Components

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| intel-generator script | Node.js script | `skills/kata-map-codebase/scripts/generate-intel.js` | Reads `.planning/codebase/*.md`, produces `.planning/intel/` artifacts |
| summary.md template | Reference | `skills/kata-map-codebase/references/summary-template.md` | Structure for generated summary |

#### Modified Components

| Component | Change | Impact |
|-----------|--------|--------|
| `skills/kata-map-codebase/SKILL.md` | Add step 5: run intel-generator after mapper agents complete | Low: appends one step to existing process |
| `skills/kata-plan-phase/SKILL.md` | Step 7: add `intel/summary.md` to context files read for planner prompt | Low: one additional Read call |
| `skills/kata-plan-phase/references/planner-instructions.md` | Replace `load_codebase_context` step with `load_intel_summary` step | Medium: simplifies existing logic |
| `skills/kata-execute-phase/SKILL.md` | `<wave_execution>`: add `intel/summary.md` to files read for executor prompt | Low: one additional Read call |
| `skills/kata-execute-phase/references/executor-instructions.md` | Add `load_codebase_intelligence` step (read summary, apply conventions) | Low: 10-15 lines added |
| `skills/kata-resume-work/references/resume-project.md` | Add intel summary to session context loading | Low: one conditional read |
| `KATA-STYLE.md` | Update Codebase Intelligence section to reflect implemented architecture | Low: documentation only |

#### Removed Components

| Component | Reason |
|-----------|--------|
| `skills/kata-review-pull-requests/references/entity-generator-instructions.md` | Orphaned. No skill spawns this agent. Entity/graph model replaced by summary model. |
| KATA-STYLE.md intel hook references | SessionStart and PostToolUse hook descriptions for intel that were never implemented. Replace with actual architecture. |

### Data Flow: Capture

```
User runs /kata-map-codebase
  |
  Step 1-4: Existing mapper agents write .planning/codebase/ (unchanged)
  |
  Step 5 (NEW): Orchestrator runs intel-generator
  |
  +-> generate-intel.js
      |
      Reads:
        .planning/codebase/STACK.md
        .planning/codebase/ARCHITECTURE.md
        .planning/codebase/CONVENTIONS.md
        .planning/codebase/TESTING.md
        .planning/codebase/STRUCTURE.md
        .planning/codebase/INTEGRATIONS.md
        .planning/codebase/CONCERNS.md
      |
      Produces:
        .planning/intel/index.json       (file registry with exports/imports)
        .planning/intel/conventions.json  (detected patterns: naming, dirs, suffixes)
        .planning/intel/summary.md        (compressed agent-readable summary)
```

The intel-generator is a Node.js script, not a subagent. Rationale: the codebase docs are already written. Transforming structured markdown into JSON and a compressed summary is a deterministic operation. Using a subagent would waste context and introduce variability.

### Data Flow: Consumption by Planner

```
/kata-plan-phase orchestrator (SKILL.md step 7)
  |
  Reads .planning/intel/summary.md (if exists)
  Stores as intel_summary_content
  |
  Step 8: Inlines into planner Task() prompt:
  |
  <codebase_intelligence>
  {intel_summary_content}
  </codebase_intelligence>
```

The planner's `load_codebase_context` step (currently keyword-matching to select 2 full docs) is replaced by loading the single summary. This reduces context consumption from ~400-600 lines (2 full docs) to ~150 lines (summary).

### Data Flow: Consumption by Executor

```
/kata-execute-phase orchestrator (<wave_execution>)
  |
  Reads .planning/intel/summary.md (if exists)
  Stores as intel_summary_content
  |
  Inlines into each executor Task() prompt:
  |
  <codebase_intelligence>
  {intel_summary_content}
  </codebase_intelligence>
```

The executor's instructions gain a `load_codebase_intelligence` step that tells the agent to apply conventions from the injected summary when writing code.

## Artifact Schemas

### index.json

```json
{
  "version": 1,
  "generated": "2026-02-15T10:30:00Z",
  "source": "kata-map-codebase",
  "files": {
    "src/lib/db.ts": {
      "exports": ["query", "transaction", "pool"],
      "imports": ["pg", "./config"],
      "type": "service",
      "layer": "data"
    }
  },
  "stats": {
    "total_files": 42,
    "by_type": { "component": 12, "service": 8, "util": 6 },
    "by_layer": { "ui": 15, "api": 10, "data": 8 }
  }
}
```

Generated by parsing STRUCTURE.md and ARCHITECTURE.md. Primarily consumed by the intel-generator itself to produce the summary. Future use: file lookup during planning (e.g., "which files export auth functions?").

### conventions.json

```json
{
  "version": 1,
  "generated": "2026-02-15T10:30:00Z",
  "naming": {
    "files": "kebab-case",
    "functions": "camelCase",
    "components": "PascalCase",
    "constants": "SCREAMING_SNAKE"
  },
  "directories": {
    "components": "src/components/",
    "services": "src/services/",
    "utils": "src/lib/",
    "tests": "co-located (*.test.ts)"
  },
  "patterns": {
    "imports": "path aliases (@/)",
    "error_handling": "try/catch with custom AppError",
    "testing": "vitest with co-located test files",
    "state": "zustand stores in src/stores/"
  },
  "confidence": "high"
}
```

Generated by parsing CONVENTIONS.md and TESTING.md. Consumed by the intel-generator to produce the summary. Future use: validation in executor (e.g., warn if new file uses wrong naming convention).

### summary.md

```markdown
# Codebase Intelligence Summary

Generated: 2026-02-15 | Source: .planning/codebase/

## Stack

TypeScript 5.3 | Next.js 14 (App Router) | Prisma + PostgreSQL | Tailwind + shadcn/ui

## Architecture

Layered: UI (src/app/, src/components/) -> API (src/app/api/) -> Services (src/services/) -> Data (prisma/)

Entry points: `src/app/layout.tsx` (root), `src/app/api/*/route.ts` (API)

## Conventions

Files: kebab-case | Functions: camelCase | Components: PascalCase
Imports: `@/` alias for `src/` | Tests: co-located `*.test.ts` | Errors: custom `AppError` class
New components: `src/components/{feature}/` | New API: `src/app/api/{resource}/route.ts`

## Key Patterns

- Auth: JWT via jose, httpOnly cookies, middleware check in `src/middleware.ts`
- DB: Prisma client singleton in `src/lib/prisma.ts`, transactions via `prisma.$transaction`
- Validation: zod schemas in `src/lib/validators/`
- State: zustand stores in `src/stores/`, no Redux

## Concerns

- No rate limiting on public API routes
- Missing error boundary in `src/app/layout.tsx`
- 3 TODO comments in `src/services/billing.ts`
```

Target: 30-80 lines. Max: 150 lines. Each section extracts the most actionable information from the corresponding codebase document. The format prioritizes density: agents need to know how to write code that fits the codebase, not understand every architectural decision.

## Context Window Budget Analysis

### Current Budget (without intel)

| Content | Tokens (approx) | % of 200k |
|---------|-----------------|-----------|
| Executor instructions | ~8k | 4% |
| Plan content | ~4-8k | 2-4% |
| STATE.md | ~2k | 1% |
| Workflow config | ~0.5k | 0.25% |
| Working directory block | ~0.2k | 0.1% |
| **Subtotal (prompt)** | **~15-19k** | **~8-10%** |
| Task execution overhead | ~60-80k | 30-40% |
| **Total per plan** | **~75-99k** | **~38-50%** |

### With Intel Summary

| Content | Tokens (approx) | % of 200k |
|---------|-----------------|-----------|
| All current content | ~15-19k | ~8-10% |
| **intel/summary.md** | **~2-3k** | **~1-1.5%** |
| **Total (prompt)** | **~17-22k** | **~9-11%** |

Adding the summary costs ~1-1.5% of context. This stays well within the quality threshold. The planner actually saves context by replacing 2 full codebase docs (~8-12k) with the summary (~2-3k).

### Planner Comparison

| Approach | Context cost | Quality |
|----------|-------------|---------|
| Current: 2 keyword-selected docs | ~8-12k tokens | Medium (brittle selection, verbose) |
| Proposed: summary.md | ~2-3k tokens | Higher (dense, all dimensions covered) |

## Integration Points

### 1. kata-map-codebase (Capture)

**Current process (unchanged):**
1. Spawn 4 parallel mapper agents
2. Each writes 1-2 docs to `.planning/codebase/`
3. Verify docs exist
4. Commit

**New step 5 (after step 4, before commit):**
```bash
node "./scripts/generate-intel.js"
```

The script reads `.planning/codebase/*.md`, extracts structured data, writes `.planning/intel/`. Runs in <5 seconds. No subagent needed.

**Modified commit (step 6):** Include `.planning/intel/` in the commit alongside `.planning/codebase/`.

### 2. kata-plan-phase (Consume in Planner)

**SKILL.md step 7 (Read Context Files):** Add to the list of files read:
```
- `.planning/intel/summary.md` (if exists) -- store as intel_summary_content
```

**SKILL.md step 8 (Spawn kata-planner):** Add to the planning_context:
```xml
<codebase_intelligence>
{intel_summary_content}
</codebase_intelligence>
```

**planner-instructions.md:** Replace `load_codebase_context` step (lines 1130-1149) with:

```xml
<step name="load_codebase_intelligence">
If <codebase_intelligence> section exists in your prompt context, apply it:

- Use naming conventions when specifying file paths in plans
- Use directory conventions when determining where new files go
- Reference existing patterns in task <action> elements
- Consider listed concerns when planning (avoid introducing more debt)
- Match testing patterns in verification commands

If no <codebase_intelligence>: skip (no error). Plans are still valid without it.
</step>
```

This replaces the current keyword-based document selection with a simpler, more reliable pattern.

### 3. kata-execute-phase (Consume in Executor)

**SKILL.md `<wave_execution>`:** Add to files read before spawning:
```
- `.planning/intel/summary.md` (if exists) -- store as intel_summary_content
```

Add to each Task() prompt:
```
{INTEL_BLOCK}
```

Where:
```bash
INTEL_BLOCK=""
if [ -f ".planning/intel/summary.md" ]; then
  INTEL_BLOCK="<codebase_intelligence>\n${intel_summary_content}\n</codebase_intelligence>"
fi
```

**executor-instructions.md:** Add step after `load_plan`:

```xml
<step name="apply_codebase_intelligence">
If <codebase_intelligence> section exists in your prompt:

- Follow naming conventions for new files and functions
- Place new files in the correct directories per project structure
- Match existing import patterns (aliases, ordering)
- Follow error handling patterns
- Match testing patterns when writing tests
- Avoid introducing issues listed in Concerns

This is guidance, not override. Plan instructions take precedence.
</step>
```

### 4. kata-resume-work (Session Context)

Add to `load_state` step:
```bash
cat .planning/intel/summary.md 2>/dev/null
```

Include in the status presentation so users see what codebase knowledge is available.

### 5. Config Integration

No new config flags for MVP. The system operates on file existence: if `.planning/intel/summary.md` exists, agents use it. If it does not exist, agents proceed without it (graceful degradation via `2>/dev/null` pattern already used throughout Kata).

Future config (post-MVP):
```json
{
  "intel": {
    "auto_refresh": false,
    "summary_max_lines": 150
  }
}
```

## Directory Structure

```
.planning/
  intel/                      # Machine-readable codebase intelligence
    index.json                # File registry (exports, imports, types)
    conventions.json          # Detected patterns (naming, dirs, testing)
    summary.md                # Agent-readable summary (the interface)
  codebase/                   # Human-readable codebase documents (existing)
    STACK.md
    ARCHITECTURE.md
    CONVENTIONS.md
    TESTING.md
    STRUCTURE.md
    INTEGRATIONS.md
    CONCERNS.md
```

## Build Order

### Phase 1: Generate and Consume Summary (Foundation)

**Goal:** End-to-end pipeline from capture to consumption.

**Build:**
1. `generate-intel.js` script that reads `.planning/codebase/*.md` and produces `.planning/intel/summary.md`
2. Modify `kata-map-codebase/SKILL.md` to run the script after mapper agents complete
3. Modify `kata-plan-phase/SKILL.md` to read and inline `summary.md` into planner prompt
4. Update `planner-instructions.md` to replace keyword-based doc loading with summary consumption

**Rationale:** This delivers the core value: planners produce better plans because they know the codebase conventions. The planner is the highest-leverage consumer because it shapes all downstream execution.

**Dependencies:** None. Uses existing `.planning/codebase/` output.

### Phase 2: Executor Integration and Index Generation

**Goal:** Executors follow codebase conventions. Index enables future file-level queries.

**Build:**
1. Modify `kata-execute-phase/SKILL.md` to read and inline `summary.md` into executor prompts
2. Add `apply_codebase_intelligence` step to `executor-instructions.md`
3. Extend `generate-intel.js` to produce `index.json` and `conventions.json`
4. Update `kata-resume-work` to include intel summary in session context

**Rationale:** Executor integration is the second highest-leverage point. The index and conventions JSON are produced by the same script and provide the structured foundation for future features (file lookup, convention validation).

**Dependencies:** Phase 1 (summary generation must exist).

### Phase 3: Cleanup and Documentation

**Goal:** Remove dead code, update documentation.

**Build:**
1. Remove orphaned entity-generator-instructions.md
2. Update KATA-STYLE.md Codebase Intelligence section to reflect actual architecture
3. Remove dead intel references from any remaining files
4. Add intel generation to test suite (validate summary format)

**Rationale:** Cleanup after the system is proven. Ensures documentation matches implementation.

**Dependencies:** Phase 2.

## OpenAI Harness Engineering Alignment

The recommended architecture aligns with patterns described in OpenAI's Harness Engineering approach:

| Harness Pattern | Kata Equivalent |
|-----------------|-----------------|
| Short AGENTS.md (~100 lines) as table of contents | `summary.md` (~80-150 lines) as agent-readable index |
| Structured `docs/` as system of record | `.planning/codebase/` as human-readable source of truth |
| Generated documentation from code | `generate-intel.js` produces JSON + summary from codebase docs |
| Progressive disclosure (start small, point to deeper) | Summary points to codebase docs; agents load summary only |
| Mechanical enforcement via linters/CI | Future: convention validation in executor (post-MVP) |
| Doc gardening agent for stale docs | `/kata-map-codebase` re-run refreshes both codebase/ and intel/ |

The key divergence: OpenAI uses a persistent `docs/` directory maintained by engineers and agents together. Kata generates the summary from structured documents produced by mapper agents. This is more automated but requires re-running the mapper when the codebase evolves significantly.

## Risks

### Risk 1: Summary Staleness

**Likelihood:** HIGH (codebase changes, summary does not auto-update)
**Impact:** MEDIUM (agents use stale conventions, produce slightly inconsistent code)
**Mitigation:** Include generation timestamp in summary header. Skill orchestrators can warn if summary is >30 days old. Future: PostToolUse hook for incremental updates.

### Risk 2: Summary Too Generic

**Likelihood:** MEDIUM (compression loses actionable detail)
**Impact:** MEDIUM (agents ignore summary because it adds no value)
**Mitigation:** Test with real projects. Iterate on summary template. Include concrete file paths and code patterns, not abstract descriptions. The summary-template.md reference file codifies the expected level of specificity.

### Risk 3: Context Budget Overflow on Large Projects

**Likelihood:** LOW (summary capped at 150 lines by design)
**Impact:** LOW (agents degrade gracefully without intel)
**Mitigation:** Hard cap in generate-intel.js. For very large projects, the script prioritizes the most-modified and most-imported files.

## References

- [Harness Engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) -- OpenAI's patterns for structured documentation in agentic workflows
- `.planning/deltas/CRITICAL-intel-system-gaps.md` -- Documents the current broken state of intel references
- `skills/kata-map-codebase/SKILL.md` -- Current capture pipeline
- `skills/kata-plan-phase/references/planner-instructions.md` -- Current codebase context loading (lines 1130-1149)
- `skills/kata-execute-phase/references/executor-instructions.md` -- Current executor flow (no intel step)
- `KATA-STYLE.md` (lines 516-570) -- Documented but unimplemented intel schema
