# Domain Pitfalls: Codebase Intelligence for AI Agents

**Domain:** Building codebase knowledge capture, convention detection, and doc gardening for AI coding agents
**Researched:** 2026-02-15
**Confidence:** HIGH (cross-verified against OpenAI Harness Engineering, Anthropic context engineering docs, Kata's own failed attempt, and industry implementations)

## Executive Summary

Codebase intelligence systems for AI agents fail in predictable ways. The dominant failure mode is over-engineering: building graph databases, entity extraction pipelines, and WASM runtimes when flat files solve the problem. Kata's previous attempt documented this exact failure. The second failure mode is context poisoning: loading so much knowledge that agent performance degrades rather than improves. The third is documentation rot: building a system that captures knowledge once but never updates it.

This research covers 13 pitfalls organized by severity, each with detection signals, prevention strategies, and phase assignment.

---

## Critical Pitfalls

Mistakes that cause the feature to fail outright or require a rewrite.

### Pitfall 1: Over-Engineering the Storage Layer

**What goes wrong:** Teams build graph databases, vector stores, or custom query engines for codebase knowledge. The system becomes too complex to maintain, too slow to run incrementally, and too coupled to specific tooling.

**Why it happens:** Codebase relationships (imports, exports, call graphs) naturally suggest graph structures. Engineers default to "the right data structure" rather than "the simplest thing that works." Knowledge graph literature reinforces this: graph search finds structural reality while vector search finds conceptual relevance.

**Kata's previous attempt did exactly this.** KATA-STYLE.md documented an intel system with:
- `index.json` for file exports/imports
- `conventions.json` for pattern detection
- `summary.md` for agent injection
- PostToolUse hooks for incremental updates
- A graph DB and WASM sqlite dependency
- An entity generator agent

None of it was implemented. The design was too complex for Kata's file-based architecture.

**Consequences:**
- Feature never ships (Kata's actual outcome)
- Maintenance burden exceeds value
- Dependency on external tools (WASM, sqlite) breaks portability
- Integration complexity blocks adoption

**Prevention:**
1. Start with markdown files in `.planning/intel/`. No database, no query engine.
2. Use JSON only for machine-readable indexes that scripts consume directly.
3. Limit the storage layer to what `cat`, `grep`, and `jq` can query.
4. Set a complexity budget: if you can't explain the data flow in 3 sentences, simplify.
5. Validate the design against Kata's constraint: bash scripts + markdown + JSON only.

**Detection (warning signs):**
- Design mentions "graph," "vector," "embedding," or "query engine"
- Implementation requires dependencies not already in Kata
- A script needs more than 50 lines to read/write the knowledge store
- Storage format requires a custom parser

**Which phase should address:** Phase 1 (architecture). Decide the storage format before writing any code.

---

### Pitfall 2: Context Poisoning from Excessive Knowledge Loading

**What goes wrong:** The system loads too much codebase knowledge into agent context windows. Agent performance degrades rather than improves. This is the "one big AGENTS.md" problem that OpenAI's Harness Engineering paper identified.

**Why it happens:** Intuition says "more context = better results." Research shows the opposite. Context rot degrades LLM performance as context fills up, even well within the technical token limit. The effective context window where models maintain high-quality reasoning is often below 256k tokens, far less than the advertised limit. Anthropic's own guidance: context engineering is about finding the minimal effective context for the next step.

**Consequences:**
- Agents produce lower-quality plans and code (the "lost in the middle" phenomenon)
- Response latency increases
- API costs increase without proportional quality gain
- Users can't diagnose why agent output degraded

**Prevention:**
1. Budget knowledge injection. Set a hard cap (e.g., 2k tokens) for codebase intelligence injected per agent spawn.
2. Make injection selective. Planner gets conventions + architecture. Executor gets file-level details for the files it will touch. Verifier gets acceptance criteria only.
3. Use progressive disclosure: `summary.md` (always loaded) points to detail files (loaded on demand).
4. Measure before and after. Compare agent output quality with and without knowledge injection on the same tasks.
5. Follow the Harness Engineering lesson: give agents a map, not an encyclopedia.

**Detection (warning signs):**
- `summary.md` exceeds 100 lines or 2k tokens
- Agent spawning code inlines multiple knowledge files
- Agent asks clarifying questions it didn't ask before knowledge injection
- Plan quality doesn't improve (or worsens) after adding codebase intelligence

**Which phase should address:** Phase 1 (architecture) for the injection budget, Phase 2+ for measuring and tuning.

---

### Pitfall 3: Building Capture Without Consumption

**What goes wrong:** The system captures codebase knowledge (indexes files, detects conventions) but no agent workflow actually uses it. The knowledge sits in `.planning/intel/` with no consumer.

**Kata's previous attempt did exactly this.** The entity generator agent was documented but orphaned. Nothing spawned it. The planner and executor had `load_codebase_intelligence` steps, but the files they tried to load were never generated. The `2>/dev/null` suppression made this failure invisible.

**Why it happens:** Capture is a tractable engineering problem (scan files, extract data, write JSON). Consumption requires modifying existing agent workflows, which is riskier and harder to test. Teams build capture first, defer consumption, and never close the loop.

**Consequences:**
- Feature appears complete but delivers zero value
- Users run indexing commands but see no improvement in agent behavior
- Maintenance cost without corresponding benefit
- Silent failures when agents try to load nonexistent knowledge

**Prevention:**
1. Build consumption first. Modify one agent (the planner) to read a hand-written `summary.md`. Verify it improves plan quality. Then automate the generation.
2. Every capture feature must have a named consumer. "The planner reads conventions from X. The executor reads file details from Y."
3. Delete the `2>/dev/null` pattern. If knowledge is supposed to exist and doesn't, fail loudly.
4. Add a smoke test: after indexing, verify the planner's output references detected conventions.

**Detection (warning signs):**
- Knowledge files exist but no SKILL.md references them
- Agent workflows have `(if exists)` guards around knowledge loading
- No test verifies that agents actually use captured knowledge
- Removing the knowledge files changes nothing about agent behavior

**Which phase should address:** Phase 1. Wire consumption before building capture automation.

---

### Pitfall 4: Documentation Rot Without Enforcement

**What goes wrong:** Codebase knowledge captures a snapshot that becomes stale as code changes. No mechanism detects or fixes drift. Over time, stale knowledge actively poisons agent context.

**Why it happens:** Documentation systems lack feedback loops. Code changes through commits; documentation changes through manual effort. Without mechanical enforcement (linters, CI checks, freshness timestamps), documentation decays at the rate of code change.

**The Harness Engineering paper identified this explicitly.** Their solution: a doc-gardening agent that scans for stale docs and opens fix-up PRs, combined with mechanical enforcement through custom linters and structural tests.

**Consequences:**
- Agents plan against outdated architecture descriptions
- Convention enforcement references patterns that no longer exist
- Users lose trust in the system and stop maintaining knowledge files
- Stale knowledge is worse than no knowledge (actively misleads)

**Prevention:**
1. Add freshness timestamps to every knowledge file. `updated: 2026-02-15` in frontmatter.
2. Track what triggered the last update (commit hash, file change, manual edit).
3. Flag files older than N commits or N days as potentially stale.
4. Build a staleness check into `/kata-track-progress` so users see warnings.
5. Design the doc gardening agent as a later phase, but build the freshness metadata now.

**Detection (warning signs):**
- Knowledge files have no timestamp or version metadata
- No process triggers knowledge updates when code changes
- Knowledge references file paths or function names that don't exist
- Users manually edit knowledge files without tooling support

**Which phase should address:** Phase 1 for freshness metadata. Phase 3+ for automated gardening.

---

## Moderate Pitfalls

Mistakes that cause delays, rework, or degraded value.

### Pitfall 5: Language-Specific Convention Detection

**What goes wrong:** Convention detection logic is written for JavaScript/TypeScript (camelCase exports, `.test.ts` suffixes, `import`/`export` parsing). The system breaks or produces garbage for Python, Go, Rust, or polyglot codebases.

**Why it happens:** Kata's documented convention detection required 5+ exports with 70%+ match rate for naming conventions, and parsed JS/TS import/export statements. This approach is structurally tied to a single language ecosystem.

**Consequences:**
- System produces incorrect conventions for non-JS codebases
- Users in Python/Go/Rust ecosystems get zero value
- False conventions poison agent plans ("use camelCase" in a snake_case Python project)

**Prevention:**
1. Start with language-agnostic conventions: directory structure, file naming patterns, test file locations.
2. Use file extension distribution as the primary language signal.
3. Defer language-specific analysis (import parsing, naming convention detection) to later phases.
4. If detecting naming conventions, use the filesystem (filenames, directory names) rather than parsing source code.
5. Test against at least 3 language ecosystems before shipping.

**Detection (warning signs):**
- Convention detection code contains `import`, `export`, `require`, or AST parsing
- Tests only cover JavaScript/TypeScript projects
- Convention output includes language-specific terminology (e.g., "hooks directory" for a Go project)

**Which phase should address:** Phase 1 (architecture decision). Define what conventions are language-agnostic.

---

### Pitfall 6: Indexing at the Wrong Granularity

**What goes wrong:** The index tracks individual functions/exports (too fine) or entire directories (too coarse). Fine-grained indexes blow up in size and become expensive to maintain. Coarse indexes don't provide enough signal for agents to make good decisions.

**Why it happens:** The right granularity depends on how agents use the data. Without knowing the consumer, engineers default to "index everything" (the previous Kata design tracked per-file exports and imports) or "index nothing" (just directory listings).

**Consequences:**
- Fine-grained: `index.json` grows to thousands of entries, exceeds context budget, requires pruning logic
- Coarse: Agents can't distinguish between a utils directory with 3 files and one with 300
- Both: Maintenance cost doesn't match value delivered

**Prevention:**
1. Index at the file level, not the symbol level. File path + purpose + key dependencies.
2. Use directory-level summaries for architecture understanding.
3. Target the planner as primary consumer. What does a planner need to know to assign files to tasks? That determines granularity.
4. Set a size budget: the full index should fit in the context budget (2k tokens for injection).

**Detection (warning signs):**
- Index tracks function signatures, variable names, or line numbers
- Index file exceeds 500 lines
- Agents receive index data but don't reference it in their output
- Index update time exceeds 5 seconds for a single file change

**Which phase should address:** Phase 1 (architecture). Define index schema before implementation.

---

### Pitfall 7: Incremental Update Races and Stale Cache

**What goes wrong:** The incremental indexing system processes file changes, but race conditions between concurrent agent runs cause partial updates, stale reads, or corrupted JSON.

**Why it happens:** Kata agents run in parallel (wave-based execution). If two agents edit files simultaneously and both trigger index updates, the JSON file gets corrupted or one update overwrites the other. File-based systems lack atomic transactions.

**Consequences:**
- Corrupted `index.json` breaks all subsequent reads
- Lost updates mean index drifts from reality
- Debugging is hard because corruption is intermittent

**Prevention:**
1. Use append-only writes during execution. Each agent writes its own update file (e.g., `index-update-{timestamp}.json`).
2. Merge updates in a single-threaded consolidation step after execution completes.
3. Or: skip real-time incremental updates entirely. Run full reindex between phases (Kata phases are the natural batch boundary).
4. If using file locking, use `flock` in bash scripts for atomic writes.
5. Keep the index format simple enough that a corrupted file can be regenerated from scratch in seconds.

**Detection (warning signs):**
- JSON parse errors in knowledge files after parallel execution
- Index shows files that were deleted or files missing that exist
- Different agents in the same wave see different index states
- Tests pass in isolation but fail when run in parallel

**Which phase should address:** Phase 2 (execution integration). Address after single-agent indexing works.

---

### Pitfall 8: Knowledge Architecture That Doesn't Match Agent Spawning

**What goes wrong:** Knowledge is organized for human reading (by topic, by module) rather than for agent consumption (by role, by task). Agents must search through irrelevant knowledge to find what they need.

**Why it happens:** Engineers organize knowledge the way they think about codebases: "here's the authentication module, here's the database layer." Agents need knowledge organized by their role: "here's what a planner needs, here's what an executor needs for this specific task."

**Kata's architecture makes this concrete.** Skills spawn subagents with fresh 200k context windows. Each subagent gets a tailored prompt. Knowledge must be pre-sliced per agent role, not dumped as a monolith.

**Consequences:**
- Agents receive knowledge meant for other roles (executor gets architecture docs meant for planner)
- Context budget wasted on irrelevant knowledge
- Agent output quality doesn't improve despite knowledge availability

**Prevention:**
1. Organize knowledge outputs by consumer role:
   - `summary.md` (all agents, architecture overview)
   - `conventions.md` (planner + executor, coding patterns)
   - `file-index.md` or `file-index.json` (planner, file purposes for task assignment)
2. Skills control which knowledge files get inlined into each subagent prompt.
3. Never load the full knowledge base into any single agent.
4. Test each agent role independently: does this agent's output improve with its assigned knowledge?

**Detection (warning signs):**
- All agents receive the same knowledge payload
- Knowledge files contain sections like "For planners:" and "For executors:" (mixed audience)
- No skill references specific knowledge files (they all reference `summary.md`)

**Which phase should address:** Phase 1 (architecture). Define per-role knowledge contracts.

---

### Pitfall 9: Brownfield Mapping That Overwhelms

**What goes wrong:** Running codebase mapping on a large existing project produces so much output that it exceeds context limits, takes too long to process, or generates noise that drowns signal.

**Why it happens:** Brownfield projects have hundreds or thousands of files. A naive scan that indexes everything produces an index too large to consume. The previous `/kata-map-codebase` command scanned all JS/TS files. For a 10k-file monorepo, this generates an unmanageable index.

**Consequences:**
- Mapping takes minutes instead of seconds
- Output exceeds context budget by 10x
- Users wait, see a wall of text, and don't trust the results
- System indexes test fixtures, build artifacts, and vendored code

**Prevention:**
1. Respect `.gitignore` and add Kata-specific exclusions (node_modules, dist, build, .git, vendor, coverage, fixtures).
2. Set a file count ceiling. If > 500 files match, switch to directory-level summaries.
3. Produce tiered output: architecture summary (always), file index (on demand), detailed analysis (per-directory, on demand).
4. Show progress during mapping. A 30-second silent scan feels broken.
5. Make mapping interruptible. Partial results are better than no results after a timeout.

**Detection (warning signs):**
- Mapping produces more than 200 lines of output
- Index file exceeds 50KB
- Mapping takes more than 30 seconds
- Output includes files from node_modules, dist, or vendor directories

**Which phase should address:** Phase 2 (brownfield support). After greenfield capture works.

---

## Minor Pitfalls

Mistakes that cause friction or technical debt but don't block the feature.

### Pitfall 10: Conflicting Knowledge Sources

**What goes wrong:** Codebase intelligence says one thing, CLAUDE.md says another, and project-specific overrides say a third thing. Agents can't determine which source to trust.

**Why it happens:** Kata already has multiple knowledge sources: CLAUDE.md (project instructions), config.json (settings), templates (output formats), and now `.planning/intel/` (codebase knowledge). Without a clear precedence hierarchy, agents encounter contradictions.

**Prevention:**
1. Define an explicit precedence: CLAUDE.md > `.planning/intel/` > defaults.
2. Knowledge files should describe what IS (detected patterns), not what SHOULD BE (prescriptions). Prescriptions belong in CLAUDE.md.
3. If a detected convention conflicts with a CLAUDE.md instruction, the knowledge file should note the conflict rather than overriding.
4. Document the precedence hierarchy in the knowledge architecture reference.

**Which phase should address:** Phase 1 (architecture documentation).

---

### Pitfall 11: Manual-Only Knowledge Capture for Greenfield

**What goes wrong:** Greenfield projects start with no codebase to analyze. The system has nothing to index. Users must manually write all knowledge files, which defeats the purpose of automated intelligence.

**Why it happens:** Codebase intelligence systems are designed for existing code. Greenfield projects have no code, no conventions, and no architecture to detect. The gap between "project created" and "enough code to analyze" can be many phases.

**Prevention:**
1. For greenfield, capture knowledge progressively during execution. After each phase completes, update the knowledge base with what was built.
2. Use PLAN.md and SUMMARY.md as knowledge sources. They already describe what was built and why.
3. Seed knowledge from project setup decisions (language, framework, directory structure) captured during `/kata-new-project`.
4. Make the first meaningful knowledge capture happen automatically after Phase 1, not as a separate manual step.

**Which phase should address:** Phase 2 (greenfield capture workflow).

---

### Pitfall 12: Testing Knowledge Quality

**What goes wrong:** No objective way to measure whether codebase knowledge improves agent output. Teams ship knowledge features based on intuition, not evidence.

**Why it happens:** Agent output quality is subjective. A plan "looks better" with codebase knowledge, but there's no before/after metric. Without measurement, the feature becomes unfalsifiable, and you can't tell whether improvements or regressions come from knowledge or other changes.

**Prevention:**
1. Before building the full system, run a manual test: hand-write a `summary.md` for an existing project, run the planner with and without it, compare results.
2. Define concrete quality signals: Does the planner assign correct files to tasks? Does the executor find the right code to modify? Does the verifier check the right acceptance criteria?
3. Add a regression test: given a known codebase and known task, verify the planner's file assignments match expected files.

**Which phase should address:** Phase 1 (validation). Test the value proposition before building automation.

---

### Pitfall 13: Ignoring Kata's Existing Knowledge Channels

**What goes wrong:** The new knowledge system duplicates information already captured in STATE.md, PROJECT.md, ROADMAP.md, or SUMMARY.md files. Users maintain the same information in two places. The systems drift.

**Why it happens:** Engineers building the new system don't audit existing knowledge flows. Kata already captures project decisions (PROJECT.md), current state (STATE.md), and phase outcomes (SUMMARY.md). A new "codebase knowledge" system that also tracks decisions and outcomes creates duplication.

**Prevention:**
1. Audit existing knowledge files before designing new ones. What does each agent already receive?
2. The new system should cover what's NOT in existing files: detected code conventions, file purposes, architecture patterns, dependency relationships.
3. If existing files already serve a consumer need, extend them rather than creating a parallel system.
4. Create a knowledge map: which agent gets which files, and what gap does each new file fill.

**Which phase should address:** Phase 1 (architecture). Audit existing flows before designing new ones.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
| --- | --- | --- |
| Architecture / storage design | Over-engineering (1), Granularity (6) | Markdown + JSON only, file-level index, 2k token budget |
| Architecture / injection design | Context poisoning (2), Agent mismatch (8) | Per-role knowledge contracts, hard token cap |
| Consumption wiring | Capture without consumption (3) | Build consumption first, test with hand-written knowledge |
| Greenfield capture | Manual-only capture (11), Existing channels (13) | Progressive capture from SUMMARY.md, audit existing files |
| Brownfield mapping | Overwhelming output (9), Language-specific (5) | File count ceiling, language-agnostic conventions |
| Incremental updates | Race conditions (7), Staleness (4) | Phase-boundary batch updates, freshness timestamps |
| Doc gardening | Rot without enforcement (4) | Freshness metadata now, automated gardening later |
| Quality validation | No measurement (12) | Manual before/after test in Phase 1 |

---

## Kata-Specific Risk Factors

### HIGH: Repeating the Previous Failure (Over-Engineering)

- **History:** KATA-STYLE.md documented graph DB, WASM, entity generation, PostToolUse hooks. None shipped.
- **Root cause:** Design scope exceeded the file-based architecture constraint.
- **Mitigation:** Every design decision must pass the "bash + markdown + JSON" test. If it needs a new dependency, it's too complex.

### HIGH: Context Budget Violation

- **History:** Kata agents already operate near context limits. Adding knowledge injection without a budget will degrade quality.
- **Root cause:** No existing mechanism to measure or limit knowledge injection size.
- **Mitigation:** Hard cap at 2k tokens per agent. Measure before shipping.

### MEDIUM: Orphaned Knowledge (Capture Without Consumer)

- **History:** Entity generator agent was documented but nothing spawned it. Planner/executor `load_codebase_intelligence` steps loaded nonexistent files silently.
- **Root cause:** `2>/dev/null` suppression hid the failure. No test verified the integration.
- **Mitigation:** Wire consumption first. Delete `2>/dev/null` suppression. Add smoke tests.

### MEDIUM: Incremental Update Fragility

- **History:** Kata's wave-based parallel execution creates write contention.
- **Root cause:** File-based JSON has no atomic transactions.
- **Mitigation:** Batch updates at phase boundaries, not during parallel execution.

### LOW: Multi-Language Support Gap

- **History:** Previous design parsed JS/TS imports/exports. Kata claims to work across arbitrary codebases.
- **Root cause:** Convention detection logic was language-specific.
- **Mitigation:** Start with language-agnostic conventions (directories, file naming).

---

## Lessons from Related Systems

### OpenAI Harness Engineering

- "One big AGENTS.md" failed. Context is scarce. Too much guidance becomes non-guidance.
- Solution: treat knowledge as a map (table of contents), not an encyclopedia.
- Mechanical enforcement (linters, CI) keeps knowledge fresh. Text instructions rot.
- Doc gardening agent scans for stale docs and opens fix-up PRs.
- "Golden principles" encoded in repo prevent drift.

### Context Engineering Research

- Context rot degrades performance even within technical limits. Effective window is below 256k tokens.
- "Lost in the middle" phenomenon: information in the center of context is overlooked.
- Minimal effective context outperforms maximum context.
- Dynamic retrieval (just-in-time) beats static loading (dump everything).

### Industry Codebase Tools

- Incremental indexing requires O(changes) complexity, not O(repository).
- File watcher systems fail on directory renames (ghost syncs on stale paths).
- Agents spend ~40% of time figuring out which documentation to trust when sources conflict.
- Single source of truth, ruthlessly consolidated, outperforms distributed documentation.

---

## Research Confidence

| Area | Confidence | Notes |
| --- | --- | --- |
| Over-engineering risk | HIGH | Kata's own failed attempt provides direct evidence |
| Context poisoning | HIGH | Anthropic and OpenAI both document this pattern |
| Capture/consumption gap | HIGH | Kata's orphaned entity generator is direct evidence |
| Documentation rot | HIGH | OpenAI Harness Engineering paper, industry consensus |
| Language-specific detection | MEDIUM | Based on previous Kata design analysis, not field testing |
| Incremental update races | MEDIUM | Known problem in file-based systems, unverified in Kata's specific architecture |
| Brownfield scaling | MEDIUM | Extrapolated from industry reports, not tested at Kata scale |

---

## Sources

- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) (doc gardening, golden principles, mechanical enforcement)
- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (minimal effective context)
- [Context Engineering Part 2 - Phil Schmid](https://www.philschmid.de/context-engineering-part-2) (context rot, effective window thresholds)
- [Builder.io: AGENTS.md Tips](https://www.builder.io/blog/agents-md) (keep documentation small, progressive disclosure)
- [OpenAI AGENTS.md Guide](https://developers.openai.com/codex/guides/agents-md/) (layered guidance, progressive disclosure)
- [CocoIndex: Real-Time Codebase Indexing](https://cocoindex.io/blogs/index-code-base-for-rag) (incremental indexing architecture)
- [Glean: Incremental Indexing](https://glean.software/blog/incremental/) (O(changes) indexing)
- [Augment Code: Large Codebases](https://www.augmentcode.com/tools/ai-coding-assistants-for-large-codebases-a-complete-guide) (convention detection challenges)
- Kata codebase analysis: `KATA-STYLE.md` (Codebase Intelligence section), `.planning/deltas/CRITICAL-intel-system-gaps.md`
