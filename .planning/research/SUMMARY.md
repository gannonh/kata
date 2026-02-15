# Research Summary: Codebase Intelligence Lifecycle

**Milestone:** v1.12.0 Codebase Intelligence
**Research Completed:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

Kata's codebase intelligence system exists in a broken state: agents reference `.planning/intel/summary.md` that is never generated, creating silent failures where planners and executors proceed without codebase context. The gap is not a missing feature — it's unfinished wiring of an already-designed system.

The MVP is surgical: extend `kata-map-codebase` to generate `summary.md` from existing codebase docs, then inject that summary into planner and executor prompts. No new skills, no new dependencies, no hooks. This closes the loop between capture (which works) and consumption (which expects files that don't exist).

The critical constraint: context budget. Subagents have 200k tokens but quality degrades past 50% (~100k). Intelligence must compress to 2-5% of context (~4k-10k tokens) alongside plans, state, and instructions that already occupy 30-40%.

## Key Findings

### Stack: Zero-Dependency Extraction

**Recommendation:** Regex-based extraction via Node.js scripts (no imports), git-native change detection, statistical heuristics over JSON.

**Why this works for Kata:**
- Node 20+ is already a hard requirement (no new dependencies)
- Regex covers 90%+ of JS/TS patterns (export/import/function extraction)
- Git already tracks changes (no mtime, no file watchers, no daemon)
- Convention detection is counting (5+ samples, 70%+ match rate)
- Doc freshness is git blame (compare doc modified date vs referenced code)

**Acceptable limitations:** Edge cases (dynamic imports, computed exports, multi-language codebases) can be handled via Claude-powered extraction as a fallback. Intelligence is advisory, not compilation.

**Rejected approaches:**
- **tree-sitter / ast-grep:** Compiled binaries, violates zero-dependency constraint
- **File watchers:** No long-running process in CLI tool architecture
- **Vector embeddings:** Requires external infrastructure (Cursor's Turbopuffer, Augment's hosted engine)
- **Knowledge graphs:** Over-engineering (Kata's previous attempt failed for exactly this reason)

### Architecture: Three-Layer Pipeline

**Capture → Store → Consume**

1. **Capture:** `/kata-map-codebase` runs mapper agents (existing, unchanged) → 7 docs in `.planning/codebase/` → NEW: `generate-intel.js` script transforms docs into `.planning/intel/` artifacts
2. **Store:** `.planning/intel/summary.md` (agent-readable compressed version), `index.json` (file registry), `conventions.json` (detected patterns)
3. **Consume:** Orchestrators read `summary.md` (if exists) → inline into subagent prompts → planners and executors apply conventions automatically

**Context budget analysis:**
- Current planner: 2 keyword-selected codebase docs = ~8-12k tokens
- Proposed planner: `summary.md` only = ~2-3k tokens
- **Result:** Planners get better context (all dimensions vs cherry-picked) while using LESS budget

**Critical decision:** No hooks for MVP. Hooks add fragility (see MEMORY.md: find-phase.sh, gh issue list, intel-index failures). Start with explicit capture via skill invocation. Add incremental hooks after the pipeline proves stable.

### Features: MVP vs Differentiators

**MVP (wire the existing design):**
1. Generate `summary.md` from `.planning/codebase/` docs (closes the gap agents already expect)
2. Inject summary into planner prompts (improves planning accuracy)
3. Inject summary into executor prompts (ensures code matches conventions)

**Post-MVP differentiators:**
- Incremental intel updates (PostToolUse hooks populate index.json on writes)
- Convention enforcement (validate writes against detected patterns)
- Doc gardening (trigger partial re-analysis when documented areas change)
- Staleness detection (flag when intel is >30 days old or >50 commits behind)

**Anti-features (deliberately NOT building):**
- Vector embedding / semantic search (no server, no infrastructure)
- Real-time file watching (no daemon process)
- AST parsing (native dependencies, multi-language complexity)
- Cross-repository intelligence (single-repo scope)
- Custom query language (Claude uses Grep/Glob naturally)

### Pitfalls: What Kills This Feature

**Critical (causes failure):**
1. **Over-engineering storage layer** — Previous Kata attempt had graph DB, WASM sqlite, entity generator. None shipped. Mitigation: bash + markdown + JSON only.
2. **Context poisoning from excessive loading** — Loading too much knowledge degrades agent performance ("lost in the middle" phenomenon). Mitigation: 2k token hard cap per agent.
3. **Building capture without consumption** — Kata's previous intel system generated nothing because consumer integration was never completed. Mitigation: wire consumption FIRST (hand-write summary.md, test planner improvement, THEN automate generation).
4. **Documentation rot without enforcement** — Knowledge captures a snapshot that becomes stale. OpenAI Harness Engineering identified this explicitly. Mitigation: freshness timestamps, staleness detection, eventual doc gardening agent.

**Moderate (causes delays):**
- Language-specific convention detection (start language-agnostic: directories, file naming)
- Indexing at wrong granularity (file-level, not symbol-level; directory summaries, not full listings)
- Incremental update races (batch at phase boundaries, not during parallel execution)
- Knowledge architecture that doesn't match agent spawning (per-role knowledge contracts)

**Kata-specific risks:**
- **Repeating previous failure:** Over-engineering killed the last attempt. Every design must pass "bash + markdown + JSON" test.
- **Context budget violation:** No existing mechanism to measure/limit injection size. Must cap at 2k tokens.
- **Orphaned knowledge:** Entity generator was documented but nothing spawned it. `2>/dev/null` suppression hid failures. Wire consumption first, delete silent failure patterns.

## Roadmap Implications

### Phase 1: Wire Consumption (Foundation)

**Goal:** Close the gap. Agents get the summary they already try to load.

**Build:**
1. `generate-intel.js` script reads `.planning/codebase/*.md` → writes `.planning/intel/summary.md`
2. Modify `kata-map-codebase/SKILL.md` to run script after mapper agents complete
3. Modify `kata-plan-phase/SKILL.md` to read and inline `summary.md` into planner prompt
4. Update `planner-instructions.md` to replace keyword-based doc loading with summary consumption

**Rationale:** Planner is highest-leverage consumer. Plans shape all downstream execution.

**Validation:** Hand-write a summary for existing Kata codebase, run planner with/without it, measure improvement in file assignments and convention adherence.

### Phase 2: Executor Integration + Index Generation

**Goal:** Executors follow conventions. Index enables future file-level queries.

**Build:**
1. Modify `kata-execute-phase/SKILL.md` to inject `summary.md` into executor prompts
2. Add `apply_codebase_intelligence` step to executor instructions
3. Extend `generate-intel.js` to produce `index.json` (file registry) and `conventions.json` (detected patterns)
4. Update `kata-resume-work` to include intel in session context

**Rationale:** Executor integration is second highest-leverage. Index/conventions JSON provide structured foundation for future features.

### Phase 3: Cleanup and Documentation

**Goal:** Remove dead code, align documentation with implementation.

**Build:**
1. Remove orphaned `entity-generator-instructions.md`
2. Update KATA-STYLE.md Codebase Intelligence section to reflect actual architecture
3. Remove dead intel references from remaining files
4. Add intel generation to test suite (validate summary format, token budget)

### Phase 4+: Incremental Intelligence (Future)

**Defer to separate milestone:**
- PostToolUse hook for incremental index updates
- Convention enforcement warnings
- Doc gardening triggers
- Multi-agent knowledge sharing through intel layer

## Confidence Levels

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Over-engineering risk | HIGH | Kata's own failed attempt provides direct evidence |
| Context poisoning risk | HIGH | Anthropic and OpenAI both document this pattern |
| Capture/consumption gap | HIGH | Orphaned entity generator, silent file load failures |
| Zero-dependency stack | HIGH | Verified against Kata constraints, tool availability |
| Three-layer architecture | HIGH | Patterns verified against codebase, OpenAI Harness Engineering cross-referenced |
| Context budget analysis | HIGH | Measured current planner/executor token usage |
| Language-specific detection risk | MEDIUM | Based on previous design analysis, not field testing |
| Incremental update races | MEDIUM | Known problem in file-based systems, unverified in Kata's specific architecture |

## Gaps and Open Questions

1. **Greenfield capture timing:** When does a greenfield project have "enough code" to analyze? Current hypothesis: after Phase 1 completes (framework + entry points exist).
2. **Brownfield file count ceiling:** At what point does full indexing become overwhelming? Proposed: 500 files triggers directory-level summaries instead.
3. **Summary compression effectiveness:** Can 80-150 lines capture actionable knowledge for diverse project types? Requires testing across JS/TS, Python, Go projects.
4. **Convention confidence thresholds:** 5+ samples, 70%+ match rate (from KATA-STYLE.md) — are these validated or arbitrary? Need empirical tuning.
5. **Multi-language fallback:** When regex extraction fails (Python, Go, Rust), does Claude-powered extraction scale? Need performance testing.

## Critical Path Dependencies

```
Phase 1: Wire Consumption
├── generate-intel.js script
├── kata-map-codebase modification (add script invocation)
├── kata-plan-phase modification (inject summary)
└── planner-instructions.md update (consume summary)
    |
    Validation Gate: Hand-test with Kata's own codebase
    Does planner improve with summary? Measure file assignment accuracy.
    |
Phase 2: Executor + Index
├── Depends on: Phase 1 (summary generation exists)
├── kata-execute-phase modification (inject summary)
├── executor-instructions.md update (apply conventions)
└── Extend generate-intel.js (produce index.json, conventions.json)
    |
Phase 3: Cleanup
├── Depends on: Phase 2 (system proven stable)
├── Remove dead code
└── Update documentation
```

## Comparison with Existing Approaches

### vs Static Context Files (CLAUDE.md, AGENTS.md, .cursorrules)

**Static files:** Human-authored, manually maintained, stale within weeks.
**Kata intel:** Agent-generated from actual code, structured templates, explicit freshness tracking.

**Key difference:** Static files tell agents about the codebase. Kata intel feeds agents codebase knowledge as part of task context, selectively and automatically.

### vs Dynamic Indexing (Cursor, Augment, Windsurf)

**IDE tools:** Cloud-hosted, real-time, vector embeddings, require accounts/infrastructure.
**Kata:** Local, file-based, zero external dependencies, batch at phase boundaries.

**Kata's niche:** Terminal-native, structured local intelligence optimized for Claude's context window.

## Recommendations for Roadmap Creation

1. **Start with validation, not implementation.** Hand-write `summary.md` for Kata's own codebase. Test planner with/without it. If no measurable improvement, halt the milestone.
2. **Phase 1 is the entire MVP.** If consumption doesn't improve planning, nothing else matters. Get this right before building incremental updates or doc gardening.
3. **Set a complexity ceiling.** Every design decision must pass "bash + markdown + JSON" test. No dependencies, no databases, no servers.
4. **Context budget is a hard constraint.** Cap summary at 150 lines (~3k tokens). If you can't fit actionable knowledge in that budget, the feature doesn't work.
5. **Delete silent failure patterns.** Remove `2>/dev/null` from knowledge loading. If intel is supposed to exist and doesn't, fail loudly.
6. **Defer hooks to post-MVP.** Hooks add fragility. Prove the pipeline with explicit capture first.

## Sources

### Primary Research
- OpenAI Harness Engineering (doc gardening, mechanical enforcement, "one big AGENTS.md" failure)
- AGENTS.md Specification (hierarchical discovery, progressive disclosure)
- Anthropic Context Engineering (minimal effective context, context rot phenomenon)
- Builder.io AGENTS.md Tips (keep documentation small, progressive disclosure)

### Tool Architecture
- Cursor Indexing (AST chunking, Turbopuffer, Merkle tree sync)
- Augment Context Engine (semantic indexing, real-time sync, cross-repo intelligence)
- Windsurf Cascade (event-driven re-indexing, memories persistence)
- Cline Memory Bank (structured markdown persistence)

### Kata Internal
- `.planning/deltas/CRITICAL-intel-system-gaps.md` (documents the broken state)
- `KATA-STYLE.md` Codebase Intelligence section (defines schemas that were never implemented)
- `skills/kata-map-codebase/SKILL.md` (current capture pipeline)
- `skills/kata-plan-phase/references/planner-instructions.md` (keyword-based doc loading)
- `MEMORY.md` (bug history: hook failures, silent errors)

---

**Bottom Line:** The feature exists in design. The gap is wiring. Build consumption first, automate capture second, add incremental updates third. Context budget is king. Simplicity over completeness.
