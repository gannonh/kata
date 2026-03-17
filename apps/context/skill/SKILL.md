---
name: kata-context
description: Structural codebase intelligence — index TypeScript and Python repos into a knowledge graph, query symbol dependencies, search code patterns, and fuzzy-find symbols. Use when you need to understand code structure, find what depends on a symbol, trace what a symbol depends on, list symbols in a file, search for code patterns, or find symbols by name.
---

# kata-context

Structural codebase intelligence for AI coding agents. Indexes TypeScript and Python repositories into a SQLite knowledge graph, then exposes graph queries, pattern search, and fuzzy symbol lookup via CLI commands.

## When to Use

Use `kata-context` when you need to:

- **Understand code structure** — what symbols exist in a file, what calls what, what imports what
- **Find dependents** — "what will break if I change this function/class?"
- **Trace dependencies** — "what does this symbol depend on?"
- **Search for patterns** — grep for TODOs, error handling patterns, specific API calls
- **Find symbols by name** — fuzzy-match when you know part of a symbol or file name
- **Check index health** — see how many symbols/edges are indexed, when last indexed

## Prerequisites

- **Node.js** ≥ 20
- **ripgrep** (`rg`) — required for the `grep` command. Install via `brew install ripgrep` or your package manager. All other commands work without it.

## Quick Start

```bash
# 1. Index the current project
kata-context index .

# 2. Check what's indexed
kata-context status

# 3. Query the graph
kata-context graph dependents UserService
kata-context graph dependencies AppService
kata-context graph symbols src/service.ts

# 4. Search code
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
3. **Combine grep + graph for full picture.** Use `grep` to find where a pattern appears, then `graph dependents` to understand impact.
4. **Use `--json` for parsing.** When chaining commands or processing output programmatically, always use `--json`.
5. **Use `--quiet` for scripting.** When you only need a list of names or paths, `--quiet` gives clean output.
6. **Re-index after significant changes.** The index is a snapshot — re-index when files have changed.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `No database found` | Index hasn't been run yet | Run `kata-context index .` first |
| `Symbol not found` | Symbol name doesn't match any indexed symbol | Check spelling, use `find` to search by partial name |
| `ripgrep (rg) is not installed` | `grep` command requires ripgrep | Install: `brew install ripgrep` or `apt install ripgrep` |
| `path does not exist` | The specified project path doesn't exist | Check the path argument to `index` |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error or no results found |
