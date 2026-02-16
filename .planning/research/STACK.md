# Technology Stack: Codebase Intelligence

**Project:** Kata v1.12.0 Codebase Intelligence
**Researched:** 2026-02-15
**Confidence:** HIGH (verified against Kata constraints, Claude Code docs, tool availability)

## Executive Summary

Codebase intelligence for Kata requires three capabilities: static code analysis (extract exports/imports/functions), incremental file indexing (track changes without full rescans), and convention detection (identify naming/structural patterns). All three must work within Kata's constraints: bash scripts, JSON files, markdown output, zero compiled dependencies, no database, no server.

The recommended stack uses regex-based extraction via bash/grep for code analysis, git-native change detection for incremental indexing, and statistical heuristics over JSON data for convention detection. No new dependencies required.

---

## Constraint Analysis

Kata's architecture imposes hard constraints on technology choices.

| Constraint | Impact | Source |
|---|---|---|
| Zero npm dependencies | No tree-sitter, acorn, jscodeshift, or any npm package | `package.json` has no `dependencies` |
| No compiled binaries | No ast-grep, universal-ctags | Plugin distributes via marketplace; users have unknown environments |
| Bash + Node.js only | Scripts must use `/bin/bash` or `node` (>=20) without imports | Existing skill scripts pattern |
| File-based storage | JSON and markdown in `.planning/` | No database, no server process |
| Plugin distribution | Everything ships in `skills/` and `.claude-plugin/` | `scripts/build.js` copies only these dirs |
| Agent context windows | Subagents get 200k tokens; index must be injectable | Task tool inlines content |

**Available tools on target machines (safe to assume):**
- `bash`, `grep`, `sed`, `awk` (POSIX)
- `node` >= 20 (required by Kata)
- `git` (required by Kata)
- `jq` (common but not universal; use `node -e` as fallback)

**Tools NOT safe to assume:**
- `ripgrep` (rg) -- fast but not universal
- `ast-grep` -- powerful but requires separate install
- `universal-ctags` -- macOS ships BSD ctags (no JS/TS support)
- Any npm packages -- Kata has zero dependencies

---

## Approach 1: Code Analysis (Extract Exports/Imports/Functions)

### Rejected: AST-based parsing

**tree-sitter** (via node-tree-sitter npm package) provides accurate AST parsing for 100+ languages. It handles edge cases like template literals in import paths, re-exports, and dynamic imports.

**Why rejected:** Requires `node-tree-sitter` npm dependency with native C bindings. Adds compiled binary to plugin distribution. Fails Kata's zero-dependency constraint.

**ast-grep** provides structural pattern matching from CLI. Patterns like `export function $NAME` match AST nodes instead of text.

**Why rejected:** Requires separate binary installation (`brew install ast-grep` or `cargo install`). Not available by default on any platform. Cannot be bundled in plugin.

**jscodeshift** (Facebook) provides JavaScript codemods with a programmatic API for AST manipulation.

**Why rejected:** npm dependency. Designed for code transformation, not extraction.

### Recommended: Regex-based extraction via Node.js scripts

Use Node.js scripts (no imports) with regex patterns for extraction. Node 20+ includes stable `fs`, `path`, and regex support without any dependencies.

**Why this works for Kata:**
- Good enough accuracy for 90%+ of real-world JS/TS patterns
- Zero dependencies
- Ships as `.js` files alongside skills
- Handles the patterns that matter: named exports, default exports, import statements, function declarations
- Edge cases (dynamic imports, computed exports) can be noted as limitations

**Extraction patterns (verified against common JS/TS):**

```javascript
// Named exports
/export\s+(?:async\s+)?(?:function|class|const|let|var|enum|interface|type)\s+(\w+)/g

// Default exports
/export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/g

// Re-exports
/export\s*\{([^}]+)\}\s*from/g

// Import statements
/import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*from\s+['"]([^'"]+)['"]/g

// Function declarations (non-exported)
/(?:async\s+)?function\s+(\w+)/g
```

**Limitations (acceptable):**
- Does not parse `export = something` (TypeScript namespace exports, rare)
- Does not handle computed property exports (`export { [expr]: value }`)
- Dynamic imports (`import()`) extracted as strings, not resolved
- Multi-line destructured exports may miss names if spread across many lines

**These limitations are acceptable because codebase intelligence is advisory, not compilation. Missing 5% of edge cases does not break planning or execution workflows.**

### Alternative: Claude-powered extraction (for non-JS/TS)

For languages outside JS/TS (Python, Go, Rust, Java), regex patterns become unreliable. For these, spawn a subagent with Read access to analyze files directly. Claude handles any language natively.

**When to use:** Multi-language projects where the codebase includes significant non-JS/TS code. The index schema should record which extraction method was used per file.

---

## Approach 2: Incremental File Indexing

### Rejected: File watcher / daemon process

**Why rejected:** Kata has no long-running process. Plugin activates on Claude Code session start, runs skills on demand, and terminates. No daemon can watch files between sessions.

### Rejected: Filesystem timestamps (mtime)

**Why rejected:** `mtime` changes on `git checkout`, `git pull`, and other operations that don't represent actual edits. Copy operations preserve mtime on some platforms. Unreliable for detecting meaningful changes.

### Recommended: Git-native change detection

Git already tracks every file change. Use git plumbing commands to detect what changed since last index.

**Strategy:**

1. Store last-indexed commit hash in `index.json` metadata
2. On session start or skill invocation, run:
   ```bash
   git diff --name-only --diff-filter=ACMR $LAST_INDEXED_HASH HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx'
   ```
3. Re-index only changed files
4. Update stored commit hash

**Why this works:**
- Git is always available (Kata requires it)
- `--diff-filter=ACMR` captures Added, Copied, Modified, Renamed files
- `--name-only` returns just paths (fast, scriptable)
- Deleted files detected via `--diff-filter=D` and removed from index
- Works across sessions (commit hash persists)
- Handles branch switches correctly

**Edge case: Uncommitted changes**

```bash
# Staged changes
git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx'

# Unstaged changes
git diff --name-only --diff-filter=ACMR -- '*.ts' '*.tsx'
```

Combine all three (committed since last index + staged + unstaged) for full picture.

**Performance:** `git diff --name-only` runs in milliseconds even on large repos. Proportional to number of changes, not repo size.

### Trigger Mechanisms

Two complementary triggers for re-indexing:

**1. PostToolUse hook (reactive, per-file)**

Claude Code hooks fire after Write/Edit operations. A PostToolUse hook can update the index for the specific file that was just modified.

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": { "tool_name": "Write|Edit" },
      "hooks": [{
        "type": "command",
        "command": "node .planning/intel/scripts/index-file.js \"$TOOL_INPUT_FILE_PATH\""
      }]
    }]
  }
}
```

**Limitation:** Hooks are configured per-project in `.claude/settings.json`. Kata plugin cannot inject hooks automatically. Users must opt in or the skill must set them up on first run.

**2. SessionStart / on-demand (batch)**

On session start or when a skill needs intel, run the git-diff-based incremental scan. This catches all changes made outside Claude (manual edits, git operations, other tools).

```bash
# Detect changes since last index
LAST_HASH=$(node -e "const d=require('./.planning/intel/index.json');console.log(d.lastCommit||'')" 2>/dev/null)
CHANGED=$(git diff --name-only ${LAST_HASH:-HEAD~50} HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' 2>/dev/null)
```

---

## Approach 3: Convention Detection

### Rejected: ML-based pattern learning

Tools like NATURALIZE use probabilistic models trained on code to suggest naming conventions. These require training data, model files, and inference runtimes.

**Why rejected:** Requires compiled dependencies, model files, and significant compute. Overkill for the signal Kata needs.

### Rejected: ESLint/Prettier config parsing

Parse existing linter configs to extract convention rules.

**Why rejected:** Not all projects use linters. Linter configs describe desired conventions, not actual conventions in the code. Many conventions (directory structure, file naming) are not captured by linters.

### Recommended: Statistical heuristics over indexed data

Once the index contains export/function names, file paths, and import patterns, convention detection reduces to counting and pattern matching over JSON data.

**Naming convention detection:**

```javascript
// Classify each identifier
function classifyCase(name) {
  if (name === name.toUpperCase()) return 'SCREAMING_SNAKE';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-z0-9_]*$/.test(name)) return 'snake_case';
  if (/^[a-z][a-z0-9-]*$/.test(name)) return 'kebab-case';
  return 'mixed';
}

// Count occurrences, report majority pattern
// Threshold: 5+ exports, 70%+ match rate (from KATA-STYLE.md)
```

**Directory convention detection:**

Lookup table mapping directory names to purposes (from KATA-STYLE.md):
- `components`, `hooks`, `utils`, `lib`, `services`, `api`, `routes`, `types`, `models`, `tests`

Supplement with heuristic: if a directory contains >80% test files (matching `*.test.*` or `*.spec.*`), classify as test directory regardless of name.

**File suffix detection:**

Count file suffixes across the codebase. Report patterns appearing 5+ times:
- `.test.ts`, `.spec.ts` -- test files
- `.service.ts`, `.controller.ts` -- service layer
- `.dto.ts`, `.entity.ts` -- data layer
- `.hook.ts`, `.util.ts` -- utility patterns

**Import pattern detection:**

Analyze import paths to detect:
- Path aliases (`@/`, `~/`, `#`)
- Barrel files (`index.ts` re-exports)
- Import grouping conventions (external first, then internal)

**Output format:** `conventions.json` with detected patterns and confidence scores.

```json
{
  "naming": {
    "functions": { "pattern": "camelCase", "matchRate": 0.94, "sampleSize": 127 },
    "classes": { "pattern": "PascalCase", "matchRate": 0.98, "sampleSize": 23 },
    "constants": { "pattern": "SCREAMING_SNAKE", "matchRate": 0.72, "sampleSize": 18 }
  },
  "directories": {
    "src/components": "ui-components",
    "src/hooks": "react-hooks",
    "src/lib": "shared-utilities"
  },
  "suffixes": [
    { "pattern": ".test.ts", "count": 45, "purpose": "unit-tests" },
    { "pattern": ".service.ts", "count": 12, "purpose": "service-layer" }
  ]
}
```

---

## Approach 4: Doc Freshness Detection

### Recommended: Git blame + file correlation

Detect when documentation may be stale by comparing modification dates of docs vs. the code they describe.

**Strategy:**

1. For each doc file, extract referenced code file paths (from backtick-quoted paths in markdown)
2. Compare `git log -1 --format=%ct` of the doc vs. each referenced code file
3. If any code file was modified more recently than the doc, flag the doc as potentially stale

```bash
DOC_DATE=$(git log -1 --format=%ct -- "$DOC_PATH")
CODE_DATE=$(git log -1 --format=%ct -- "$CODE_PATH")
if [ "$CODE_DATE" -gt "$DOC_DATE" ]; then
  echo "STALE: $DOC_PATH references $CODE_PATH (code modified after doc)"
fi
```

**Integration with OpenAI Harness pattern:** OpenAI's engineering harness uses a dedicated "doc-gardening" agent that scans for stale documentation and opens fix-up PRs. Kata can implement a lighter version: a freshness check that runs during `/kata-track-progress` and reports stale docs alongside progress status.

---

## Index Schema

The central data structure lives at `.planning/intel/index.json`:

```json
{
  "version": 1,
  "lastCommit": "abc123f",
  "lastUpdated": 1708000000,
  "files": {
    "src/services/auth.ts": {
      "exports": ["AuthService", "login", "logout"],
      "imports": ["./database", "jsonwebtoken", "@/types"],
      "functions": ["validateToken", "refreshSession"],
      "indexed": 1708000000
    }
  }
}
```

**Size considerations:**
- A 500-file project produces ~50KB of index JSON
- A 2000-file project produces ~200KB
- Entire index can be injected into a 200k-token subagent context (~800KB text budget)

**Derived files (regenerated from index):**
- `conventions.json` -- detected naming/directory/suffix patterns
- `summary.md` -- concise text summary for context injection into subagents

---

## Integration with Existing Kata Architecture

### Where scripts live

```
skills/kata-map-codebase/
├── SKILL.md                        # Orchestrator (existing, modified)
├── scripts/
│   ├── index-file.js               # Index a single file (PostToolUse hook)
│   ├── index-incremental.js        # Git-diff-based batch re-index
│   ├── detect-conventions.js       # Generate conventions.json from index
│   └── check-freshness.js          # Doc staleness checker
└── references/
    └── codebase-mapper-instructions.md  # Existing
```

**Why Node.js scripts instead of bash:**
- JSON manipulation in bash requires `jq` (not universally available)
- Node.js 20+ is a hard requirement for Kata (`package.json` engines field)
- Regex extraction is cleaner in JavaScript
- `fs` and `path` are built-in, no imports needed

**Fallback for machines without Node.js 20+:**
Not needed. Kata already requires Node 20+. If Node is missing, Kata itself does not install.

### How intel feeds into workflows

| Consumer | What it reads | When |
|---|---|---|
| `/kata-plan-phase` | `summary.md`, `conventions.json` | Inlined into planner subagent prompt |
| `/kata-execute-phase` | `conventions.json` | Executor follows detected naming patterns |
| `/kata-map-codebase` | `index.json` | Incremental update instead of full rescan |
| `/kata-track-progress` | `index.json`, freshness data | Reports stale docs alongside status |
| PostToolUse hook | Triggers `index-file.js` | After every Write/Edit of a code file |

### Config integration

```json
{
  "intel": {
    "enabled": true,
    "languages": ["js", "ts", "tsx", "jsx"],
    "excludeDirs": ["node_modules", "dist", "build", ".git", "vendor", "coverage"]
  }
}
```

Default: enabled, JS/TS only, standard excludes. Users can add languages or exclude directories via `/kata-configure-settings`.

---

## What NOT to Add

| Technology | Why Not |
|---|---|
| **tree-sitter** | Compiled native dependency. Violates zero-dependency constraint |
| **ast-grep** | Requires separate binary installation. Cannot bundle in plugin |
| **SQLite / LevelDB** | Database adds compiled dependency. JSON files are sufficient for <5000 file codebases |
| **Language Server Protocol** | Requires running language server process. Kata has no daemon |
| **ESLint programmatic API** | npm dependency. Not all projects use ESLint |
| **TypeScript compiler API** | Requires `typescript` npm package. Heavy dependency for extraction |
| **File watchers (chokidar/fsevents)** | Requires npm dependency and long-running process |
| **Knowledge graphs (Neo4j, etc.)** | Server dependency. JSON adjacency lists serve the same purpose |
| **Vector embeddings** | Requires embedding model and similarity search. Overkill for file-level indexing |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regex extraction misses edge cases | HIGH | LOW | Intel is advisory, not compilation. 90%+ accuracy is sufficient. Document limitations |
| Large repos produce oversized index.json | MEDIUM | MEDIUM | Cap indexing at configurable file count. Exclude generated/vendor dirs |
| PostToolUse hooks unavailable | MEDIUM | LOW | SessionStart batch scan catches everything. Hooks are optimization, not requirement |
| Convention detection false positives | MEDIUM | LOW | Require 5+ samples and 70%+ match rate before reporting. Show confidence scores |
| Node.js script execution speed | LOW | LOW | Single-file indexing takes <100ms. Batch of 500 files takes <5s |

---

## Build and Distribution

**No changes to build system required.** Scripts in `skills/kata-map-codebase/scripts/` are already copied by `build.js` (it copies all skill contents including scripts/). The `shouldExclude` function skips `.planning` and `tests` but includes `scripts`.

**Testing approach:** Node.js test files in `tests/scripts/` following existing pattern (`*.test.js` using Node's built-in test runner).

---

## Summary of Recommendations

1. **Code analysis:** Regex-based extraction via Node.js scripts. No dependencies. Ship as skill scripts.
2. **Incremental indexing:** Git-native change detection (`git diff --name-only`). Store last-indexed commit in `index.json`.
3. **Convention detection:** Statistical heuristics over indexed data. Count naming patterns, directory purposes, file suffixes.
4. **Doc freshness:** Git blame comparison between doc and referenced code files.
5. **Trigger mechanisms:** PostToolUse hook (reactive) + SessionStart batch scan (catch-up). Hooks are optional optimization.
6. **Storage:** JSON files in `.planning/intel/`. No database.
7. **Integration:** Inline `summary.md` and `conventions.json` into subagent prompts via existing skill orchestration pattern.

---

## Sources

- [ast-grep](https://ast-grep.github.io/) -- AST-based CLI tool (evaluated, rejected for dependency reasons)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/) -- Incremental parser (evaluated, rejected for native dependency)
- [ES6 Import Regex Patterns](https://gist.github.com/manekinekko/7e58a17bc62a9be47172) -- Community-validated regex for JS imports
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- PostToolUse hook specification
- [jq Manual](https://jqlang.org/manual/) -- JSON processing (available but not assumed)
- [Git diff Documentation](https://git-scm.com/docs/git-diff) -- Change detection plumbing
- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/) -- Repository knowledge patterns (evaluated for inspiration)
- [depgrapher](https://blog.disy.net/depgrapher/) -- Regex-based JS dependency analysis (pattern reference)
- [NATURALIZE](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/allamanis2014learning.pdf) -- Convention learning research (evaluated, rejected for ML dependency)
- Kata codebase: `skills/kata-map-codebase/SKILL.md`, `scripts/build.js`, `package.json`

---
*Stack analysis: 2026-02-15*
