---
name: kata-context
description: Structural and semantic codebase intelligence — index TypeScript and Python repos into a knowledge graph with vector embeddings, query symbol dependencies, run semantic search by intent, search code patterns, and fuzzy-find symbols. Use when you need to understand code structure, find what depends on a symbol, trace dependencies, search by meaning ("find authentication handling"), search for code patterns, or find symbols by name.
---

# kata-context

Structural and semantic codebase intelligence for AI coding agents. Indexes TypeScript and Python repositories into a SQLite knowledge graph with optional vector embeddings, then exposes graph queries, semantic search, pattern search, and fuzzy symbol lookup via CLI commands.

## When to Use

Use `kata-context` when you need to:

- **Search by intent** — "find the authentication handler", "where is rate limiting implemented?" (semantic search)
- **Understand code structure** — what symbols exist in a file, what calls what, what imports what
- **Find dependents** — "what will break if I change this function/class?"
- **Trace dependencies** — "what does this symbol depend on?"
- **Search for patterns** — grep for TODOs, error handling patterns, specific API calls
- **Find symbols by name** — fuzzy-match when you know part of a symbol or file name
- **Check index health** — see how many symbols/edges are indexed, when last indexed

## Prerequisites

- **Node.js** ≥ 20
- **ripgrep** (`rg`) — required for the `grep` command. Install via `brew install ripgrep` or your package manager. All other commands work without it.
- **OPENAI_API_KEY** — required for `search` (semantic search) and for generating embeddings during `index`. Set in your environment.

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

Always run `index` first — all other commands query the indexed knowledge graph.

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
8. **Set `OPENAI_API_KEY` for semantic features.** Without it, `index` still works (structural only) but `search` won't.

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

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error or no results found |
