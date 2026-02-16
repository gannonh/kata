# Phase 57: Knowledge Maintenance - Research

**Researched:** 2026-02-16
**Domain:** Codebase intelligence staleness detection, doc gardening, convention enforcement
**Confidence:** HIGH (verified against existing codebase: scan-codebase.cjs, generate-intel.js, executor/verifier instructions, index.json schema)

## Summary

Phase 57 closes the v1.12.0 Codebase Intelligence milestone by adding three maintenance capabilities to the existing intel pipeline: staleness detection (MAINT-01), partial re-analysis triggers (MAINT-02), and convention enforcement during execution (MAINT-03). MAINT-04 (freshness metadata) is already satisfied by Phase 55.

All three requirements integrate into the existing `kata-execute-phase` SKILL.md workflow. The staleness detector and convention checker run as Node.js scripts. Doc gardening is a conditional trigger in the orchestrator that calls existing scripts when staleness exceeds a threshold. No new skills, no new dependencies, no architectural changes.

**Primary recommendation:** Build two new scripts (`detect-stale-intel.cjs` and `check-conventions.cjs`) that run during phase execution step 7.25. Extend the orchestrator logic in SKILL.md to trigger partial re-analysis when staleness is detected.

## Standard Stack

Use Node.js built-ins exclusively. Same pattern as scan-codebase.cjs and update-intel-summary.cjs.

### Core

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Script runtime | Node.js (child_process, fs, path) | Guaranteed dependency, matches existing scripts |
| Git queries | `execSync` with git CLI | Same pattern as scan-codebase.cjs |
| Convention data | `.planning/intel/conventions.json` | Already produced by scan-codebase.cjs |
| File index | `.planning/intel/index.json` | Already has per-file `lastIndexed` commit hashes |

### Supporting

| Component | Purpose | When Used |
|-----------|---------|-----------|
| scan-codebase.cjs | Re-scan stale files | Called by orchestrator when staleness detected |
| update-intel-summary.cjs | Regenerate summary.md | Called after re-scan (greenfield path) |
| generate-intel.js | Regenerate summary.md | Called after doc gardening (brownfield path) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|----------|----------|
| Per-file git log | Single `git diff --name-only` | Batch is O(1) git commands vs O(n); use batch as primary, per-file as fallback for mixed lastIndexed commits |
| git blame per-line | `git log` per-file | git blame is too slow for bulk checks; `git log {commit}..HEAD -- {file}` is sufficient and fast |
| AST-based convention check | Regex on export names | Regex matches existing scan-codebase.cjs pattern; AST is out of scope per REQUIREMENTS.md |

## Architecture Patterns

### Script Placement

```
skills/kata-map-codebase/scripts/
├── scan-codebase.cjs          # Existing - full and incremental scan
├── generate-intel.js          # Existing - brownfield summary generation
└── detect-stale-intel.cjs     # NEW - staleness detection

skills/kata-execute-phase/scripts/
├── update-intel-summary.cjs   # Existing - greenfield summary generation
└── check-conventions.cjs      # NEW - convention enforcement
```

Rationale: `detect-stale-intel.cjs` lives with mapping scripts because it's about the intel pipeline. `check-conventions.cjs` lives with execution scripts because it runs during plan execution.

### Staleness Detection Flow (MAINT-01)

```
detect-stale-intel.cjs
  1. Read .planning/intel/index.json
  2. Extract per-file lastIndexed commit hashes
     (fall back to top-level commitHash for entries without lastIndexed)
  3. Find oldest baseline commit across all entries
  4. Run: git diff --name-only {oldest_baseline}..HEAD
  5. Intersect changed files with indexed file paths
  6. Output JSON: { staleFiles: [...], freshFiles: [...], totalIndexed: N, stalePct: N }
  7. Exit code: 0 = no stale files, 1 = stale files found
```

Performance: A single `git diff` takes ~8ms for this repo. Intersecting with 47 indexed files is negligible. The entire check completes in under 50ms.

For per-file precision when files have different `lastIndexed` values: group files by their lastIndexed commit, run one `git diff` per unique commit, then union the results. Typical case has 1-3 unique commits, so this stays at 2-4 git commands maximum.

### Doc Gardening Trigger (MAINT-02)

Doc gardening activates when staleness exceeds a threshold. The orchestrator in SKILL.md step 7.25 handles the trigger logic:

```
1. Run detect-stale-intel.cjs
2. If stalePct > 0:
   a. For entries WITH lastIndexed (code-scan sourced):
      Run scan-codebase.cjs --incremental --since {oldestStaleCommit}
   b. For entries WITHOUT lastIndexed (doc-based, from generate-intel.js):
      Flag .planning/codebase/ docs as stale (these require /kata-map-codebase re-run)
   c. Update summary.md via the appropriate path:
      - If .planning/codebase/ exists: run generate-intel.js
      - Else: run update-intel-summary.cjs
3. Stage updated intel files for phase commit
```

"Partial re-analysis" means re-scanning only the stale files (incremental mode), not the entire codebase. The existing `--incremental --since` flag on scan-codebase.cjs already supports this.

For doc-based entries (brownfield path), the script can only detect that docs are stale, not fix them. Fixing requires mapper agents (a full `/kata-map-codebase` run). The gardening trigger logs a warning and continues. This matches the REQUIREMENTS.md wording: "triggers partial re-analysis of codebase docs when documented code areas change significantly."

### Convention Enforcement During Execution (MAINT-03)

The requirement specifies "in-skill check, not hook." This means a script that runs inside the executor flow, after task commits. The existing post-task-command mechanism runs user-configured commands. Convention enforcement is a built-in check, separate from that.

**Architecture:**

```
check-conventions.cjs --files file1.ts file2.ts [--conventions .planning/intel/conventions.json]
```

The script:
1. Reads conventions.json (naming patterns, directory purposes, file suffixes)
2. For each input file, extracts exported identifiers using the same regex as scan-codebase.cjs
3. Classifies each identifier (camelCase, PascalCase, snake_case, SCREAMING_SNAKE)
4. Compares against the dominant convention in conventions.json
5. Checks file placement against directory purpose map
6. Outputs violations as structured JSON

**Output format:**
```json
{
  "violations": [
    {
      "file": "src/utils/my_helper.ts",
      "type": "naming",
      "detail": "Export 'get_user_data' is snake_case; codebase convention is camelCase (confidence: 0.85)",
      "severity": "warning"
    },
    {
      "file": "src/components/userCard.ts",
      "type": "file_naming",
      "detail": "File in components/ but name is camelCase; convention expects PascalCase or kebab-case",
      "severity": "info"
    }
  ],
  "checked": 2,
  "passed": 0,
  "conventionSource": "conventions.json v2"
}
```

**Integration point:** The orchestrator calls this script in step 7.25, after the smart scan gate but before the verification step. Violations are logged to stdout and surfaced in the phase completion output. Convention violations are warnings, never blockers. The executor already receives convention guidance in its prompt context; this check catches violations that slipped through.

**Executor-side integration:** The executor subagent already receives `<codebase_intelligence>` in its prompt (lines 88-99 of executor-instructions.md). The convention checker runs at orchestrator level, after all plans in a wave complete. It checks files committed during execution, not files being written in real-time.

### Integration into SKILL.md Step 7.25

The existing step 7.25 ("Update codebase index - smart scan") already runs scan-codebase.cjs. Extend it:

```
Step 7.25 (revised):
  1. [existing] Smart scan gate (greenfield first population or incremental scan)
  2. [NEW] Staleness detection:
     Run detect-stale-intel.cjs
     If stale files found:
       a. Run scan-codebase.cjs --incremental --since {oldest_stale}
       b. If .planning/codebase/ exists AND >30% stale:
          Log warning: ".planning/codebase/ docs may be stale, run /kata-map-codebase"
       c. Regenerate summary.md
  3. [NEW] Convention enforcement:
     Get files changed in this phase: git diff --name-only {phase_start}..HEAD
     Run check-conventions.cjs --files {changed_files}
     Log violations (non-blocking)
```

Both new checks are non-blocking (`|| true`). Failures never prevent phase completion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| File change detection | Custom mtime comparison | `git diff --name-only {commit}..HEAD` | Git is the single source of truth for file changes; mtime is unreliable across clones |
| Import/export extraction | New parsing logic | Reuse/import from scan-codebase.cjs | Already tested for JS/TS/Python/Go/Rust/Java |
| Identifier classification | New classifier | Reuse `classifyIdentifier()` from scan-codebase.cjs | Already tested with camelCase/PascalCase/snake_case/SCREAMING_SNAKE patterns |
| Summary regeneration | New summary logic | Call existing update-intel-summary.cjs or generate-intel.js | Already handles both greenfield and brownfield paths |

## Common Pitfalls

### Pitfall 1: Per-File Git Log at Scale

**What goes wrong:** Running `git log` for each indexed file creates O(n) subprocess spawns.
**Why it happens:** Natural approach is "for each file, check if it changed."
**How to avoid:** Use batch `git diff --name-only {commit}..HEAD` to get all changed files in one command, then intersect with indexed paths.
**Warning signs:** Script takes >1s on repos with 500+ indexed files.

### Pitfall 2: Stale Entries Without lastIndexed

**What goes wrong:** Index entries from generate-intel.js (brownfield, doc-based) don't have per-file `lastIndexed` fields. Only scan-codebase.cjs adds these.
**Why it happens:** Two different indexing sources produce different schemas (v1 from generate-intel.js, v2 from scan-codebase.cjs).
**How to avoid:** Fall back to the top-level `commitHash` when an entry lacks `lastIndexed`. This gives correct (if coarser) staleness detection.
**Warning signs:** Script crashes on entries without `lastIndexed` field.

### Pitfall 3: Convention Enforcement as Blocker

**What goes wrong:** Convention violations block phase completion, frustrating users with false positives.
**Why it happens:** Natural instinct to enforce strictly.
**How to avoid:** Convention checks are warnings only, never blockers. The requirement says "flagging a snake_case function" (informational), not "blocking execution." Match the verifier's existing approach (lines 431-437 of verifier-instructions.md).
**Warning signs:** Users disabling the check or complaining about false positives.

### Pitfall 4: Doc Gardening Overwrites Human Edits

**What goes wrong:** Automatic re-analysis overwrites manual edits to `.planning/codebase/` docs.
**Why it happens:** Running generate-intel.js or mapper agents unconditionally after staleness detection.
**How to avoid:** Doc gardening for `.planning/codebase/` only logs a warning ("docs may be stale, run /kata-map-codebase"). It does NOT automatically rewrite the doc files. Only `scan-codebase.cjs` data (index.json, conventions.json) is updated automatically. Summary.md regeneration is safe because it's derived from these sources.
**Warning signs:** User edits to ARCHITECTURE.md or CONVENTIONS.md disappearing after phase execution.

### Pitfall 5: Convention Check on Non-Code Files

**What goes wrong:** Convention checker runs on .md, .sh, .json files and reports false violations.
**Why it happens:** Using all changed files instead of filtering to supported code extensions.
**How to avoid:** Filter changed files to SUPPORTED_EXTENSIONS from scan-codebase.cjs before passing to check-conventions.cjs. The script should also accept an empty file list gracefully.
**Warning signs:** Violations reported for markdown files or config files.

## Code Examples

### Staleness Detection Core Logic

```javascript
// Source: Verified against scan-codebase.cjs patterns and git CLI behavior
const { execSync } = require('child_process');
const fs = require('fs');

function detectStaleFiles(projectRoot) {
  const indexPath = `${projectRoot}/.planning/intel/index.json`;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const topCommit = index.commitHash;

  // Group files by their lastIndexed commit
  const byCommit = {};
  for (const [filePath, entry] of Object.entries(index.files)) {
    if (filePath.includes('*')) continue; // skip wildcards
    const commit = entry.lastIndexed || topCommit;
    if (!byCommit[commit]) byCommit[commit] = [];
    byCommit[commit].push(filePath);
  }

  // For each unique commit, get changed files in one git diff
  const staleFiles = [];
  for (const [commit, files] of Object.entries(byCommit)) {
    const changedRaw = execSync(
      `git diff --name-only ${commit}..HEAD`,
      { cwd: projectRoot, encoding: 'utf8' }
    ).trim();
    if (!changedRaw) continue;
    const changed = new Set(changedRaw.split('\n'));
    for (const f of files) {
      if (changed.has(f)) staleFiles.push(f);
    }
  }

  return {
    staleFiles,
    totalIndexed: Object.keys(index.files).length,
    stalePct: staleFiles.length / Math.max(Object.keys(index.files).length, 1),
    baselineCommit: topCommit,
  };
}
```

### Convention Check Core Logic

```javascript
// Source: Reuses classifyIdentifier() and extractJSExports() from scan-codebase.cjs
function checkConventions(filePaths, conventionsPath, projectRoot) {
  const conventions = JSON.parse(fs.readFileSync(conventionsPath, 'utf8'));
  const expectedPattern = conventions.naming?.exports?.pattern;
  const confidence = conventions.naming?.exports?.confidence || 0;

  // Skip if no dominant convention or low confidence
  if (!expectedPattern || expectedPattern === 'insufficient_data' || confidence < 0.7) {
    return { violations: [], checked: 0, skipped: 'insufficient convention data' };
  }

  const violations = [];
  for (const filePath of filePaths) {
    const source = fs.readFileSync(`${projectRoot}/${filePath}`, 'utf8');
    const exports = extractExports(source, getLanguage(filePath));

    for (const name of exports) {
      const style = classifyIdentifier(name);
      if (style !== expectedPattern && style !== 'other') {
        violations.push({
          file: filePath,
          type: 'naming',
          export: name,
          found: style,
          expected: expectedPattern,
          severity: 'warning',
        });
      }
    }
  }

  return { violations, checked: filePaths.length, conventionPattern: expectedPattern };
}
```

### Orchestrator Integration (SKILL.md step 7.25 extension)

```bash
# After existing smart scan gate...

# --- Staleness detection (MAINT-01) ---
STALE_SCRIPT=""
[ -f "scripts/detect-stale-intel.cjs" ] && STALE_SCRIPT="scripts/detect-stale-intel.cjs"
[ -z "$STALE_SCRIPT" ] && STALE_SCRIPT=$(find skills/kata-map-codebase/scripts -name "detect-stale-intel.cjs" -type f 2>/dev/null | head -1)

if [ -n "$STALE_SCRIPT" ] && [ -f ".planning/intel/index.json" ]; then
  STALE_OUTPUT=$(node "$STALE_SCRIPT" 2>/dev/null || true)
  STALE_COUNT=$(echo "$STALE_OUTPUT" | grep -o '"staleCount":[0-9]*' | grep -o '[0-9]*' || echo "0")

  if [ "$STALE_COUNT" -gt 0 ]; then
    echo "Detected $STALE_COUNT stale intel entries, triggering re-scan..."
    OLDEST_STALE=$(echo "$STALE_OUTPUT" | grep -o '"oldestStaleCommit":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$OLDEST_STALE" ] && [ -n "$SCAN_SCRIPT" ]; then
      node "$SCAN_SCRIPT" --incremental --since "$OLDEST_STALE" 2>/dev/null || true
    fi
    # Regenerate summary
    if [ -n "$SUMMARY_SCRIPT" ]; then
      node "$SUMMARY_SCRIPT" 2>/dev/null || true
    fi
  fi
fi

# --- Convention enforcement (MAINT-03) ---
CONV_SCRIPT=""
[ -f "scripts/check-conventions.cjs" ] && CONV_SCRIPT="scripts/check-conventions.cjs"
[ -z "$CONV_SCRIPT" ] && CONV_SCRIPT=$(find skills/kata-execute-phase/scripts -name "check-conventions.cjs" -type f 2>/dev/null | head -1)

if [ -n "$CONV_SCRIPT" ] && [ -f ".planning/intel/conventions.json" ]; then
  CHANGED_FILES=$(git diff --name-only "$PHASE_START_COMMIT..HEAD" -- '*.js' '*.ts' '*.tsx' '*.jsx' '*.py' '*.go' '*.rs' '*.java' 2>/dev/null || true)
  if [ -n "$CHANGED_FILES" ]; then
    node "$CONV_SCRIPT" --files $CHANGED_FILES 2>/dev/null || true
  fi
fi
```

## State of the Art

| Existing | Phase 57 Adds | Impact |
|----------|--------------|--------|
| Smart scan (step 7.25) runs after plan completion | Staleness detection before scan decides what to re-scan | Scan targets only stale files instead of all files since phase start |
| Executor receives `<codebase_intelligence>` text guidance | Convention checker validates output against detected patterns | Catches violations that slipped through prompt guidance |
| `.planning/codebase/` docs regenerated only via `/kata-map-codebase` | Staleness warning when docs are stale | Users get notified when docs drift from code |
| `index.json` entries have `lastIndexed` per-file | Staleness uses per-file commits for precision | Avoids unnecessary re-scans of files that haven't changed |

## Open Questions

1. **Threshold for doc gardening warning**
   - What we know: Staleness percentage can be computed (stale files / total indexed)
   - What's unclear: What percentage justifies a warning? 10%? 30%? 50%?
   - Recommendation: Use 30% as default threshold. Below that, stale entries are handled by incremental scan. Above that, the codebase has drifted enough that prose docs likely need updating. This is a warning, not a blocker.

2. **Convention check scope within phase execution**
   - What we know: The check runs at orchestrator level in step 7.25 after all plans complete
   - What's unclear: Should it run after each wave or only after all plans in the phase?
   - Recommendation: Run once after all plans complete (end of step 7.25). Running per-wave adds complexity with minimal benefit since convention violations don't block execution.

3. **Reusing scan-codebase.cjs functions in check-conventions.cjs**
   - What we know: Both scripts need `classifyIdentifier()`, `extractJSExports()`, and language detection
   - What's unclear: Should check-conventions.cjs import from scan-codebase.cjs or duplicate the functions?
   - Recommendation: Import from scan-codebase.cjs. It already exports these functions via `module.exports`. The build system copies scripts to each consumer skill's directory, so the import path needs to account for distribution. Alternatively, move shared functions to `_shared/kata-lib.cjs` or a new shared module.

## Sources

### Primary (HIGH confidence)
- `skills/kata-map-codebase/scripts/scan-codebase.cjs` — File scanning, convention detection, incremental merge logic
- `skills/kata-execute-phase/SKILL.md` step 7.25 — Current smart scan gate integration point
- `skills/kata-execute-phase/references/verifier-instructions.md` lines 422-437 — Existing convention compliance check pattern
- `skills/kata-execute-phase/references/executor-instructions.md` lines 88-99 — Existing codebase intelligence consumption
- `.planning/intel/index.json` — Current schema with per-file `lastIndexed` and `indexedAt` fields
- `.planning/intel/conventions.json` — Current schema with naming patterns and directory purposes

### Verified via testing (HIGH confidence)
- `git diff --name-only {commit}..HEAD` — Batch changed-file detection, ~8ms per invocation
- `git log --oneline {commit}..HEAD -- {file}` — Per-file staleness check, ~5ms per file
- Batch staleness check for 47 files — 265ms total with per-file approach, <50ms with batch approach
- `git merge-base --is-ancestor` — Ancestry check works for commit validity

## Metadata

**Confidence breakdown:**
- Staleness detection (MAINT-01): HIGH — git APIs verified, index.json schema understood, approach benchmarked
- Doc gardening (MAINT-02): HIGH — incremental scan already exists, integration point clear, threshold TBD but defaultable
- Convention enforcement (MAINT-03): HIGH — classifyIdentifier() and extract functions already tested and exported, integration point identified

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain, git APIs don't change)
