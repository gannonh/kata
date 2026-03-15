# Kata Context — Product Requirements Document

> **Status:** Draft v1.0
> **Author:** Gannon Hall
> **Date:** 2026-03-14
> **Repository:** github.com/gannonh/kata-context (planned)
> **Linear:** Kata Desktop App project

---

## 1. Problem Statement

AI coding agents operate with limited understanding of the codebases they modify. Current approaches fall into two camps:

**Heavy RAG pipelines** (Cursor, Augment Code) rely on proprietary embedding models, cloud vector databases, and semantic search. They lose structural relationships that embeddings flatten. They require network connectivity, introduce privacy concerns, and create vendor lock-in.

**Lightweight tooling** (Claude Code, Codex, Aider) use grep/ripgrep, markdown memory files, and git history. These are fast, deterministic, and offline-capable, but lack semantic understanding and cross-file architectural awareness.

Neither camp combines structural code intelligence (what calls what, what imports what) with semantic search (find code that handles authentication) with persistent memory (this project uses MVVM, prefers protocol-oriented patterns). The agents that do this well use proprietary engines. No open-source solution unifies all three.

## 2. Product Overview

Kata Context is an open-source context engine that provides structural, semantic, and memory-based codebase understanding to AI agents and applications. It combines:

- **Structural intelligence** via AST parsing and knowledge graphs
- **Semantic search** via embeddings on LLM-generated code summaries
- **Persistent memory** via git-backed markdown files
- **Multi-strategy retrieval** where the consuming agent selects the retrieval path

Kata Context runs locally. No cloud dependencies for core functionality. All indexes, embeddings, and memory artifacts live on disk and in git.

### 2.1 Design Principles

1. **Local-first.** Core indexing, graph construction, and retrieval run without network access. Cloud services (hosted embeddings, remote indexes) are optional accelerators.
2. **Git-native.** Git is the versioning, sync, and collaboration primitive. Memory, indexes, and learned context are git-tracked artifacts.
3. **Agent-agnostic.** Expose capabilities through Agent Skills (`.md` + tool definitions), CLI, and MCP. No coupling to any specific agent framework.
4. **Structural over statistical.** Deterministic graph traversal is the primary retrieval path. Semantic search supplements where structural queries lack intent-awareness.
5. **Incremental by default.** Only re-index what changed. Use git diff as the change detection mechanism.

### 2.2 Target Users

- **Kata Cloud agent teams.** Primary consumer. Kata Context provides the codebase understanding layer for Kata's orchestrated agent workflows.
- **Claude Code / Codex / Aider users.** Via MCP server or Agent Skill, any terminal-based coding agent gains deep codebase context.
- **Custom agent builders.** TypeScript and Python SDKs for embedding Kata Context into custom agent pipelines.

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Consumers                          │
│  Agent Skill │ CLI │ MCP Server │ SDK (TS/Python)   │
└──────┬───────┴──┬──┴─────┬──────┴───────┬───────────┘
       │          │        │              │
┌──────▼──────────▼────────▼──────────────▼───────────┐
│              Retrieval Orchestrator                  │
│  structural │ semantic │ lexical │ memory │ combined │
└──────┬──────┴────┬─────┴────┬───┴───┬───┴───────────┘
       │           │          │       │
┌──────▼───┐ ┌─────▼────┐ ┌──▼──┐ ┌──▼──────────────┐
│ Knowledge│ │ Vector   │ │ rg  │ │ Memory Store    │
│ Graph    │ │ Index    │ │ fzf │ │ (.kata/memory/) │
│ (SQLite) │ │ (Qdrant) │ └─────┘ │ git-tracked .md │
└──────▲───┘ └────▲─────┘         └──▲──────────────┘
       │          │                   │
┌──────┴──────────┴───────────────────┴───────────────┐
│                 Indexing Pipeline                    │
│  git diff → tree-sitter → AST → graph + summaries  │
│              → embeddings → vector index            │
└─────────────────────────────────────────────────────┘
```

### 3.1 Layer 1 — Indexing Pipeline

**Purpose:** Parse source code into a structural knowledge graph and semantic vector index.

#### 3.1.1 AST Parsing (tree-sitter)

- Parse all source files using tree-sitter with language-specific grammars
- Extract symbols: functions, methods, classes, structs, protocols/interfaces, enums, type aliases, modules
- For each symbol, capture:
  - Fully qualified name
  - File path and line range
  - Symbol kind (function, class, etc.)
  - Signature (parameters, return type where available)
  - Docstring/comments if present
  - Raw source text
- Extract relationships:
  - `imports` — module/file import edges
  - `calls` — function/method call edges
  - `defines` — file-to-symbol containment
  - `inherits` — class/protocol inheritance
  - `implements` — protocol/interface conformance
  - `references` — symbol usage (variables, types)

**Language support (initial):** Swift, TypeScript, Python, Go, Rust, JavaScript, Java, Kotlin, C, C++

Tree-sitter grammars are loaded dynamically. Adding a language requires only the grammar package and a relationship extractor config.

#### 3.1.2 Knowledge Graph Construction

Store the parsed AST data as a knowledge graph.

**Storage:** SQLite with FTS5 for text search on symbol names and paths. The graph is stored as an adjacency list (nodes table + edges table). This avoids requiring Neo4j/Memgraph as a runtime dependency while supporting the core graph operations (traversal, PageRank, shortest path).

**Node schema:**
```
symbols (
  id          TEXT PRIMARY KEY,  -- hash of file:name:kind
  name        TEXT,
  kind        TEXT,              -- function, class, protocol, etc.
  file_path   TEXT,
  line_start  INTEGER,
  line_end    INTEGER,
  signature   TEXT,
  docstring   TEXT,
  source      TEXT,
  summary     TEXT,              -- LLM-generated NL description
  summary_embedding BLOB,       -- vector embedding of summary
  last_indexed_at TEXT,
  git_sha     TEXT               -- commit SHA when last indexed
)
```

**Edge schema:**
```
edges (
  source_id   TEXT,
  target_id   TEXT,
  kind        TEXT,  -- imports, calls, inherits, implements, references
  file_path   TEXT,  -- where the relationship is expressed
  line_number INTEGER
)
```

**Indexes:**
- FTS5 on `symbols.name`, `symbols.file_path`, `symbols.docstring`
- B-tree on `edges.source_id`, `edges.target_id`, `edges.kind`
- B-tree on `symbols.file_path`

#### 3.1.3 NL Summary Generation

For each symbol above a configurable complexity threshold (default: >5 lines), generate a short natural language summary using an LLM call. Cache aggressively; only regenerate when the symbol's source text changes.

**Summary format:** One sentence describing what the symbol does, its inputs, and its outputs. No preamble.

**Example:**
```
Validates a JWT token string against the signing key, returning the decoded
claims payload or throwing AuthError if expired or malformed.
```

Summaries are stored in the `symbols.summary` column and embedded for vector search.

#### 3.1.4 Embedding Generation

Embed NL summaries (not raw code) using a code-aware embedding model.

**Default model:** `nomic-embed-code` (open, runs locally via Ollama) or Voyage Code (API, higher quality).

**Vector storage:** Qdrant (self-hosted, runs as a single binary). Alternatively, sqlite-vss for zero-dependency mode (lower performance, acceptable for repos <100k symbols).

**Embedding pipeline:**
1. Check if summary has changed since last embedding
2. Batch new/changed summaries
3. Generate embeddings
4. Upsert into vector index with metadata (symbol_id, file_path, kind, name)

#### 3.1.5 Incremental Indexing via Git

The indexing pipeline uses `git diff` as its change detection mechanism.

```
1. git diff --name-only HEAD~1..HEAD  (or against last indexed SHA)
2. For each changed file:
   a. Re-parse with tree-sitter
   b. Diff extracted symbols against stored symbols
   c. Update/insert/delete nodes in graph
   d. Update edges
   e. Regenerate summaries for changed symbols
   f. Re-embed changed summaries
3. Store current HEAD SHA as last-indexed marker
```

For initial indexing of a new repo, process all files. For ongoing use, only process diffs. A file watcher (fsnotify or similar) triggers re-indexing on save during active development.

### 3.2 Layer 2 — Git-Native Memory

**Purpose:** Store agent learnings, project conventions, architectural decisions, and codebase knowledge as git-tracked markdown files.

#### 3.2.1 Memory Directory Structure

```
.kata/
├── memory/
│   ├── project.md          # project overview, tech stack, conventions
│   ├── architecture.md     # architectural patterns, module boundaries
│   ├── decisions/          # architectural decision records
│   │   ├── 001-auth-strategy.md
│   │   └── 002-data-layer.md
│   ├── patterns/           # recurring code patterns and preferences
│   │   ├── error-handling.md
│   │   └── testing-conventions.md
│   └── learnings/          # agent-discovered facts and corrections
│       ├── 2026-03-14-api-rate-limits.md
│       └── 2026-03-14-build-config.md
├── skills/                 # reusable agent skills (Letta-compatible)
│   ├── run-tests.md
│   └── deploy-staging.md
├── config.toml             # kata context configuration
└── index/                  # generated indexes (gitignored by default)
    ├── graph.sqlite
    ├── vectors/             # qdrant data or sqlite-vss
    └── .last-indexed-sha
```

#### 3.2.2 Memory Operations

**remember** — Agent writes a new memory file or appends to an existing one. Each write is a git commit with a descriptive message. The agent provides: content, category (decision/pattern/learning), and optional tags.

**recall** — Query memories by semantic similarity, keyword, tag, or recency. Memories are embedded alongside code summaries but stored in a separate namespace in the vector index. Graph-adjacent recall: given a symbol, find memories that reference or were created in the context of that symbol's file/module.

**forget** — Soft-delete by moving to `.kata/memory/.archive/`. Preserved in git history.

**consolidate** — Periodic background operation. An LLM pass merges redundant memories, resolves contradictions, prunes stale entries. Runs on `kata context consolidate` or automatically after N memory writes.

#### 3.2.3 Git Integration

Every memory operation produces a git commit in the `.kata/` directory:

```
kata-context: remember architecture — MVVM pattern with coordinator navigation
kata-context: consolidate — merged 3 auth-related learnings into decisions/001
kata-context: forget — archived stale API endpoint documentation
```

Benefits:
- Full history of what the agent learned and when
- `git log .kata/memory/` shows the agent's learning timeline
- `git diff` on memory files shows exactly what changed
- Branch-per-agent for concurrent work, merge to reconcile
- Blame shows which agent session created each piece of knowledge

### 3.3 Layer 3 — Retrieval Orchestrator

**Purpose:** Multi-strategy retrieval. The orchestrator does not decide which strategy to use. It exposes all strategies and lets the consuming agent (or a combined endpoint) select.

#### 3.3.1 Structural Retrieval (Graph)

**Input:** A symbol name, file path, or natural language description of a structural query.

**Operations:**
- `graph.dependents(symbol)` — what depends on this symbol (reverse edges)
- `graph.dependencies(symbol)` — what this symbol depends on (forward edges)
- `graph.call_chain(from, to)` — shortest call path between two symbols
- `graph.module_boundary(path)` — all symbols in a module and their external interfaces
- `graph.impact(symbol)` — transitive closure of dependents (change impact analysis)
- `graph.rank(query)` — PageRank-weighted file relevance given a starting set of files
- `graph.symbols(file)` — all symbols defined in a file with their relationships

**Output:** List of symbols with source text, file locations, and relationship context.

#### 3.3.2 Semantic Retrieval (Vector)

**Input:** Natural language query string.

**Operations:**
- `semantic.search(query, top_k, filters)` — vector similarity search on NL summaries. Filters: kind (function/class/etc.), file_path glob, tags.
- `semantic.similar(symbol_id, top_k)` — find symbols semantically similar to a given symbol.

**Output:** Ranked list of symbols with similarity scores, source text, and file locations.

#### 3.3.3 Lexical Retrieval

**Input:** Pattern string (regex or literal).

**Operations:**
- `lexical.grep(pattern, file_glob)` — ripgrep wrapper with structured output
- `lexical.fuzzy(query, scope)` — fzf-style fuzzy matching on file names, symbol names
- `lexical.fts(query)` — SQLite FTS5 search on symbol names, docstrings, paths

**Output:** Matched lines/files with surrounding context.

#### 3.3.4 Memory Retrieval

**Input:** Natural language query or tag/category filter.

**Operations:**
- `memory.search(query, top_k)` — semantic search over memory files
- `memory.by_tag(tag)` — filter by metadata tags
- `memory.recent(n)` — last N memory entries by commit timestamp
- `memory.for_context(file_paths)` — memories relevant to the given files/modules

**Output:** Memory entries with content, creation date, category, and relevance score.

#### 3.3.5 Combined Retrieval

**Input:** Natural language query + optional context (current file, recent files, task description).

**Pipeline:**
1. Run structural retrieval if the query references known symbols or files
2. Run semantic retrieval on the query
3. Run memory retrieval for relevant project context
4. Deduplicate by symbol ID
5. Re-rank using a lightweight scoring function:
   - Structural relevance (graph distance from current context)
   - Semantic similarity score
   - Recency (recently modified files weighted higher)
   - Memory relevance (project conventions applicable to this code area)
6. Assemble context within a configurable token budget
7. Return structured context bundle

### 3.4 Layer 4 — Interfaces

Kata Context exposes its capabilities through three interfaces, each optimized for different consumption patterns.

#### 3.4.1 Agent Skill

The primary interface for coding agents. An Agent Skill is a markdown file with structured tool definitions that agents load into their system prompt or skill library. This pattern is used by Claude Code (CLAUDE.md), Codex (codex.md), Letta Code (.skills/), and Aider (.aider.conf.yml).

Agent Skills outperform MCP for coding agents because:
- Zero protocol overhead. The agent reads a markdown file and calls shell commands.
- The skill description teaches the agent *when* and *how* to use each capability.
- Skills compose naturally with other skills in the agent's context.
- No separate server process to manage.

**Skill file:** `.kata/skills/context.md`

```markdown
# Kata Context Skill

Use this skill to understand the codebase structure, find relevant code,
and recall project conventions.

## Available Commands

### Index the workspace
Run when first entering a project or after major changes.
$ kata context index [--force]

### Structural queries
Find what depends on a symbol or what a symbol depends on.
$ kata context graph dependents <symbol_name>
$ kata context graph dependencies <symbol_name>
$ kata context graph impact <symbol_name>
$ kata context graph call-chain <from_symbol> <to_symbol>
$ kata context graph module <path>
$ kata context graph rank --files <file1,file2,...>

### Semantic search
Find code by describing what it does.
$ kata context search "<natural language query>" [--top-k 10] [--kind function|class|...]

### Lexical search
Find exact patterns.
$ kata context grep "<pattern>" [--glob "*.swift"]
$ kata context find "<fuzzy query>"

### Memory operations
Store and recall project knowledge.
$ kata context remember "<content>" --category <decision|pattern|learning> [--tags tag1,tag2]
$ kata context recall "<query>" [--top-k 5]
$ kata context recall --recent 10
$ kata context recall --for-context <file1,file2,...>

### Combined context
Get a full context bundle for a task. Best default for complex queries.
$ kata context get "<task description>" [--budget 8000] [--current-file <path>]

### Consolidate memory
Merge and prune redundant memories.
$ kata context consolidate [--dry-run]

## Usage Guidelines

- Run `kata context index` once when starting work on a project.
  Incremental re-indexing happens automatically on file changes.
- For targeted code questions ("what calls this function?"), use
  graph commands. They are faster and more precise than semantic search.
- For intent-based questions ("where is authentication handled?"),
  use semantic search.
- Use `kata context get` when you need comprehensive context for a
  complex task. It combines all retrieval strategies.
- Store important discoveries with `kata context remember`. Future
  sessions will benefit from accumulated project knowledge.
- Memory files live in `.kata/memory/` and are git-tracked.
  Commit them with your code.
```

#### 3.4.2 CLI

The CLI is both the implementation behind the Agent Skill commands and a standalone tool for developers.

**Binary:** `kata` (distributed via Homebrew, npm, or cargo)

**Implementation language:** TypeScript (Node.js). Rationale: tree-sitter has mature Node bindings, Qdrant has a TS client, and this matches the SDK language. Performance-critical paths (embedding generation, large graph traversals) can shell out to Rust/native binaries.

**Command structure:**

```
kata context index [--force] [--watch]
kata context status

kata context graph dependents <symbol>
kata context graph dependencies <symbol>
kata context graph impact <symbol>
kata context graph call-chain <from> <to>
kata context graph module <path>
kata context graph rank --files <file1,file2,...>
kata context graph symbols <file>
kata context graph stats

kata context search <query> [--top-k N] [--kind K] [--file-glob G]
kata context similar <symbol> [--top-k N]

kata context grep <pattern> [--glob G]
kata context find <fuzzy-query>

kata context get <task-description> [--budget N] [--current-file F]

kata context remember <content> --category C [--tags T]
kata context recall <query> [--top-k N]
kata context recall --recent N
kata context recall --for-context <files>
kata context consolidate [--dry-run]
kata context memory list
kata context memory show <id>

kata context serve [--port 3333]       # start MCP server
kata context config [key] [value]      # manage .kata/config.toml
```

**Output formats:** Default is human-readable. `--json` flag for structured output. `--quiet` for minimal output (just file paths or symbol names). The Agent Skill relies on the default human-readable output since agents parse natural language well.

#### 3.4.3 MCP Server

For interoperability with MCP-compatible tools (Cursor, VS Code Copilot, Augment, Windsurf, Zed, etc.).

**Transport:** stdio (default for local agents) and HTTP/SSE (for remote/shared contexts).

**Server start:** `kata context serve` or auto-started by MCP client configuration.

**MCP Tools exposed:**

| Tool | Description |
|------|-------------|
| `index_workspace` | Trigger full or incremental indexing |
| `graph_query` | Structural graph operations (dependents, dependencies, impact, call-chain, module, rank) |
| `semantic_search` | Vector similarity search on code summaries |
| `lexical_search` | ripgrep and FTS search |
| `get_context` | Combined retrieval with token budget |
| `remember` | Store a memory entry |
| `recall` | Query memories |
| `consolidate_memory` | Merge/prune memories |
| `get_symbols` | List symbols in a file or module |
| `get_stats` | Index statistics (file count, symbol count, last indexed, etc.) |

**MCP Resources exposed:**

| Resource | Description |
|----------|-------------|
| `kata://memory/{category}` | Memory files by category |
| `kata://graph/stats` | Graph statistics |
| `kata://config` | Current configuration |

#### 3.4.4 SDK (TypeScript / Python)

Programmatic access for custom agent builders and applications.

**TypeScript (primary):**
```typescript
import { KataContext } from '@kata/context';

const ctx = new KataContext({ workspacePath: '/path/to/repo' });
await ctx.index();

// Structural
const deps = await ctx.graph.dependents('AuthService.validate');
const impact = await ctx.graph.impact('UserModel');

// Semantic
const results = await ctx.search('error handling middleware', { topK: 5 });

// Memory
await ctx.remember('Uses JWT RS256 for auth tokens', { category: 'pattern' });
const conventions = await ctx.recall('authentication patterns');

// Combined
const bundle = await ctx.getContext('implement rate limiting on the API', {
  budget: 8000,
  currentFile: 'src/api/router.ts'
});
```

**Python:** Wrapper that shells out to the CLI with `--json` output parsing. Lower priority; full native Python SDK if demand warrants.

## 4. Configuration

**File:** `.kata/config.toml`

```toml
[indexing]
# Languages to parse (auto-detected if empty)
languages = []
# File patterns to exclude
exclude = ["node_modules", ".build", "DerivedData", "Pods", "*.generated.*"]
# Minimum symbol size (lines) for NL summary generation
summary_threshold = 5
# Watch for file changes and re-index automatically
watch = true

[embeddings]
# "local" (nomic via Ollama) or "voyage" (API) or "openai"
provider = "local"
model = "nomic-embed-code"
# Dimensions (must match model)
dimensions = 768

[vector]
# "qdrant" or "sqlite-vss"
backend = "sqlite-vss"
# Qdrant connection (if backend = "qdrant")
# qdrant_url = "http://localhost:6334"

[summary]
# LLM provider for generating NL summaries
provider = "anthropic"
model = "claude-sonnet-4-20250514"
# Alternative: "ollama" with a local model for fully offline operation

[memory]
# Auto-consolidate after N memory writes
consolidate_threshold = 20
# Max memory entries before consolidation warning
max_entries = 200

[retrieval]
# Default token budget for combined retrieval
default_budget = 8000
# Weight factors for combined ranking
structural_weight = 0.4
semantic_weight = 0.3
recency_weight = 0.15
memory_weight = 0.15
```

## 5. Data Flow Examples

### 5.1 Initial project setup

```
Developer runs: kata context index

1. Scan all files matching language grammars
2. Parse each file with tree-sitter
3. Extract symbols and relationships
4. Build knowledge graph in SQLite
5. Generate NL summaries for symbols > threshold
6. Generate embeddings for summaries
7. Store embeddings in vector index
8. Write .kata/index/.last-indexed-sha
9. Output: "Indexed 1,247 symbols across 89 files in 34s"
```

### 5.2 Agent asks "where is authentication handled?"

```
Agent runs: kata context search "authentication handling"

1. Embed query using configured embedding model
2. Vector search returns top-10 symbols by similarity
3. For each result, fetch source text from disk
4. Return ranked results with file paths, line ranges, source snippets
```

### 5.3 Agent asks "what will break if I change UserModel?"

```
Agent runs: kata context graph impact UserModel

1. Find UserModel node in graph
2. Compute transitive closure of all dependents
3. Group by file
4. PageRank to order by centrality/importance
5. Return affected symbols and files, ordered by impact
```

### 5.4 Agent learns a project convention

```
Agent runs: kata context remember "API routes follow RESTful conventions
with versioned paths: /api/v1/{resource}. Controllers are in
src/controllers/ and use dependency injection via constructor params."
--category pattern --tags api,routing,conventions

1. Write .kata/memory/patterns/api-routing.md
2. Embed the memory text
3. Store embedding in vector index (memory namespace)
4. git commit -m "kata-context: remember pattern — API routing conventions"
```

### 5.5 Incremental re-index after code change

```
Developer saves src/auth/token.ts

1. File watcher detects change
2. git diff identifies changed hunks
3. Re-parse token.ts with tree-sitter
4. Diff symbols: validateToken signature changed, new function refreshToken added
5. Update graph: modify validateToken node, add refreshToken node + edges
6. Regenerate summaries for changed/new symbols only
7. Re-embed changed summaries
8. Total time: <2s for single file change
```

## 6. Upstream Dependencies

| Component | Purpose | License | Notes |
|-----------|---------|---------|-------|
| tree-sitter | AST parsing | MIT | Core dependency. Node bindings via `tree-sitter` npm package. |
| tree-sitter grammars | Language-specific parsers | Varies (mostly MIT) | One per supported language. |
| SQLite + better-sqlite3 | Graph storage, FTS | Public domain / MIT | Zero-config embedded DB. |
| sqlite-vss | Vector search (default) | MIT | SQLite extension for vector similarity. |
| Qdrant | Vector search (optional) | Apache 2.0 | Higher performance, requires separate process. |
| ripgrep | Lexical search | MIT/Unlicense | Called via shell. |
| fzf | Fuzzy matching | MIT | Called via shell. |
| Ollama | Local embeddings/summaries | MIT | Optional. For fully offline operation. |
| NetworkX.js / graphology | Graph algorithms | MIT | PageRank, shortest path, traversal. |
| chokidar | File watching | MIT | Cross-platform fs events. |
| @modelcontextprotocol/sdk | MCP server | MIT | MCP protocol implementation. |

## 7. Differentiators vs. Existing Solutions

| Capability | Kata Context | Cursor | Augment MCP | Aider | Claude Code |
|------------|-------------|--------|-------------|-------|-------------|
| Structural graph | Yes (AST + knowledge graph) | No | No (semantic only) | Yes (repo-map) | No |
| Semantic search | Yes (NL summary embeddings) | Yes (code embeddings) | Yes | No | No |
| Lexical search | Yes (rg + FTS) | Yes (hybrid) | No | No | Yes (grep) |
| Persistent memory | Yes (git-backed .md) | Partial (sidecar memories) | No | No | Yes (CLAUDE.md) |
| Git-native versioning | Yes | No | No | No | No |
| Local/offline | Yes | No (cloud embeddings) | No (API required) | Yes | Yes |
| Open source | Yes | No | Partial (connectors only) | Yes | No |
| Agent Skill interface | Yes | N/A | No | No | N/A |
| MCP interface | Yes | N/A | Yes | No | No |
| Multi-language AST | Yes (40+ via tree-sitter) | Unknown | Unknown | Yes (40+ via tree-sitter) | No |
| Knowledge graph queries | Yes (PageRank, impact, call-chain) | No | No | Yes (PageRank) | No |

## 8. MVP Scope

### Phase 1: Foundation (v0.1)

- [ ] Tree-sitter parsing for Swift, TypeScript, Python
- [ ] SQLite knowledge graph (nodes + edges)
- [ ] Basic graph queries: dependents, dependencies, symbols-in-file
- [ ] Lexical search via ripgrep wrapper
- [ ] CLI with `index`, `graph`, `grep`, `find` commands
- [ ] Agent Skill markdown file
- [ ] `.kata/` directory structure
- [ ] Incremental indexing via git diff
- [ ] Human-readable + JSON output

### Phase 2: Semantic + Memory (v0.2)

- [ ] NL summary generation (Anthropic API + Ollama)
- [ ] Embedding pipeline (nomic-embed-code via Ollama, Voyage API)
- [ ] sqlite-vss vector storage
- [ ] Semantic search command
- [ ] Memory operations (remember, recall, consolidate)
- [ ] Git-backed memory commits
- [ ] File watcher for auto re-index
- [ ] Combined retrieval with token budget

### Phase 3: Interfaces + Polish (v0.3)

- [ ] MCP server (stdio + HTTP/SSE)
- [ ] TypeScript SDK
- [ ] PageRank ranking
- [ ] Impact analysis (transitive dependents)
- [ ] Call-chain computation
- [ ] Qdrant backend option
- [ ] Skill learning integration (Letta-compatible .skills/)
- [ ] `kata context serve` for remote access
- [ ] Python SDK (CLI wrapper)

### Phase 4: Scale + Ecosystem (v0.4+)

- [ ] Multi-repo context (cross-repo graph edges)
- [ ] Remote index storage (S3-compatible)
- [ ] Webhook-triggered re-indexing (GitHub/GitLab push events)
- [ ] Documentation/website indexing (crawl + embed)
- [ ] Context Connectors (GitHub, GitLab, Bitbucket source indexing without clone)
- [ ] Kata Cloud integration (agent team shared context)

## 9. Success Metrics

- **Indexing speed:** <60s for 100k LOC repo on M-series Mac. <2s incremental for single file change.
- **Graph query latency:** <100ms for single-hop queries (dependents, dependencies). <500ms for transitive impact analysis.
- **Semantic search latency:** <500ms for top-10 results (local embeddings). <1s with API embeddings.
- **Memory recall latency:** <200ms.
- **Context quality:** Measurable via Kata's internal eval suite. Target: combined retrieval returns relevant context in top-5 results for >80% of queries on test repos.
- **Agent Skill adoption:** Track usage via CLI telemetry (opt-in). Target: 50%+ of Kata Cloud agent sessions use context commands.

## 10. Open Questions

1. **Graph DB choice:** SQLite adjacency list vs. embedded graph DB (e.g., Kuzu, DuckDB with graph extensions). SQLite is simpler and sufficient for single-repo scale. Revisit if multi-repo graphs exceed performance thresholds.
2. **Embedding model:** nomic-embed-code is the best open local option today. Voyage Code-3 is higher quality but requires API. Default to local with API as opt-in upgrade.
3. **Summary generation cost:** Generating NL summaries for every symbol >5 lines on a large repo could be expensive. Consider: batch summarization, caching across repos with identical dependencies, using a small local model (Qwen 2.5 Coder via Ollama) for summaries.
4. **Letta compatibility:** Letta Code's Context Repositories and .skills/ format are gaining traction. Target compatibility so Kata Context skills work in Letta Code and vice versa.
5. **Swift-specific intelligence:** Given Kata's iOS focus, consider deeper Swift integration: SwiftUI view hierarchy extraction, SPM dependency graph, Xcode project structure parsing. This could be a differentiated plugin.
