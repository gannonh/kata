---
name: kata-context
description: Structural and semantic codebase intelligence with persistent memory — index TypeScript and Python repos into a knowledge graph with vector embeddings, query symbol dependencies, run semantic search by intent, search code patterns, fuzzy-find symbols, and persist/recall agent memories with git audit trail. Use when you need to understand code structure, find what depends on a symbol, trace dependencies, search by meaning, search for code patterns, find symbols by name, or remember/recall project decisions, patterns, and learnings.
---

# kata-context

Structural and semantic codebase intelligence with persistent memory for AI coding agents. Indexes TypeScript and Python repositories into a SQLite knowledge graph with optional vector embeddings, then exposes graph queries, semantic search, pattern search, fuzzy symbol lookup, and durable memory operations via CLI commands. Every memory mutation produces a git commit for audit trail.

## When to Use

Use `kata-context` when you need to:

- **Search by intent** — "find the authentication handler", "where is rate limiting implemented?" (semantic search)
- **Understand code structure** — what symbols exist in a file, what calls what, what imports what
- **Find dependents** — "what will break if I change this function/class?"
- **Trace dependencies** — "what does this symbol depend on?"
- **Search for patterns** — grep for TODOs, error handling patterns, specific API calls
- **Find symbols by name** — fuzzy-match when you know part of a symbol or file name
- **Check index health** — see how many symbols/edges are indexed, when last indexed
- **Remember decisions** — persist project decisions, patterns, and learnings as durable memories
- **Recall by meaning** — semantically search stored memories by natural language query
- **Forget memories** — remove outdated or incorrect memories
- **Consolidate** — merge related memories into a single distilled entry

## Prerequisites

- **Node.js** ≥ 20
- **ripgrep** (`rg`) — required for the `grep` command. Install via `brew install ripgrep` or your package manager. All other commands work without it.
- **OPENAI_API_KEY** — required for `search` (semantic search), `recall` (semantic memory recall), and for generating embeddings during `index`. Set in your environment.

## Quick Start

```bash
# 1. Index the current project (includes semantic embeddings if OPENAI_API_KEY is set)
kata-context index .

# 2. Check what's indexed
kata-context status

# 3. Semantic search — find code by meaning
kata-context search "authentication handling"
kata-context search "error recovery patterns" --top-k 5

# 4. Query the graph
kata-context graph dependents UserService
kata-context graph dependencies AppService
kata-context graph symbols src/service.ts

# 5. Search code
kata-context grep "TODO|FIXME"
kata-context find "user service"
```

Always run `index` first — graph and search commands need an indexed database. Memory commands (`remember`, `recall`, `forget`, `consolidate`) work independently of the index — they store memories as markdown files in `.kata/memory/`.

## Global Options

All commands support these flags:

| Flag | Description |
|------|-------------|
| `--json` | Output structured JSON (for programmatic parsing) |
| `--quiet` | Minimal output — names/paths only, one per line |
| `--db <path>` | Path to SQLite database (default: `.kata/index/graph.db`) |

When neither `--json` nor `--quiet` is set, output is human-readable with formatted tables and headers.

## Commands

### `kata-context index [path]`

Index a project directory into the knowledge graph. Parses all TypeScript and Python files, extracts symbols and cross-file relationships (imports, calls, inheritance), and stores them in SQLite.

Supports **incremental indexing**: after the first full index, subsequent runs only process files changed since the last indexed git commit. Use `--full` to force a complete re-index.

```bash
kata-context index .
kata-context index /path/to/project
kata-context index . --json
kata-context index . --full          # Force full re-index
```

**Output (human):**
```
Index Complete
──────────────
  Files indexed      : 42
  Symbols extracted   : 187
  Edges created       : 324
  Duration            : 1250ms
  Database            : .kata/index/graph.db
```

**Output (JSON):**
```json
{
  "filesIndexed": 42,
  "symbolsExtracted": 187,
  "edgesCreated": 324,
  "duration": 1250,
  "errors": [],
  "dbPath": ".kata/index/graph.db"
}
```

**Output (quiet):** File count only (e.g., `42`).

### `kata-context status`

Show knowledge graph statistics — symbol count, edge count, file count, and last indexed git SHA.

```bash
kata-context status
kata-context status --json
```

**Output (JSON):**
```json
{
  "symbols": 187,
  "edges": 324,
  "files": 42,
  "lastIndexedSha": "abc1234",
  "dbPath": ".kata/index/graph.db"
}
```

### `kata-context graph dependents <symbol>`

Find all symbols that depend on the given symbol — everything that imports, calls, or references it.

```bash
kata-context graph dependents UserService
kata-context graph dependents createConfig --json
```

**Output (human):**
```
Dependents of createConfig
──────────────────────────
  Symbol       Kind      Relationship  File              Line
  BaseService  class     calls         src/service.ts    8
  run          function  calls         src/consumer.ts   7
```

**Output (JSON):**
```json
{
  "symbol": { "name": "createConfig", "kind": "function", "file": "src/utils.ts", "line": 7 },
  "dependents": [
    { "name": "BaseService", "kind": "class", "relationship": "calls", "file": "src/service.ts", "line": 8 }
  ]
}
```

**Output (quiet):** Symbol names only, one per line.

### `kata-context graph dependencies <symbol>`

Find all symbols that the given symbol depends on — everything it imports, calls, or references.

```bash
kata-context graph dependencies AppService
kata-context graph dependencies run --json
```

### `kata-context graph symbols <file>`

List all symbols defined in a file with their kinds, line ranges, export status, and edge counts.

```bash
kata-context graph symbols src/service.ts
kata-context graph symbols src/types.ts --json
```

**Output (human):**
```
Symbols in src/service.ts
─────────────────────────
  Name          Kind       Lines   Exported  In  Out
  BaseService   class      6-16    yes       2   1
  AppService    class      19-42   yes       3   2
```

**Output (JSON):**
```json
{
  "file": "src/service.ts",
  "symbols": [
    { "name": "BaseService", "kind": "class", "lineStart": 6, "lineEnd": 16, "exported": true, "incomingEdges": 2, "outgoingEdges": 1 }
  ]
}
```

### `kata-context grep <pattern>`

Search code using ripgrep with structured output. Supports regex patterns.

```bash
kata-context grep "TODO|FIXME"
kata-context grep "import.*from" --glob "*.ts" --context 2
kata-context grep "class.*Service" --json --max-results 20
```

**Options:**

| Option | Description |
|--------|-------------|
| `--glob <pattern>` | File glob filter (repeatable) |
| `--context <n>` | Context lines before and after each match |
| `--case-sensitive` | Force case-sensitive search |
| `--max-results <n>` | Maximum number of matches |

**Output (JSON):**
```json
{
  "pattern": "TODO",
  "matches": [
    { "file": "src/service.ts", "line": 15, "column": 3, "matchText": "TODO", "lineContent": "  // TODO: add retry logic" }
  ],
  "totalMatches": 1
}
```

**Output (quiet):** `file:line` pairs, one per line.

**Note:** Requires `rg` (ripgrep) to be installed. If not found, the command exits with a helpful error message.

### `kata-context search <query>`

Semantic search over indexed symbol embeddings. Embeds your natural-language query and finds the most similar symbols by vector distance. Requires `OPENAI_API_KEY` and a prior `index` run with semantic embeddings.

Use `search` when you know *what* you're looking for but not *where* it is — e.g., "authentication handling", "database connection pooling", "error retry logic". For exact pattern matching, use `grep`. For symbol name matching, use `find`.

```bash
kata-context search "authentication handling"
kata-context search "error recovery patterns" --top-k 5
kata-context search "database connection" --kind function --json
kata-context search "rate limiting" --quiet
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--top-k <n>` | Maximum number of results to return | `10` |
| `--kind <kind>` | Filter results by symbol kind (`function`, `class`, `method`, `interface`, `typeAlias`, `enum`, `module`, `variable`) | all kinds |

**Output (human):**
```
Semantic Search: "authentication handling"
──────────────────────────────────────────
  Model          text-embedding-3-small
  Total vectors  187
  Results shown  3

  #  Score   Name               Kind      File                   Lines
  ─  ─────   ────               ────      ────                   ─────
  1  0.8734  authenticateUser   function  src/auth.ts            10-30
  2  0.7621  UserService        class     src/services/user.ts   5-80
  3  0.6543  handleLogin        function  src/routes/login.ts    15-45
```

**Output (JSON):**
```json
{
  "query": "authentication handling",
  "results": [
    {
      "rank": 1,
      "score": 0.8734,
      "distance": 0.1449,
      "symbol": {
        "id": "abc123",
        "name": "authenticateUser",
        "kind": "function",
        "filePath": "src/auth.ts",
        "lineStart": 10,
        "lineEnd": 30,
        "signature": "function authenticateUser(token: string): Promise<User>",
        "summary": "Validates a JWT token and returns the authenticated user"
      }
    }
  ],
  "model": "text-embedding-3-small",
  "totalVectors": 187,
  "totalResults": 1
}
```

**Output (quiet):** `filePath:lineStart` pairs, one per line (e.g., `src/auth.ts:10`).

**Error handling:**

| Error | Cause | Fix |
|-------|-------|-----|
| `SEMANTIC_SEARCH_EMPTY_INDEX` | No semantic vectors indexed | Run `kata-context index .` with `OPENAI_API_KEY` set |
| `SEMANTIC_OPENAI_MISSING_KEY` | `OPENAI_API_KEY` not set | Set the environment variable |
| `SEMANTIC_SEARCH_MODEL_MISMATCH` | Config model differs from indexed model | Re-index with `kata-context index . --full` |

### `kata-context remember <content>`

Store a persistent memory entry as a markdown file with YAML frontmatter in `.kata/memory/`. Each mutation produces a git commit for audit trail.

Use `remember` to persist decisions, patterns, learnings, and architecture notes that should survive across sessions. Prefer `remember` over ad-hoc notes — memories are searchable via `recall`.

```bash
kata-context remember "Always use snake_case for DB columns"
kata-context remember "Auth uses JWT with 1h expiry" --category decision --tags "auth,jwt"
kata-context remember "Retry with exponential backoff for API calls" --category pattern --source "src/api.ts"
kata-context remember "SQLite FTS5 requires rebuild after schema changes" --json
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--category <cat>` | Category: `decision`, `pattern`, `learning`, `architecture`, etc. | `learning` |
| `--tags <tags>` | Comma-separated tags for filtering | (none) |
| `--source <refs>` | Comma-separated source file references | (none) |

**Output (JSON):**
```json
{
  "id": "a1b2c3d4",
  "category": "decision",
  "tags": ["auth", "jwt"],
  "createdAt": "2026-03-23T10:00:00.000Z",
  "sourceRefs": [],
  "content": "Auth uses JWT with 1h expiry"
}
```

**Output (quiet):** Memory ID only (e.g., `a1b2c3d4`).

### `kata-context recall <query>`

Semantically search stored memories by natural language query. Embeds the query and finds nearest memory vectors by similarity. Requires `OPENAI_API_KEY`.

Use `recall` when you need to find previously stored decisions, patterns, or learnings — e.g., "what did we decide about auth?", "database patterns", "error handling approach".

```bash
kata-context recall "authentication decisions"
kata-context recall "database patterns" --top-k 3
kata-context recall "error handling" --category pattern --json
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `--top-k <n>` | Number of results to return | `5` |
| `--category <cat>` | Filter results by memory category | all categories |

**Output (JSON):**
```json
{
  "query": "authentication decisions",
  "results": [
    {
      "rank": 1,
      "id": "a1b2c3d4",
      "similarity": 0.8734,
      "distance": 0.1449,
      "category": "decision",
      "tags": ["auth", "jwt"],
      "content": "Auth uses JWT with 1h expiry"
    }
  ],
  "totalResults": 1
}
```

**Output (quiet):** `<id>: <truncated content>` per line.

**Error handling:**

| Error | Cause | Fix |
|-------|-------|-----|
| `MEMORY_RECALL_EMPTY` | No memories stored | Use `remember` to store some memories first |
| `MEMORY_RECALL_MISSING_KEY` | `OPENAI_API_KEY` not set | Set the environment variable |

### `kata-context forget <id>`

Delete a memory entry by its ID.

```bash
kata-context forget a1b2c3d4
kata-context forget a1b2c3d4 --json
```

**Output (JSON):**
```json
{ "id": "a1b2c3d4", "deleted": true }
```

### `kata-context consolidate <ids...>`

Merge multiple related memories into a single distilled entry. The originals are deleted and a new consolidated memory is created. Requires at least 2 memory IDs.

```bash
kata-context consolidate a1b2c3d4 e5f6g7h8
kata-context consolidate a1b2c3d4 e5f6g7h8 i9j0k1l2 --json
```

**Output (JSON):**
```json
{
  "id": "m3n4o5p6",
  "mergedCount": 2,
  "category": "learning",
  "tags": ["consolidated", "auth"],
  "content": "[decision] Auth uses JWT...\n\n[pattern] Retry with backoff..."
}
```

### `kata-context find <query>`

Fuzzy search for symbols and files by name using FTS5 full-text search.

```bash
kata-context find "user service"
kata-context find "config" --kind interface
kata-context find "app" --limit 5 --json
```

**Options:**

| Option | Description |
|--------|-------------|
| `--kind <kind>` | Filter by symbol kind (function, class, interface, type, enum, method) |
| `--limit <n>` | Maximum number of results |

**Output (JSON):**
```json
{
  "query": "config",
  "results": [
    { "name": "Config", "kind": "interface", "file": "src/types.ts", "lineStart": 1, "lineEnd": 4, "exported": true }
  ],
  "totalResults": 1
}
```

## Workflow Tips

1. **Always index first.** Run `kata-context index .` before querying. All commands need an indexed database.
2. **Use `status` to check health.** Verify the index is current before relying on query results.
3. **Choose the right search:**
   - `search` — when you know the *intent* ("find error handling code") but not the name
   - `find` — when you know part of a symbol/file *name* ("user service")
   - `grep` — when you know the exact *pattern* ("TODO|FIXME")
4. **Combine search + graph for full picture.** Use `search` to find relevant symbols by meaning, then `graph dependents` to understand impact.
5. **Use `--json` for parsing.** When chaining commands or processing output programmatically, always use `--json`.
6. **Use `--quiet` for scripting.** When you only need a list of names or paths, `--quiet` gives clean output.
7. **Re-index after significant changes.** The index is a snapshot — re-index when files have changed.
8. **Set `OPENAI_API_KEY` for semantic features.** Without it, `index` still works (structural only) but `search` and `recall` won't.
9. **Use `remember` for durable knowledge.** Persist decisions, patterns, and learnings. They survive across sessions and are searchable via `recall`.
10. **Memory has a git audit trail.** Every `remember`, `forget`, and `consolidate` creates a git commit in the project repo. Use `git log` to see memory mutation history.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `No database found` | Index hasn't been run yet | Run `kata-context index .` first |
| `No semantic vectors indexed` | Index was run without `OPENAI_API_KEY` | Set `OPENAI_API_KEY` and run `kata-context index .` |
| `OPENAI_API_KEY` missing | Key not set in environment | `export OPENAI_API_KEY=sk-...` |
| `Model mismatch` | Embedding model changed since last index | Run `kata-context index . --full` to re-index |
| `Symbol not found` | Symbol name doesn't match any indexed symbol | Check spelling, use `find` to search by partial name |
| `ripgrep (rg) is not installed` | `grep` command requires ripgrep | Install: `brew install ripgrep` or `apt install ripgrep` |
| `path does not exist` | The specified project path doesn't exist | Check the path argument to `index` |
| `MEMORY_RECALL_EMPTY` | No memories stored yet | Use `remember` to store memories first |
| `MEMORY_RECALL_MISSING_KEY` | `OPENAI_API_KEY` not set for recall | Set the environment variable |
| `MEMORY_FILE_NOT_FOUND` | Memory ID doesn't exist | Check the ID with `recall` or list memories |
| `MEMORY_CONSOLIDATE_TOO_FEW` | Need at least 2 IDs to consolidate | Provide 2+ memory IDs |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error or no results found |
