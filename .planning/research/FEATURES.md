# Feature Landscape: Codebase Intelligence Lifecycle

**Domain:** Codebase intelligence for AI agent frameworks
**Researched:** 2026-02-15
**Confidence:** HIGH (cross-verified across 6+ tools and OpenAI Harness Engineering paper)

## Ecosystem Context

AI coding tools have converged on a pattern: static context files (CLAUDE.md, AGENTS.md, .cursorrules) provide initial codebase orientation, while richer indexing systems (Cursor's embedding engine, Augment Code's Context Engine, Windsurf's Cascade indexer) provide runtime retrieval. The gap between these two layers is where codebase intelligence lives.

**Key ecosystem signals:**
- OpenAI's Harness Engineering paper treats the repository as system of record, AGENTS.md as table of contents (not encyclopedia), and a docs/ directory as the knowledge base
- AGENTS.md spec adopted by 20,000+ repos, supported by Cursor, Windsurf, Codex, Factory, Aider, Kilo Code
- Augment Code's Context Engine provides semantic indexing with real-time sync, cross-repo dependency tracing, and convention detection
- Cursor uses AST-based chunking, vector embeddings, and Merkle tree-based incremental sync every 10 minutes
- Cline's Memory Bank persists context via structured markdown files read at every task start
- Windsurf's Cascade tracks edits, commands, and clipboard in real-time, storing memories at ~/.codeium/windsurf/memories/
- Research paper (arxiv.org/html/2511.12884v1) found 67.4% of CLAUDE.md files are modified multiple times, functioning as living configuration artifacts

**Where Kata sits:** Kata already has `kata-map-codebase` producing static `.planning/codebase/` docs (7 documents via parallel mapper agents). The existing architecture references `.planning/intel/` files (index.json, conventions.json, summary.md) that agents try to load, but the hooks to generate them were never implemented. This creates silent failures where planners and executors proceed without codebase context.

## Table Stakes

Features required for a functional codebase intelligence system. Without these, agents operate blind to the codebase they're modifying.

| Feature | What It Does | Complexity | Kata Dependencies | Notes |
|---------|-------------|------------|-------------------|-------|
| **Static codebase map** | One-time analysis producing architecture, conventions, stack, structure docs | Already built | `kata-map-codebase` skill, mapper agents | Produces 7 docs in `.planning/codebase/`. Parallel agents write directly. Working today |
| **Context injection at agent spawn** | Feed relevant codebase knowledge into subagent prompts before they start work | Low | Skills that spawn agents (plan, execute, verify) | Planners and executors already reference `.planning/intel/summary.md` via `cat ... 2>/dev/null`. The load step exists; the data source doesn't. Bridge: generate summary.md from existing codebase/ docs |
| **Convention documentation** | Naming patterns, import order, error handling style, file organization rules | Already partial | `kata-map-codebase` quality mapper | CONVENTIONS.md exists but is template-driven (captures what IS). Missing: prescriptive rules executors can follow (what SHOULD BE) |
| **Architecture overview** | System layers, entry points, data flow, key abstractions | Already built | `kata-map-codebase` arch mapper | ARCHITECTURE.md captures this. Quality depends on mapper agent thoroughness |
| **Build/test commands** | Exact commands to compile, test, lint, run | Already partial | STACK.md, TESTING.md | Exists in codebase docs. AGENTS.md spec emphasizes these as highest-value content. 75% of context files include testing commands (research paper finding) |
| **Directory placement guidance** | Where to put new files of each type | Already partial | STRUCTURE.md "Where to Add New Code" section | Template supports this. Execution quality varies |
| **Staleness detection** | Know when codebase docs are outdated relative to actual code | Medium | Codebase doc timestamps, git history | Without this, agents trust stale docs. Cursor solves via Merkle trees (10-min sync). Kata equivalent: compare doc analysis dates against recent git activity |

## Differentiators

Features that would give Kata competitive advantage over static context file approaches (CLAUDE.md, AGENTS.md, .cursorrules).

| Feature | What It Does | Complexity | Kata Dependencies | Comparison |
|---------|-------------|------------|-------------------|------------|
| **Incremental intel updates** | Update codebase knowledge as code changes, not just on full remap | Medium-High | PostToolUse hooks, file change detection | Cursor: Merkle tree sync every 10 min. Augment: real-time knowledge graph. Windsurf: event-driven re-indexing. Current Kata: manual full remap only. Hook-based incremental updates would match Windsurf's approach without requiring a server |
| **Convention enforcement** | Detect when new code violates established patterns and warn/correct | Medium | CONVENTIONS.md, PostToolUse hooks | Static files (AGENTS.md, .cursorrules) state conventions but can't enforce them. Kata could validate at write-time via hooks, catching violations before commit. This bridges the gap between documentation and enforcement |
| **Selective context injection** | Load only the codebase docs relevant to the current task (UI task gets CONVENTIONS.md + STRUCTURE.md, not INTEGRATIONS.md) | Low-Medium | Skill orchestrators, codebase doc categorization | `kata-map-codebase` already defines a mapping table (phase type to documents loaded). Extending this from the mapper into plan/execute skills makes context injection task-aware rather than dumping everything |
| **Doc gardening automation** | Keep codebase docs updated when code changes, triggered by git events or hooks | Medium | PostToolUse/SessionStart hooks, `.planning/codebase/` | OpenAI's Harness Engineering team captures review comments and bugs as documentation updates. Kata could trigger partial re-analysis when files in documented areas change. Prevents the stale-doc problem that makes all context files eventually useless |
| **Cross-session memory** | Decisions, patterns discovered, and lessons learned persist across Claude sessions | Low-Medium | STATE.md (already exists), `.planning/intel/` | Cline's Memory Bank reads all context files at every task start. Kata's STATE.md already serves this role for planning decisions. Extending it to capture codebase learnings (discovered patterns, one-off conventions) bridges the gap |
| **Dependency graph awareness** | Know which files import which, enabling impact analysis for changes | Medium-High | AST parsing or import scanning, index.json | KATA-STYLE.md already defines an index.json schema (`exports`, `imports`, `indexed` per file). Cursor uses AST-based splitting (tree-sitter). Kata could use a lighter approach: grep-based import scanning stored in index.json, queryable by agents |
| **Pattern detection from code** | Auto-detect naming conventions, directory purposes, suffix patterns from actual code | Medium | File scanning, heuristic analysis | KATA-STYLE.md defines conventions.json with detection rules (5+ exports for naming, 70%+ match rate, 5+ files for suffixes). This was designed but never built. Augment Code calls this "understanding how your team actually builds" |
| **Codebase intelligence summary** | Machine-readable summary injected into agent context at session start | Low | SessionStart hook, `.planning/intel/summary.md` | KATA-STYLE.md defines a SessionStart hook (intel-session.js) that reads index.json and conventions.json, outputs `<codebase-intelligence>` wrapped summary. Design exists; implementation doesn't |
| **Multi-agent knowledge sharing** | When one agent discovers something about the codebase, other agents benefit | Medium | Agent result capture, summary aggregation | Current Kata: each agent's codebase knowledge dies with its context window. A shared intel layer means the executor benefits from what the planner discovered about the codebase during planning |

## Anti-Features

Things to deliberately NOT build. Over-engineering traps that add complexity without proportional value for a solo developer + Claude workflow.

| Anti-Feature | Why NOT to Build | What Existing Tools Do | What to Do Instead |
|-------------|-----------------|----------------------|-------------------|
| **Vector embedding / semantic search** | Requires external infrastructure (vector DB, embedding API). Cursor uses Turbopuffer; Augment runs cloud services. Kata is a CLI tool with no server. Embedding infrastructure contradicts Kata's zero-dependency philosophy | Cursor: cloud-hosted Turbopuffer. Augment: hosted Context Engine. Both require network, accounts, paid services | Grep-based search + structured markdown docs. Claude already understands code; it doesn't need embeddings to find relevant files. `Glob` + `Grep` tools are sufficient retrieval |
| **Real-time file watching** | File watchers (chokidar, fsevents) add process overhead, platform complexity, and crash vectors. The 10-second latency gain over hook-based updates doesn't justify the complexity for a tool that runs in discrete sessions | Cursor: background process with 10-min Merkle sync. Windsurf: IDE-integrated event system. Both are IDE-native, not CLI tools | PostToolUse hooks trigger on Claude's own writes. Git diff can catch external changes at session start. Event-driven, not poll-driven |
| **AST parsing / tree-sitter integration** | Tree-sitter requires native binaries, multi-language grammar management, and WASM compilation. The CRITICAL-intel-system-gaps.md already identified WASM dependencies as high-risk. Massive surface area for a feature that grep-based scanning covers 80% of | Cursor: tree-sitter for AST-based chunking. Augment: proprietary parsers. Both have engineering teams maintaining language support | Regex-based import/export scanning. KATA-STYLE.md already defines this: scan `import` and `export` statements, skip `node_modules`. Good enough for dependency graphs without AST complexity |
| **Cross-repository intelligence** | Kata manages one project at a time. Multi-repo awareness adds coordination complexity with no user demand. Solo developer workflow doesn't need cross-repo tracing | Augment: cross-repo dependency tracing. Enterprise feature for microservice architectures | Stay single-repo. The `.planning/` directory is the boundary. If users need multi-repo, they run Kata in each repo independently |
| **Custom query language** | Building a DSL for querying codebase intelligence (like "find all components that import UserService") adds parser complexity. Claude can already answer these questions by reading code | Some tools provide structured query APIs for their indexed data | Let Claude use Grep/Glob. Natural language queries against code files work better than a custom DSL that Claude also has to learn |
| **Automatic refactoring suggestions** | Proactively suggesting refactors based on detected patterns creates noise. The concerns mapper already captures tech debt; automated suggestions add opinion where observation suffices | Some tools flag "code smells" or suggest refactors automatically | CONCERNS.md captures observed issues. Phase planning prioritizes them. Human decides when to act |
| **IDE integration / language server protocol** | LSP integration requires platform-specific bindings and turns Kata from a CLI framework into an IDE plugin. Different product category | Cursor, Windsurf, Augment: all IDE-native. LSP is their natural interface | Kata is terminal-native. Skills, hooks, and markdown docs are the interface. Claude Code already has IDE extensions that provide the editing surface |
| **Full git history analysis** | Mining entire commit history for patterns (who changed what, when, why) is computationally expensive and the signal-to-noise ratio is low for solo developers | Some tools analyze commit history for "understanding why changes were made" | Read recent commits (git log -20). STATE.md captures key decisions. Full history mining is enterprise archaeology |

## Feature Dependencies

```
Codebase Intelligence Lifecycle
├── Static Analysis (BUILT)
│   └── kata-map-codebase → .planning/codebase/ (7 docs)
│
├── Context Injection (GAP - designed but not wired)
│   ├── Generate .planning/intel/summary.md from codebase/ docs
│   ├── SessionStart hook reads summary.md → <codebase-intelligence>
│   └── Skills inject relevant docs into subagent prompts
│       └── Depends on: selective context injection (task-type mapping)
│
├── Incremental Updates (GAP - designed but not built)
│   ├── PostToolUse hook detects code changes → updates intel
│   │   └── Depends on: index.json schema (defined in KATA-STYLE.md)
│   ├── conventions.json auto-detection
│   │   └── Depends on: index.json population
│   └── summary.md regeneration on every intel update
│       └── Depends on: index.json + conventions.json
│
├── Staleness Detection (GAP)
│   ├── Compare codebase doc dates vs git log --since
│   └── Flag stale docs at session start or remap trigger
│       └── Depends on: SessionStart hook
│
├── Convention Enforcement (GAP)
│   ├── PostToolUse hook validates writes against CONVENTIONS.md
│   └── Warn or block non-conforming code
│       └── Depends on: conventions.json (detected patterns)
│
└── Doc Gardening (GAP)
    ├── Detect when documented files change significantly
    ├── Queue partial re-analysis of affected codebase docs
    └── Update summary.md with new findings
        └── Depends on: incremental updates, staleness detection
```

## Comparison with Existing Approaches

### Static Context Files

| Aspect | CLAUDE.md | AGENTS.md | .cursorrules | Kata Codebase Intelligence |
|--------|-----------|-----------|-------------|---------------------------|
| **Author** | Human (manual) | Human (manual) | Human (manual) | Agent (automated analysis) |
| **Scope** | Project-wide | Hierarchical (root → subdirectory) | Project-wide | Project-wide with per-doc focus areas |
| **Content type** | Free-form instructions | Structured sections (build, test, conventions) | Rules and preferences | Structured templates (7 categories) |
| **Update mechanism** | Manual editing | Manual editing | Manual editing | Manual remap (`/kata-map-codebase`) |
| **Size guidance** | No limit, median ~500 words | ~150 lines recommended, 32 KiB max | No formal limit | 7 separate docs, each focused |
| **Agent consumption** | Loaded at session start | Nearest-file-wins hierarchy | Loaded at session start | Injected into subagent prompts |
| **Staleness risk** | High (67.4% modified multiple times but gaps emerge) | Medium (spec encourages brevity) | High | High (no auto-update yet) |

### Dynamic Indexing Systems

| Aspect | Cursor Indexing | Augment Context Engine | Windsurf Cascade | Kata Target |
|--------|----------------|----------------------|-----------------|-------------|
| **Index storage** | Cloud (Turbopuffer) | Cloud (hosted) | Local + cloud | Local (`.planning/intel/`) |
| **Sync frequency** | 10 min (Merkle tree) | Real-time | Real-time (event-driven) | On write (PostToolUse hook) |
| **Chunking** | AST-based (tree-sitter) | Semantic embeddings | LLM-based search | Grep-based import/export scanning |
| **Query interface** | Embedding similarity search | Semantic search API | LLM-based search | Claude reads structured markdown |
| **Infrastructure** | Requires cloud account | Requires cloud account | IDE-integrated | Zero external dependencies |
| **Convention detection** | Implicit (from code patterns) | Explicit (pattern analysis) | Implicit + memories | Explicit (heuristic rules in conventions.json) |
| **Cross-session memory** | IDE state | Cloud-persisted | ~/.codeium/windsurf/memories/ | `.planning/intel/` + STATE.md |

### Kata's Position

Kata occupies a distinct niche: **structured, local, zero-dependency codebase intelligence optimized for Claude's context window**. It doesn't compete with IDE-native indexing (Cursor, Windsurf) or cloud-hosted engines (Augment). It competes with static context files (CLAUDE.md, AGENTS.md) by making them agent-generated, template-structured, and integrated into a multi-agent workflow.

The key differentiator: static context files tell the agent about the codebase. Kata's codebase intelligence system feeds agents codebase knowledge as part of their task context, selectively and automatically.

## Complexity Estimates

| Feature | Complexity | Rationale |
|---------|------------|-----------|
| Generate summary.md from codebase/ docs | Low | Read 7 files, extract key facts, write summary |
| SessionStart hook (intel-session.js) | Low | Read file, output wrapped content. Design in KATA-STYLE.md |
| Selective context injection in skills | Low-Medium | Extend existing task-type mapping table to skill orchestrators |
| Staleness detection | Medium | Compare file dates vs git history, flag at session start |
| PostToolUse hook for intel index | Medium | Scan written file for imports/exports, update index.json |
| Convention detection heuristics | Medium | Analyze index.json for naming patterns (5+ samples, 70%+ match) |
| Convention enforcement hooks | Medium | Compare written code against conventions.json patterns |
| Doc gardening triggers | Medium-High | Detect significant changes, queue partial re-analysis |
| Incremental codebase doc updates | High | Scope change detection, selective doc regeneration |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hook overhead slows Claude | Medium | Medium | Keep hooks under 500ms. PostToolUse intel-index already designed for silent, fast execution |
| Stale intel worse than no intel | Medium | High | Staleness detection flags old data. Agents trust fresh data, distrust stale. Summary.md includes generation timestamp |
| Convention detection false positives | Medium | Low | Require high confidence thresholds (70%+ match, 5+ samples). Flag as "detected" not "enforced" |
| Context budget exceeded by intel injection | Low | High | Summary.md stays concise. Selective injection loads only relevant docs. Progressive disclosure hierarchy |
| Intel files conflict with existing .planning/ structure | Low | Medium | Intel directory already defined in KATA-STYLE.md. Path conventions established |

## MVP Recommendation

**Phase 1: Wire the existing design (Low complexity)**
1. Generate `.planning/intel/summary.md` from existing `.planning/codebase/` docs
2. Implement SessionStart hook to inject `<codebase-intelligence>` context
3. Update skill orchestrators to inject relevant codebase docs into subagent prompts

This closes the gap identified in CRITICAL-intel-system-gaps.md: agents already try to load summary.md, but the file doesn't exist.

**Phase 2: Incremental intelligence (Medium complexity)**
1. PostToolUse hook populates index.json on file writes
2. Convention detection from index.json patterns
3. Regenerate summary.md on intel updates
4. Staleness detection at session start

**Phase 3: Active maintenance (Medium-High complexity)**
1. Doc gardening triggers on significant code changes
2. Convention enforcement warnings via hooks
3. Multi-agent knowledge sharing through shared intel layer

## Sources

### Primary Research
- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) - Repository as system of record, AGENTS.md as table of contents, doc gardening
- [AGENTS.md Specification](https://agents.md/) - Open standard for AI coding agent context files
- [AGENTS.md - OpenAI Codex Guide](https://developers.openai.com/codex/guides/agents-md/) - Hierarchical discovery, 32 KiB limit, structure recommendations
- [Agent READMEs: Empirical Study](https://arxiv.org/html/2511.12884v1) - Analysis of 16 instruction categories, CLAUDE.md vs AGENTS.md comparison, 67.4% modification rate

### Tool Architecture
- [How Cursor Indexes Codebases Fast](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast) - AST chunking, Turbopuffer embeddings, Merkle tree sync
- [Augment Code Context Engine](https://www.augmentcode.com/context-engine) - Semantic indexing, real-time sync, cross-repo intelligence
- [Windsurf Cascade](https://docs.windsurf.com/windsurf/cascade/cascade) - Event-driven re-indexing, memories persistence
- [Cline Memory Bank](https://docs.cline.bot/prompting/cline-memory-bank) - Structured markdown persistence, custom instructions integration

### Kata Internal
- `.planning/deltas/CRITICAL-intel-system-gaps.md` - Documents the gap: agents reference intel files that don't exist
- `KATA-STYLE.md` Codebase Intelligence section - Defines index.json schema, conventions.json detection rules, hook architecture
- `skills/kata-map-codebase/SKILL.md` - Current static analysis implementation
- `skills/kata-map-codebase/references/codebase-mapper-instructions.md` - Mapper agent instructions and document templates
