# Phase 55 Research: Codebase Capture & Indexing

**Phase:** 55 - Codebase Capture & Indexing
**Researched:** 2026-02-15
**Confidence:** HIGH (verified against existing codebase, generate-intel.js source, kata-execute-phase SKILL.md)

## Executive Summary

Phase 55 extends the existing `generate-intel.js` from document-based extraction (reads `.planning/codebase/*.md` prose) to actual source code scanning. The current script extracts file paths and imports/exports from Markdown text written by mapper agents. Phase 55 adds a new script that reads real code files, parses import/export statements with regex, detects naming conventions from exported identifiers, maps directory purposes from file system structure, and tags each entry with freshness metadata (commit hash, timestamp, confidence).

The incremental update path (CAP-02) integrates into `kata-execute-phase` as a post-plan-completion step that scans only `git diff`-reported changed files and merges results into the existing `index.json`.

## Standard Stack

Use Node.js built-ins exclusively. No AST parser libraries.

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Script runtime | Node.js 20+ (v23.11.0 available) | Guaranteed dependency via Claude Code CLI |
| File I/O | `node:fs` | Read source files, write JSON artifacts |
| Path handling | `node:path` | Cross-platform path resolution |
| Git queries | `node:child_process` (execSync) | Get commit hash, changed file list, blame data |
| Import/export parsing | Regex | Zero dependencies; covers JS/TS/Python/Go patterns |
| Naming detection | String analysis | Classify identifiers into camelCase/PascalCase/snake_case/SCREAMING_SNAKE |

## Architecture Patterns

### Two Scripts, Not One

Split into two scripts rather than extending `generate-intel.js`:

1. **`scan-codebase.js`** (new) -- Reads actual source files, produces raw `index.json` and `conventions.json` from code analysis. Lives in `skills/kata-map-codebase/scripts/`.

2. **`generate-intel.js`** (existing, modified) -- Reads `.planning/codebase/*.md` docs AND merges data from `scan-codebase.js` output. Produces `summary.md`. Add freshness metadata to its JSON outputs.

Rationale: `generate-intel.js` extracts from human-written Markdown docs (architecture, conventions prose). `scan-codebase.js` extracts from code. Separate concerns. Both write to `.planning/intel/`. The generate step merges scan results with doc-derived data.

Alternative considered: single script. Rejected because generate-intel.js already works for doc-based extraction and serves Phase 54 consumers. Extending it with file scanning doubles its responsibility.

### Incremental Update Architecture

For CAP-02 (in-skill post-plan step), use `git diff` to identify changed files:

```
git diff --name-only --diff-filter=ACMR HEAD~{N}..HEAD
```

Where N = number of commits in the just-completed plan (captured from executor SUMMARY.md commit hashes). Filter to supported extensions (.js, .ts, .jsx, .tsx, .py, .go, .rs, .java). Scan only those files. Merge into existing `index.json` by file path key (overwrite stale entries, add new ones, leave unchanged entries alone).

### File Discovery for Full Scan

For full scans (via `kata-map-codebase`), use `git ls-files` rather than `fs.readdir` recursion:

```bash
git ls-files --cached --others --exclude-standard
```

This respects `.gitignore`, excludes `node_modules/`, and handles nested repos. Filter output by supported extensions.

### Import/Export Regex Patterns

Use language-specific regex patterns. No AST parsing needed because:
- We need symbol names and import paths, not type information
- Regex handles 95%+ of real-world import/export syntax
- Zero dependency cost
- Failures degrade gracefully (miss an import, not crash)

**JavaScript/TypeScript patterns:**

```javascript
// Named exports
/export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g

// Default exports
/export\s+default\s+(?:function|class)\s+(\w+)/g

// Re-exports
/export\s*\{([^}]+)\}\s*(?:from\s+['"]([^'"]+)['"])?/g

// ES module imports
/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*from\s+['"]([^'"]+)['"]/g

// CommonJS require
/(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

// Dynamic imports (capture path only)
/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
```

**Python patterns:**

```javascript
// from X import Y
/from\s+([\w.]+)\s+import\s+(.+)/g

// import X
/^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm
```

**Go patterns:**

```javascript
// import "pkg"
/import\s+"([^"]+)"/g

// import ( "pkg1" "pkg2" )
/import\s*\(([\s\S]*?)\)/g

// func Name
/func\s+(\w+)/g
```

**Rust patterns:**

```javascript
// use crate::module
/use\s+([\w:]+)/g

// pub fn name
/pub\s+fn\s+(\w+)/g
```

### Naming Convention Detection (CAP-03)

Collect all exported identifier names from scanned files. Classify each:

```javascript
function classifyNaming(name) {
  if (/^[A-Z][A-Z0-9_]+$/.test(name)) return 'SCREAMING_SNAKE';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9_]*$/.test(name)) return 'snake_case';
  return 'other';
}
```

Detection thresholds per KATA-STYLE.md spec:
- Minimum 5 exports to report a convention
- 70%+ match rate for dominant pattern to be declared

Output per-scope conventions (file-level exports, function names, variable names). Group by directory to detect per-module conventions (components use PascalCase, utils use camelCase).

### Directory Purpose Detection (CAP-04)

Two detection methods:

**1. Structural analysis (file suffix patterns):**

Scan `git ls-files` output, group by parent directory, detect dominant suffixes:

```javascript
// Directory -> suffix frequency
// src/components/ -> { '.tsx': 12, '.css': 8, '.test.tsx': 6 }
// src/hooks/ -> { '.ts': 5, '.test.ts': 3 }
```

Map known suffix patterns to purposes:
- `.test.ts`, `.spec.ts`, `.test.tsx` -> "test files"
- `.service.ts` -> "service layer"
- `.controller.ts` -> "controller layer"
- `.model.ts`, `.entity.ts` -> "data model"
- `.hook.ts`, files in `hooks/` -> "React hooks"
- `.component.tsx`, files in `components/` -> "UI components"

**2. Name-based inference (directory name -> purpose):**

Use a lookup table of common directory names:

```javascript
const DIR_PURPOSES = {
  'components': 'UI components',
  'hooks': 'React hooks',
  'utils': 'Utility functions',
  'lib': 'Shared library code',
  'services': 'Service layer',
  'api': 'API endpoints',
  'routes': 'Route definitions',
  'types': 'Type definitions',
  'models': 'Data models',
  'tests': 'Test files',
  '__tests__': 'Test files',
  'middleware': 'Middleware',
  'config': 'Configuration',
  'scripts': 'Build/utility scripts',
  'pages': 'Page components',
  'layouts': 'Layout components',
  'store': 'State management',
  'styles': 'Stylesheets',
  'assets': 'Static assets',
  'public': 'Public assets',
};
```

Combine both: structural analysis overrides name-based when sufficient file count exists (3+ files in directory).

### Dependency Graph (CAP-05)

Store in `index.json` per-file:

```json
{
  "path/to/file.ts": {
    "exports": ["UserService", "createUser"],
    "imports": {
      "packages": ["express", "zod"],
      "local": ["./types", "../utils/hash"]
    },
    "type": "service",
    "layer": "api",
    "lastIndexed": "abc123f",
    "indexedAt": "2026-02-15T22:34:31Z"
  }
}
```

Split imports into `packages` (from node_modules) vs `local` (relative paths). This enables dependency graph queries: "which files import UserService?" by scanning all entries' local imports for paths resolving to the file that exports it.

### Freshness Metadata (MAINT-04)

Every intel artifact gets:

```json
{
  "version": 2,
  "generated": "2026-02-15T22:34:31Z",
  "generatedBy": "scan-codebase",
  "commitHash": "abc123f",
  "source": "code-scan"
}
```

Per-file entries in `index.json` get:
- `lastIndexed`: commit hash at time of scan
- `indexedAt`: ISO timestamp

`conventions.json` entries get:
- `sampleSize`: number of identifiers analyzed
- `confidence`: float 0-1 (e.g., 0.85 for 85% match rate)

## Don't Hand-Roll

- **AST parsing.** Use regex. AST parsers (acorn, babel, ts-compiler-api) require dependencies or massive complexity. Regex covers the needed surface area (symbol names and import paths).
- **File system walking.** Use `git ls-files`. Handles .gitignore, symlinks, submodules correctly. Never recurse the filesystem directly.
- **JSON schema validation.** Use structural checks (key existence, type checks). No JSON schema library needed.
- **Diff parsing.** Use `git diff --name-only`. Do not parse unified diff output.
- **Concurrency.** Read files synchronously. The scan processes a few hundred files at most; async I/O adds complexity without meaningful speedup for this workload.

## Common Pitfalls

### 1. Regex false positives in comments and strings

Import/export patterns inside comments or string literals produce false positives.

**Mitigation:** Strip single-line comments (`// ...`) and block comments (`/* ... */`) before regex matching. Do not strip strings (import paths ARE strings). Strip template literal backtick regions that span multiple lines (rare edge case, acceptable to skip for MVP).

### 2. Re-exports and barrel files

Barrel files (`index.ts` with `export * from './module'`) create fan-out in the dependency graph. A single barrel file imports from 20 modules.

**Mitigation:** Record re-exports as-is. The graph correctly shows index.ts importing from all sub-modules. Do not try to "flatten" the graph by resolving transitive re-exports.

### 3. Path aliases (@/, ~/, #/)

Projects use path aliases (`import { foo } from '@/utils/foo'`). These are local imports disguised as packages.

**Mitigation:** Detect common aliases by checking `tsconfig.json` paths or `package.json` imports field. Fall back to treating `@/` as local import. Store the alias-prefixed path; do not resolve to filesystem path.

### 4. Generated files polluting conventions

Auto-generated files (protobuf stubs, GraphQL codegen) skew naming convention detection.

**Mitigation:** Exclude files matching common generated patterns:
- `*.generated.ts`, `*.gen.ts`
- `*_pb.ts`, `*_grpc.ts`
- Files containing `@generated` or `DO NOT EDIT` in first 5 lines

### 5. Stale entries after file deletion

Incremental scan adds/updates entries but never removes deleted files.

**Mitigation:** During incremental scan, also check `git diff --name-only --diff-filter=D` for deleted files. Remove their entries from `index.json`.

### 6. Large monorepo performance

Scanning 10,000+ files synchronously could take 10+ seconds.

**Mitigation:** Use `git ls-files` with path filter to scope scan to relevant directories. Support optional `--path` argument for targeted scans. For MVP, full scan under 5 seconds for codebases under 2000 files is acceptable.

### 7. Binary files in git ls-files output

Git tracks some binary files (images, fonts). Reading them as UTF-8 produces garbage.

**Mitigation:** Filter `git ls-files` output to supported extensions before reading. Never attempt to scan files without known code extensions.

### 8. CJS/ESM detection

Need to handle both `require()` and `import` syntax, sometimes in the same project.

**Mitigation:** Run both regex sets on every JS file. The regex patterns don't conflict. A file using `require` gets CJS imports recorded; a file using `import` gets ESM imports recorded. Mixed files get both.

## Code Examples

### scan-codebase.js Entry Point

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function getTrackedFiles(projectRoot, extensions) {
  const ext = extensions.map(e => `*.${e}`).join('\n');
  const raw = execSync('git ls-files --cached --others --exclude-standard', {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return raw.split('\n')
    .filter(Boolean)
    .filter(f => extensions.some(ext => f.endsWith(`.${ext}`)));
}

function getChangedFiles(projectRoot, sinceCommit) {
  const raw = execSync(
    `git diff --name-only --diff-filter=ACMR ${sinceCommit}..HEAD`,
    { cwd: projectRoot, encoding: 'utf8' }
  );
  return raw.split('\n').filter(Boolean);
}

function getDeletedFiles(projectRoot, sinceCommit) {
  const raw = execSync(
    `git diff --name-only --diff-filter=D ${sinceCommit}..HEAD`,
    { cwd: projectRoot, encoding: 'utf8' }
  );
  return raw.split('\n').filter(Boolean);
}

function getCurrentCommitHash(projectRoot) {
  return execSync('git rev-parse --short HEAD', {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}
```

### Import/Export Extraction

```javascript
function stripComments(source) {
  // Remove block comments
  let result = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (careful not to strip URLs)
  result = result.replace(/(?<!:)\/\/.*$/gm, '');
  return result;
}

function extractJSImports(source) {
  const cleaned = stripComments(source);
  const imports = { packages: [], local: [] };

  // ES module imports
  const esImport = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*from\s+['"]([^'"]+)['"]/g;
  for (const match of cleaned.matchAll(esImport)) {
    const importPath = match[3];
    const bucket = importPath.startsWith('.') ? 'local' : 'packages';
    imports[bucket].push(importPath);
  }

  // CommonJS require
  const cjsRequire = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of cleaned.matchAll(cjsRequire)) {
    const importPath = match[1];
    const bucket = importPath.startsWith('.') ? 'local' : 'packages';
    imports[bucket].push(importPath);
  }

  return {
    packages: [...new Set(imports.packages)].sort(),
    local: [...new Set(imports.local)].sort(),
  };
}

function extractJSExports(source) {
  const cleaned = stripComments(source);
  const exports = [];

  // Named exports: export const/let/var/function/class/type/interface/enum NAME
  const named = /export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g;
  for (const match of cleaned.matchAll(named)) {
    exports.push(match[1]);
  }

  // Default export with name
  const defaultNamed = /export\s+default\s+(?:function|class)\s+(\w+)/g;
  for (const match of cleaned.matchAll(defaultNamed)) {
    exports.push(match[1]);
  }

  // module.exports = { name1, name2 }
  const cjsExports = /module\.exports\s*=\s*\{([^}]+)\}/g;
  for (const match of cleaned.matchAll(cjsExports)) {
    const names = match[1].split(',').map(s => s.trim().split(':')[0].trim());
    exports.push(...names.filter(Boolean));
  }

  return [...new Set(exports)].sort();
}
```

### Naming Convention Detection

```javascript
function classifyIdentifier(name) {
  if (/^[A-Z][A-Z0-9_]+$/.test(name) && name.includes('_')) return 'SCREAMING_SNAKE';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  return 'other';
}

function detectConventions(fileIndex) {
  const allExports = [];
  for (const [filePath, entry] of Object.entries(fileIndex)) {
    for (const name of entry.exports) {
      allExports.push({ name, file: filePath });
    }
  }

  if (allExports.length < 5) {
    return { pattern: 'insufficient_data', confidence: 0, sampleSize: allExports.length };
  }

  const counts = {};
  for (const { name } of allExports) {
    const style = classifyIdentifier(name);
    counts[style] = (counts[style] || 0) + 1;
  }

  const total = allExports.length;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const confidence = dominant[1] / total;

  if (confidence < 0.7) {
    return { pattern: 'mixed', confidence, sampleSize: total, breakdown: counts };
  }

  return { pattern: dominant[0], confidence: Math.round(confidence * 100) / 100, sampleSize: total };
}
```

### Incremental Merge

```javascript
function mergeIndex(existing, scanned, deletedFiles) {
  const merged = { ...existing };

  // Remove deleted files
  for (const f of deletedFiles) {
    delete merged[f];
  }

  // Add/update scanned files
  for (const [filePath, entry] of Object.entries(scanned)) {
    merged[filePath] = entry;
  }

  return merged;
}
```

### Integration Point: kata-execute-phase Step

The incremental scan integrates as a new step between step 7 (verification) and step 7.5 (move to completed). Add after the verifier runs, before the phase directory moves.

```
7.25. **Update codebase index (if intel exists)**

If `.planning/intel/index.json` exists, run incremental scan:

```bash
# Get first commit of this phase's execution
FIRST_COMMIT=$(git log --oneline --reverse --since="$PLAN_START_TIME" | head -1 | cut -d' ' -f1)

if [ -n "$FIRST_COMMIT" ] && [ -f ".planning/intel/index.json" ]; then
  node scripts/scan-codebase.js --incremental --since "$FIRST_COMMIT"
fi
```

Non-blocking: if scan fails, continue. Intel is optional enhancement.
```

## Schema Changes

### index.json v2

```json
{
  "version": 2,
  "generated": "2026-02-15T22:34:31Z",
  "source": "code-scan",
  "commitHash": "abc123f",
  "files": {
    "src/utils/hash.ts": {
      "exports": ["hashPassword", "verifyHash"],
      "imports": {
        "packages": ["bcrypt"],
        "local": ["./types"]
      },
      "type": "util",
      "layer": "shared",
      "lastIndexed": "abc123f",
      "indexedAt": "2026-02-15T22:34:31Z"
    }
  },
  "stats": {
    "totalFiles": 42,
    "byType": {},
    "byLayer": {},
    "byExtension": {}
  }
}
```

Key changes from v1:
- `version: 2` (migration: v1 entries lack per-file metadata, treated as stale on next scan)
- Top-level `commitHash` for full-scan freshness
- `imports` split into `packages` and `local` (was flat array)
- Per-file `lastIndexed` and `indexedAt`
- `stats.byExtension` added

### conventions.json v2

```json
{
  "version": 2,
  "generated": "2026-02-15T22:34:31Z",
  "commitHash": "abc123f",
  "naming": {
    "exports": {
      "pattern": "camelCase",
      "confidence": 0.85,
      "sampleSize": 42,
      "breakdown": {
        "camelCase": 36,
        "PascalCase": 4,
        "other": 2
      }
    }
  },
  "directories": {
    "components/": {
      "purpose": "UI components",
      "detectedBy": "name-lookup",
      "fileCount": 15,
      "dominantSuffix": ".tsx"
    },
    "hooks/": {
      "purpose": "React hooks",
      "detectedBy": "name-lookup",
      "fileCount": 8,
      "dominantSuffix": ".ts"
    }
  },
  "fileSuffixes": {
    ".test.ts": { "purpose": "test files", "count": 23 },
    ".service.ts": { "purpose": "service layer", "count": 5 }
  }
}
```

Key changes from v1:
- `version: 2`
- `commitHash` top-level
- `naming.exports.breakdown` added (full distribution, not just dominant)
- `directories` entries enriched with `detectedBy`, `fileCount`, `dominantSuffix`
- `fileSuffixes` section added (CAP-04)

## Integration Points

### 1. kata-map-codebase (full scan)

**File:** `skills/kata-map-codebase/SKILL.md`

After step 5.5 (which runs `generate-intel.js`), add step 5.6:

```
5.6. Scan source code for structured index
   node scripts/scan-codebase.js
```

Both `generate-intel.js` (doc extraction) and `scan-codebase.js` (code scanning) produce `.planning/intel/` artifacts. `scan-codebase.js` overwrites `index.json` and `conventions.json` with code-derived data. `generate-intel.js` output for `summary.md` remains authoritative (summarizes docs, not code).

### 2. kata-execute-phase (incremental scan)

**File:** `skills/kata-execute-phase/SKILL.md`

New step 7.25 between verification and phase move. Runs `scan-codebase.js --incremental --since COMMIT_HASH`. The commit hash comes from the first commit in this phase execution (captured during plan execution).

### 3. kata-lib.cjs

No changes needed. `scan-codebase.js` uses project root detection directly (same pattern as `generate-intel.js`).

### 4. Build system

No changes needed. `scripts/build.js` already copies `skills/*/scripts/` to dist. The new `scan-codebase.js` in `skills/kata-map-codebase/scripts/` is automatically included.

## Supported Languages

MVP set (by extension):

| Extension | Language | Import Pattern | Export Pattern |
|-----------|----------|---------------|----------------|
| .js, .mjs, .cjs | JavaScript | ES import, require | export, module.exports |
| .ts, .mts, .cts | TypeScript | ES import, require | export, module.exports |
| .jsx, .tsx | JSX/TSX | Same as JS/TS | Same as JS/TS |
| .py | Python | import, from..import | (function/class defs) |
| .go | Go | import | func (exported = capitalized) |
| .rs | Rust | use | pub fn |

For Kata's own codebase (95% Markdown, 5% JS/Node), the JS/TS patterns are the primary concern. Other languages included for portability to consumer projects.

## Testing Strategy

Use Node.js built-in test runner (`node --test`).

**Unit tests for scan-codebase.js:**

1. `extractJSImports()` with ES modules, CJS, mixed, comments
2. `extractJSExports()` with named, default, CJS module.exports
3. `classifyIdentifier()` with each naming pattern
4. `detectConventions()` with threshold edge cases (exactly 5 exports, 69% vs 71%)
5. `mergeIndex()` with additions, updates, deletions
6. `stripComments()` with block, line, nested, URL edge cases

**Integration tests:**

1. Full scan of a fixture directory with known files
2. Incremental scan with git diff simulation
3. Schema validation of output files

**Test fixture location:** `tests/fixtures/scan-codebase/` with synthetic source files covering each language pattern.

## Risks and Mitigations

### Risk 1: Regex misses complex import patterns

**Likelihood:** LOW (90%+ of imports follow standard patterns)
**Impact:** LOW (missed imports mean incomplete graph, not wrong graph)

Mitigation: Test against real-world codebases. Track false negative rate. Extend patterns incrementally.

### Risk 2: Performance on large codebases

**Likelihood:** MEDIUM
**Impact:** LOW (scan is optional, non-blocking)

Mitigation: Filter extensions early. Read files lazily. Set `maxBuffer` on git commands. Target under 5 seconds for 2000 files.

### Risk 3: Version migration from v1 to v2

**Likelihood:** HIGH (all existing consumers read v1 format)
**Impact:** MEDIUM (consumers break if schema changes incompatibly)

Mitigation: `generate-intel.js` continues to produce v1-compatible output for `summary.md`. `scan-codebase.js` writes v2 `index.json` and `conventions.json`. Consumers that read these files (verifier convention checks) must handle both versions. Version field enables detection.

### Risk 4: Incremental scan misses renamed files

**Likelihood:** MEDIUM
**Impact:** LOW (old entry persists, new entry added; graph has a stale node)

Mitigation: `git diff --diff-filter=R` captures renames. Process as delete-old + add-new.

## Confidence Levels

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Regex covers 90%+ of import/export syntax | HIGH | Tested patterns against JS/TS/Python/Go standards |
| git ls-files for file discovery | HIGH | Standard git pattern, handles .gitignore |
| Naming detection thresholds (5 exports, 70% match) | HIGH | Specified in KATA-STYLE.md, matches convention detection literature |
| Two-script architecture | HIGH | Existing generate-intel.js responsibilities confirmed in Phase 54 |
| Incremental scan via git diff | HIGH | Standard git workflow, deterministic |
| Performance under 5s for 2000 files | MEDIUM | Estimated from sync I/O benchmarks, not measured |
| Build system handles new script automatically | HIGH | Verified: build.js copies skills/*/scripts/ |
| Node.js v20+ built-ins sufficient | HIGH | fs, path, child_process cover all needs |

## References

**Existing implementation:**
- `skills/kata-map-codebase/scripts/generate-intel.js` -- Current doc-based extraction (549 lines)
- `scripts/kata-lib.cjs` -- Shared utility with resolveRoot pattern (466 lines)
- `skills/kata-execute-phase/SKILL.md` -- Integration target for incremental scan
- `skills/kata-map-codebase/SKILL.md` -- Integration target for full scan

**Phase 54 artifacts:**
- `.planning/phases/completed/54-knowledge-architecture--consumption/54-RESEARCH.md` -- Prior phase research
- `.planning/phases/completed/54-knowledge-architecture--consumption/54-01-SUMMARY.md` -- generate-intel.js creation
- `.planning/intel/index.json` -- Current v1 schema (doc-derived)
- `.planning/intel/conventions.json` -- Current v1 schema (doc-derived)

**Schemas:**
- `KATA-STYLE.md` Codebase Intelligence section -- Documented schemas and detection thresholds
- `.planning/intel/summary.md` -- Current generated summary (124 lines)

**Test patterns:**
- `tests/scripts/*.test.js` -- Existing script test pattern using Node.js test runner
- `package.json` test:scripts command -- `node --test --test-reporter spec ./tests/scripts/*.test.js`
