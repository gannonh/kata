# Phase 56 Research: Greenfield Integration

## Research Scope

How to make greenfield projects build codebase intel progressively from first code written, without requiring `/kata-map-codebase`.

## Findings

### Current Architecture (How Intel Works Today)

**Brownfield flow (Phase 55):**
1. User runs `/kata-map-codebase` (SKILL.md orchestrator)
2. Spawns 4 parallel mapper agents writing `.planning/codebase/` (7 markdown docs)
3. Runs `generate-intel.js` to produce `.planning/intel/` from those docs (summary.md, index.json, conventions.json - version 1 schema, doc-derived)
4. Runs `scan-codebase.cjs` to overwrite index.json and conventions.json with code-derived data (version 2 schema with per-file imports/exports)

**Incremental updates (Phase 55):**
- `kata-execute-phase` step 7.25 runs `scan-codebase.cjs --incremental --since $COMMIT` after verification
- Gate: only runs if `.planning/intel/index.json` already exists
- Non-blocking: failures are silently ignored

**Consumption:**
- `kata-plan-phase` step 7 reads `.planning/intel/summary.md` and inlines it into the planner prompt as `{intel_summary_content}`
- `kata-execute-phase` wave execution reads `.planning/intel/summary.md` and inlines into executor prompts as `<codebase_intelligence>` block
- Verifier also receives `intel_summary_content` for convention compliance checks
- All consumers gracefully degrade: if `.planning/intel/` does not exist, agents proceed without convention guidance

### Current kata-new-project Flow

**Phase 4 (Write PROJECT.md):**
1. Creates `.planning/` directory
2. Creates `.planning/phases/pending/`, `active/`, `completed/` with .gitkeep files
3. Writes `.planning/PROJECT.md`
4. Commits

**Phase 5 (Workflow Preferences):**
1. Asks 6 config questions
2. Creates `.planning/config.json`
3. Commits

**Phase 6 (Done):**
1. Validation check for required artifacts
2. Completion banner
3. Next step: `/kata-add-milestone`

**Key observation:** `kata-new-project` does NOT create `.planning/intel/`. No intel scaffolding exists for greenfield projects.

### scan-codebase.cjs Capabilities

**Full scan mode (no flags):**
- Uses `git ls-files --cached --others --exclude-standard` to discover all tracked + untracked files
- Filters to supported extensions (js, ts, py, go, rs, java, etc.)
- Extracts imports/exports per file
- Classifies file type (component, service, route, model, config, util, etc.)
- Classifies layer (ui, api, data, shared)
- Detects naming conventions from exports (requires 5+ exports, 70%+ match rate)
- Detects directory purposes from file paths
- Outputs: `index.json` (v2), `conventions.json` (v2)

**Incremental mode (`--incremental --since COMMIT`):**
- Uses `git diff --name-only --diff-filter=ACMR $SINCE..HEAD` for changed files
- Uses `git diff --name-only --diff-filter=D $SINCE..HEAD` for deleted files
- Merges into existing index.json (preserves unchanged entries)
- Updates only changed/new entries

**Does NOT produce:**
- `summary.md` (that comes from `generate-intel.js`, which requires `.planning/codebase/` docs)

### generate-intel.js Dependencies

This script requires `.planning/codebase/` with 7 markdown docs (STACK.md, ARCHITECTURE.md, etc.). These docs are produced by mapper agents during `/kata-map-codebase`.

For greenfield projects, these docs do not exist after first phase execution. The generate-intel.js script will throw: `"Missing codebase docs directory"`.

### The Incremental Scan Gate

`kata-execute-phase` step 7.25:
```
if [ -f ".planning/intel/index.json" ]; then
  # runs incremental scan
fi
```

For greenfield projects, `index.json` does not exist after `/kata-new-project`, so the incremental scan never runs. This is the core problem.

## Standard Stack

No external libraries. All changes are internal to Kata's existing Node.js scripts and SKILL.md files.

**Scripts involved:**
- `scan-codebase.cjs` — already supports full and incremental modes; no modifications needed
- `generate-intel.js` — requires `.planning/codebase/` docs; NOT usable for greenfield (Confidence: HIGH)
- `kata-lib.cjs` — may need a new helper function for creating empty schema files

## Architecture Patterns

### Integration Pattern: Scaffold + Trigger

Two integration points needed:

**1. Scaffold empty intel at project creation (`kata-new-project`):**
- Create `.planning/intel/` directory
- Write empty-schema `index.json` (v2 format, zero files)
- Write empty-schema `conventions.json` (v2 format, empty naming)
- Write minimal `summary.md` (header + "Greenfield project - intel will populate after first phase execution")

**2. Change the gate in `kata-execute-phase` step 7.25:**
- Current: `if [ -f ".planning/intel/index.json" ]` — runs incremental only
- New: if `index.json` exists and has zero or very few files, run FULL scan instead of incremental
- The full scan writes code-derived index.json and conventions.json from actual source files
- After first phase completes, `index.json` gets populated from the code just written

### Empty Schema Design

**index.json (v2, empty):**
```json
{
  "version": 2,
  "generated": "ISO-8601",
  "source": "kata-new-project",
  "generatedBy": "scaffold",
  "commitHash": "none",
  "files": {},
  "stats": {
    "totalFiles": 0,
    "byType": {},
    "byLayer": {},
    "byExtension": {}
  }
}
```

**conventions.json (v2, empty):**
```json
{
  "version": 2,
  "generated": "ISO-8601",
  "commitHash": "none",
  "naming": {
    "exports": {
      "pattern": "insufficient_data",
      "confidence": 0,
      "sampleSize": 0,
      "breakdown": {}
    }
  },
  "directories": {},
  "fileSuffixes": {}
}
```

**summary.md (minimal):**
```markdown
# Codebase Intelligence Summary

Generated: {date} | Source: kata-new-project (greenfield scaffold)

## Stack
- Greenfield project — stack will be detected after first phase execution

## Architecture
- No code written yet

## Conventions
- No conventions detected yet

## Key Patterns
- No patterns detected yet

## Concerns
- No concerns yet
```

### Full-vs-Incremental Decision in Step 7.25

The current step 7.25 always runs `--incremental --since $COMMIT`. For a greenfield project after the first phase, this would require knowing the "start" commit. But the bigger issue is: if `index.json` exists but has 0 files (scaffolded), an incremental scan from the phase start commit would only capture files changed in THIS phase. A full scan captures everything.

**Decision logic:**
1. If `index.json` does not exist → skip (current behavior, no change)
2. If `index.json` exists AND `stats.totalFiles == 0` → run FULL scan (greenfield first population)
3. If `index.json` exists AND `stats.totalFiles > 0` → run incremental scan (existing behavior)

This avoids modifying scan-codebase.cjs itself. The decision is in the SKILL.md orchestrator.

### summary.md Generation Gap

After scan-codebase.cjs runs, `index.json` and `conventions.json` are populated, but `summary.md` still contains the scaffold text. The summary.md is produced by `generate-intel.js`, which requires `.planning/codebase/` docs that greenfield projects do not have.

**Options:**
1. Create a lightweight summary generator that works from index.json + conventions.json (no codebase docs needed)
2. Leave summary.md as scaffold text until user runs `/kata-map-codebase`
3. Have the post-phase scan update summary.md with basic stats from index.json

**Recommendation:** Option 3 as minimum viable. After the full scan populates index.json, append basic stats to summary.md (file count, detected patterns, directory structure). This keeps planners and executors informed even without the full mapper-agent-produced docs. A new Node.js script (`update-intel-summary.cjs`) or extending scan-codebase.cjs with a `--update-summary` flag could handle this.

Confidence: MEDIUM. Option 3 delivers value with minimal scope. Option 1 is more thorough but increases scope.

## Don't Hand-Roll

1. **Don't create new intel schema formats.** Use the existing v2 schema from scan-codebase.cjs output. The empty scaffolds must match exactly.
2. **Don't modify scan-codebase.cjs.** It already handles full scan. The full-vs-incremental decision belongs in the orchestrator (SKILL.md step 7.25).
3. **Don't create a new mapper agent pipeline for greenfield.** The brownfield mapper agents require existing code to analyze. Greenfield intel comes from scan-codebase.cjs (code-derived), not from agents.
4. **Don't duplicate the project-root detection logic.** Both generate-intel.js and scan-codebase.cjs already have `resolveProjectRoot()`. Any new script should reuse the pattern.

## Common Pitfalls

1. **The summary.md gap.** If only index.json and conventions.json are populated but summary.md is still the scaffold text, planners/executors get stale intel for the summary section. The planner reads `summary.md`, not `index.json` directly. Must update summary.md after code scan.
2. **Module format mismatch.** `generate-intel.js` uses ES modules (`import`). `scan-codebase.cjs` uses CommonJS (`require`). Any new script must pick one. Per user preference, use Node.js. Per existing pattern for new scripts, use `.cjs` (CommonJS) since it works without `"type": "module"` in package.json.
3. **Commit ordering.** `kata-new-project` commits PROJECT.md and config.json separately. The intel scaffold must be included in one of these existing commits or get its own commit. Adding it to the Phase 4 `mkdir -p` step (before PROJECT.md commit) keeps it grouped with directory creation.
4. **Stats field naming.** scan-codebase.cjs v2 uses `totalFiles` (camelCase), while generate-intel.js v1 uses `total_files` (snake_case). The empty schema must use `totalFiles` to match v2.
5. **Gate check must parse JSON.** Step 7.25 needs to check `stats.totalFiles` inside index.json. A simple `node -e "..."` one-liner can do this. Avoid bash-only JSON parsing.
6. **generate-intel.js is ESM.** It uses `import.meta.url` and ES module syntax. It cannot be `require()`'d from a CJS script. Keep new scripts as separate CJS files, not as additions to generate-intel.js.

## Code Examples

### Scaffolding in kata-new-project (Phase 4, after mkdir)

```bash
mkdir -p .planning/intel
node scripts/scaffold-intel.cjs
```

Where `scaffold-intel.cjs` writes the three empty-schema files. Alternatively, inline the JSON creation in the SKILL.md process step using `node -e "..."`.

### Modified step 7.25 gate in kata-execute-phase

```bash
if [ -f ".planning/intel/index.json" ]; then
  TOTAL_FILES=$(node -e "const j=JSON.parse(require('fs').readFileSync('.planning/intel/index.json','utf8')); console.log(j.stats?.totalFiles ?? j.stats?.total_files ?? 0)")

  if [ "$TOTAL_FILES" -eq 0 ]; then
    # Greenfield first population: full scan
    SCAN_SCRIPT=""
    [ -f "scripts/scan-codebase.cjs" ] && SCAN_SCRIPT="scripts/scan-codebase.cjs"
    [ -z "$SCAN_SCRIPT" ] && SCAN_SCRIPT=$(find skills/kata-map-codebase/scripts -name "scan-codebase.cjs" -type f 2>/dev/null | head -1)
    if [ -n "$SCAN_SCRIPT" ]; then
      node "$SCAN_SCRIPT" 2>/dev/null || true
    fi
  else
    # Existing codebase: incremental scan
    PHASE_START_COMMIT=$(git log --oneline --all --grep="activate phase" --grep="${PHASE_NUM}" --all-match --format="%H" | tail -1)
    if [ -n "$PHASE_START_COMMIT" ]; then
      SCAN_SCRIPT=""
      [ -f "scripts/scan-codebase.cjs" ] && SCAN_SCRIPT="scripts/scan-codebase.cjs"
      [ -z "$SCAN_SCRIPT" ] && SCAN_SCRIPT=$(find skills/kata-map-codebase/scripts -name "scan-codebase.cjs" -type f 2>/dev/null | head -1)
      if [ -n "$SCAN_SCRIPT" ]; then
        node "$SCAN_SCRIPT" --incremental --since "$PHASE_START_COMMIT" 2>/dev/null || true
      fi
    fi
  fi
fi
```

### Summary update after scan (new script or extension)

```javascript
// update-intel-summary.cjs - generates summary.md from index.json + conventions.json
// Only when .planning/codebase/ does NOT exist (greenfield path)
const fs = require('node:fs');
const path = require('node:path');

function main() {
  const intelDir = path.join(process.cwd(), '.planning', 'intel');
  const indexPath = path.join(intelDir, 'index.json');
  const convPath = path.join(intelDir, 'conventions.json');

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const conventions = JSON.parse(fs.readFileSync(convPath, 'utf8'));

  const fileCount = index.stats?.totalFiles ?? 0;
  if (fileCount === 0) return; // nothing to summarize

  const lines = [
    '# Codebase Intelligence Summary',
    '',
    `Generated: ${new Date().toISOString().slice(0,10)} | Source: code-scan (greenfield)`,
    '',
    '## Stack',
    `- ${fileCount} source files indexed`,
    ...Object.entries(index.stats?.byExtension ?? {}).map(([ext, n]) => `- ${ext}: ${n} files`),
    '',
    '## Architecture',
    ...Object.entries(index.stats?.byLayer ?? {}).map(([layer, n]) => `- ${layer}: ${n} files`),
    '',
    '## Conventions',
    `- Export naming: ${conventions.naming?.exports?.pattern ?? 'unknown'} (confidence: ${conventions.naming?.exports?.confidence ?? 0})`,
    '',
    '## Key Patterns',
    ...Object.entries(conventions.directories ?? {}).slice(0, 10).map(([dir, info]) => `- ${dir} — ${info.purpose}`),
    '',
    '## Concerns',
    '- Auto-generated from code scan. Run /kata-map-codebase for detailed analysis.',
  ];

  fs.writeFileSync(path.join(intelDir, 'summary.md'), lines.join('\n') + '\n');
}

main();
```

## Integration Points Summary

| What | Where | Change Type |
|------|-------|-------------|
| Scaffold `.planning/intel/` with empty schemas | `kata-new-project` SKILL.md Phase 4 | Add mkdir + script call |
| New `scaffold-intel.cjs` script | `skills/kata-new-project/scripts/` | New file |
| Full-vs-incremental gate logic | `kata-execute-phase` SKILL.md step 7.25 | Modify existing |
| Summary update after code scan | `kata-execute-phase` SKILL.md step 7.25 (after scan) | Add script call |
| New `update-intel-summary.cjs` script | `skills/kata-execute-phase/scripts/` or shared | New file |
| Update success criteria | `kata-new-project` SKILL.md | Add intel check |

## Confidence Assessment

| Finding | Confidence |
|---------|------------|
| Empty schema scaffolding approach | HIGH — straightforward file creation, matches existing v2 schema |
| Full-vs-incremental gate in step 7.25 | HIGH — logic is simple, scan-codebase.cjs already supports full mode |
| summary.md update script | MEDIUM — design is clear but scope could expand; keep it minimal |
| No modifications to scan-codebase.cjs | HIGH — it already does what's needed |
| No modifications to generate-intel.js | HIGH — it depends on .planning/codebase/ which greenfield won't have |
| Overall feasibility | HIGH — 2-3 small plans, low risk |
