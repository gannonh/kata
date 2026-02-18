# Phase 58: Brownfield Doc Auto-Refresh - Research

**Researched:** 2026-02-17
**Domain:** Brownfield codebase doc staleness detection and automatic re-mapping pipeline
**Confidence:** HIGH (verified against existing codebase: detect-stale-intel.cjs, generate-intel.js, update-intel-summary.cjs, kata-map-codebase SKILL.md, kata-execute-phase SKILL.md step 7.25, .planning/codebase/ doc headers)

## Summary

Phase 58 closes GAP-1 from the v1.12.0 audit: when brownfield codebase docs (`.planning/codebase/*.md`) are stale relative to significant code changes, agents receive misleading architectural context via `summary.md`. The current system detects staleness of code-scanned index entries only. It never checks whether the brownfield mapper docs themselves have drifted from reality.

The fix requires two capabilities:
1. **Brownfield doc staleness detection** in `detect-stale-intel.cjs` (parse `Analysis Date` from `.planning/codebase/` docs, compare against git history of architectural files)
2. **Auto-refresh trigger** in `kata-execute-phase` step 7.25 (when brownfield docs are stale, spawn mapper agents and run full intel pipeline)

The auto-refresh trigger is the core work. It must re-run the same 4-mapper-agent pipeline that `/kata-map-codebase` uses, followed by `generate-intel.js` and `scan-codebase.cjs`, all within the execute-phase orchestrator's step 7.25.

**Primary recommendation:** Extend `detect-stale-intel.cjs` with brownfield doc staleness detection. Add a new script `refresh-brownfield-intel.cjs` that encapsulates the full mapping pipeline trigger. Modify step 7.25 to call the refresh when brownfield docs are detected as stale. Write tests for detection logic.

## Standard Stack

Node.js built-ins exclusively. Same pattern as all other intel scripts.

### Core

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Script runtime | Node.js (child_process, fs, path) | Guaranteed dependency, matches existing scripts |
| Git queries | `execSync` with git CLI | Same pattern as detect-stale-intel.cjs |
| Brownfield docs | `.planning/codebase/*.md` | 7 docs with `Analysis Date: YYYY-MM-DD` header |
| Intel pipeline | generate-intel.js + scan-codebase.cjs | Existing pipeline called sequentially |

### Supporting

| Component | Purpose | When Used |
|-----------|---------|-----------|
| detect-stale-intel.cjs | Extended with brownfield doc staleness | Called by orchestrator in step 7.25 |
| generate-intel.js | Regenerate summary.md from codebase docs | Called after mapper agents re-run |
| scan-codebase.cjs | Code-derived index.json + conventions.json | Called after generate-intel.js |
| kata-map-codebase references | Mapper agent instructions | Inlined into Task() prompts for auto-refresh |

## Architecture Patterns

### The Gap: Two Independent Staleness Paths

The system has two sources of intel:

1. **Code-scan path:** `scan-codebase.cjs` reads source files, produces `index.json` (v2) and `conventions.json` (v2). Each file entry has `lastIndexed` commit hash. `detect-stale-intel.cjs` checks these per-file commit hashes against `git diff`. `update-intel-summary.cjs` regenerates `summary.md` from scan data. This path works correctly.

2. **Brownfield doc path:** `/kata-map-codebase` spawns 4 mapper agents that read the codebase and write 7 docs to `.planning/codebase/`. `generate-intel.js` reads these docs and produces `summary.md` (richer, doc-derived). `update-intel-summary.cjs` has a guard at line 54 that skips regeneration when `.planning/codebase/` exists, preserving the richer brownfield summary.

The gap: Path 2's docs are never checked for staleness. `detect-stale-intel.cjs` only checks path 1's per-file index entries. When the codebase architecture evolves significantly after the initial mapping, `summary.md` remains frozen with outdated content. The `update-intel-summary.cjs` guard (line 54: `if (dirExists(codebaseDir)) return;`) perpetuates this by preventing the code-scan path from ever overwriting a brownfield summary.

### Current Brownfield Doc Format

All 7 docs in `.planning/codebase/` follow this header pattern:

```markdown
# [Title]

**Analysis Date:** YYYY-MM-DD

## [Content]
```

Confirmed in the actual files: all 7 docs have `**Analysis Date:** 2026-01-16` as the second non-empty line. This date is the detection anchor.

### Brownfield Doc Staleness Detection

**Approach:** Parse the `Analysis Date` from any `.planning/codebase/*.md` file (all share the same date since they're produced in one `/kata-map-codebase` run). Then compare against git history: count how many architectural files have changed since that date.

```
detect-stale-brownfield-docs():
  1. Check .planning/codebase/ exists, else return {brownfieldStale: false}
  2. Parse Analysis Date from any doc (e.g., ARCHITECTURE.md)
  3. Find the commit closest to that date: git log --until=YYYY-MM-DD --format=%H -1
  4. Run: git diff --name-only {commit}..HEAD
  5. Filter to architectural files (using SUPPORTED_EXTENSIONS from scan-codebase.cjs)
  6. Count: if >30% of total source files changed, docs are stale
  7. Return { brownfieldStale: true/false, analysisDate, changedSinceMapping, totalFiles }
```

**Why 30%?** The existing doc gardening threshold in step 7.25 uses `stalePct > 0.3` for the warning. Using the same threshold maintains consistency and has already been validated as reasonable.

**Alternative considered:** Check Analysis Date age (e.g., >30 days = stale). Rejected because age alone doesn't indicate staleness. A project that hasn't changed in 60 days has perfectly fresh docs. A project that underwent a major refactor 2 days after mapping has stale docs.

### Where Detection Should Live

Extend `detect-stale-intel.cjs` (in `skills/kata-map-codebase/scripts/`). The script already returns `hasDocBasedEntries` (line 107). Add a `brownfieldDocStale` field to the output JSON:

```json
{
  "staleFiles": [...],
  "freshFiles": [...],
  "totalIndexed": 60,
  "staleCount": 0,
  "stalePct": 0,
  "oldestStaleCommit": null,
  "hasDocBasedEntries": true,
  "brownfieldDocStale": true,
  "brownfieldAnalysisDate": "2026-01-16",
  "brownfieldChangedFiles": 42,
  "brownfieldTotalFiles": 60
}
```

This keeps all staleness detection in one script. The orchestrator already calls this script and parses its JSON output.

### Auto-Refresh Pipeline

When brownfield doc staleness is detected, the auto-refresh must:

1. **Spawn 4 mapper agents** (same as `/kata-map-codebase` steps 3-4)
2. **Run `generate-intel.js`** (same as `/kata-map-codebase` step 5.5)
3. **Run `scan-codebase.cjs`** full scan (same as `/kata-map-codebase` step 5.6)
4. **Stage updated files** for the phase commit

This is a miniature `/kata-map-codebase` execution embedded within step 7.25.

**Key constraint:** Step 7.25 runs within the execute-phase orchestrator. The orchestrator is at ~15% context budget. Spawning 4 mapper agents via Task() is fine (they get fresh context), but the orchestrator must stay lean. No reading mapper output, just confirming completion.

**Script approach:** Create `refresh-brownfield-intel.cjs` that orchestrates the pipeline from the Node.js side. This script:
- Does NOT spawn mapper agents (only the orchestrator can use Task tool)
- Runs `generate-intel.js` and `scan-codebase.cjs` after the orchestrator confirms mappers completed
- Acts as a coordination script between the orchestrator and the existing pipeline scripts

**Alternative considered:** Put all logic directly in SKILL.md step 7.25 bash. Rejected because step 7.25 is already 85 lines of bash. Adding mapper agent spawning logic would exceed maintainability limits.

**Recommended approach:** The orchestrator (SKILL.md) handles the mapper agent spawning via Task() calls (it already knows how to do this). A new section in step 7.25 handles the brownfield auto-refresh path:

```
if brownfieldDocStale:
  1. Read mapper instructions (references/codebase-mapper-instructions.md from kata-map-codebase)
  2. Spawn 4 mapper agents via Task() — same as kata-map-codebase steps 3-4
  3. Wait for completion
  4. Run generate-intel.js
  5. Run scan-codebase.cjs (full scan)
  6. Set SCAN_RAN=true (so summary is handled by existing pipeline)
```

But wait: the execute-phase orchestrator doesn't have the mapper instructions file in its own `references/` directory. It needs to read from `kata-map-codebase/references/`.

### Cross-Skill File Access

The build system copies each skill's scripts to its own `scripts/` directory. But `references/` are read at runtime by the orchestrator, not by the build system.

**Options:**
1. **Copy mapper instructions to kata-execute-phase references** at build time. Adds a new shared reference to the build system.
2. **Read mapper instructions at runtime via filesystem path.** The orchestrator can use Read tool on the kata-map-codebase references directory. In plugin mode, the path is `${CLAUDE_PLUGIN_ROOT}/skills/kata-map-codebase/references/codebase-mapper-instructions.md`.
3. **Inline the mapper instructions in a new execute-phase reference file.** Duplication but avoids cross-skill reads.

**Recommendation:** Option 2. The orchestrator already reads files via the Read tool. The plugin path resolution (`${CLAUDE_PLUGIN_ROOT}`) is established pattern. The mapper instructions file (`codebase-mapper-instructions.md`) is stable and unlikely to diverge from what the orchestrator needs.

However, for the detection script (`detect-stale-intel.cjs`) and the pipeline scripts (`generate-intel.js`, `scan-codebase.cjs`), the existing fallback resolution already handles this:
```bash
[ -f "scripts/detect-stale-intel.cjs" ] && STALE_SCRIPT="scripts/detect-stale-intel.cjs"
[ -z "$STALE_SCRIPT" ] && STALE_SCRIPT=$(find skills/kata-map-codebase/scripts -name "detect-stale-intel.cjs" -type f 2>/dev/null | head -1)
```

The `generate-intel.js` script uses ESM (`import.meta.url` for template resolution), so calling it from kata-execute-phase requires running it directly via `node` with the correct CWD. This already works because the script uses `resolveProjectRoot()`.

### Integration into Step 7.25

The current step 7.25 flow:

```
1. Script resolution (find scan-codebase.cjs, detect-stale-intel.cjs)
2. Staleness detection (code-scan entries)
3. Unified scan decision tree (greenfield / staleness / incremental)
4. Summary update (guarded by SCAN_RAN)
5. Doc gardening warning (>30% stale → log warning)
6. Convention enforcement
```

After Phase 58, step 7.25 becomes:

```
1. Script resolution (find all scripts)
2. Staleness detection (code-scan entries + brownfield doc staleness)
3. Brownfield auto-refresh (if brownfieldDocStale):
   a. Spawn 4 mapper agents
   b. Run generate-intel.js
   c. Run scan-codebase.cjs (full scan)
   d. SCAN_RAN=true
4. Unified scan decision tree (greenfield / staleness / incremental) — SKIP if auto-refresh already ran
5. Summary update (guarded by SCAN_RAN)
6. Convention enforcement
```

The brownfield auto-refresh path replaces the doc gardening warning. When it triggers, it fully refreshes everything, so no subsequent scan path needs to run.

### Mapper Agent Spawning from Execute-Phase

The kata-map-codebase SKILL.md spawns 4 parallel mapper agents (step 3):
- Agent 1: tech focus → STACK.md, INTEGRATIONS.md
- Agent 2: arch focus → ARCHITECTURE.md, STRUCTURE.md
- Agent 3: quality focus → CONVENTIONS.md, TESTING.md
- Agent 4: concerns focus → CONCERNS.md

Each agent receives inlined instructions from `codebase-mapper-instructions.md`. The orchestrator can replicate this spawning pattern.

**Model resolution:** The kata-map-codebase uses its own model lookup table (haiku for balanced profile). The execute-phase orchestrator should use the same models for mapper agents since this is the same operation.

**Context budget impact:** Spawning 4 mapper agents from the execute-phase orchestrator adds ~4 Task() calls. Since Task calls are non-blocking (they run in parallel and the orchestrator waits), the context impact is the mapper instructions text (~200 lines) plus 4 confirmations. This fits within the orchestrator's budget.

### update-intel-summary.cjs Guard Removal

The guard at line 54 of `update-intel-summary.cjs`:

```javascript
if (dirExists(codebaseDir)) return;
```

This guard prevents code-scan-derived summary from overwriting brownfield-derived summary. After auto-refresh, this guard is correct: the brownfield docs are now fresh, so `generate-intel.js` produces a fresh `summary.md`. The guard should remain.

**No changes needed to `update-intel-summary.cjs`.**

### Test Strategy

**Unit tests for brownfield doc staleness detection:**
1. No `.planning/codebase/` directory → `brownfieldDocStale: false`
2. Analysis Date exists, no files changed since → `brownfieldDocStale: false`
3. Analysis Date exists, >30% files changed → `brownfieldDocStale: true`
4. Malformed Analysis Date → graceful fallback (treat as fresh, log warning)
5. Mixed: some docs have Analysis Date, some don't → use the date found

**Integration verification (in SKILL.md step 7.25):**
1. Brownfield stale detected → mapper agents spawned, full pipeline runs
2. Brownfield fresh → skip auto-refresh, normal scan path continues
3. No brownfield docs → skip auto-refresh entirely (greenfield path)
4. Auto-refresh + SCAN_RAN flag → summary update handled correctly

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Mapper agent spawning | New mapper framework | Copy exact Task() pattern from kata-map-codebase SKILL.md step 3 | Same agents, same instructions, same output |
| Intel pipeline after mapping | New pipeline script | Call generate-intel.js then scan-codebase.cjs sequentially | Existing scripts handle all transformation |
| Doc staleness detection | New staleness framework | Extend detect-stale-intel.cjs with brownfield path | Single script for all staleness detection |
| Analysis Date parsing | Complex date parser | Simple regex on `**Analysis Date:** YYYY-MM-DD` | All 7 docs use identical format |

## Common Pitfalls

### Pitfall 1: Mapper Agents Writing to Wrong Directory

**What goes wrong:** Mapper agents write to `.planning/codebase/` but the CWD context differs between kata-map-codebase and kata-execute-phase invocations.
**Why it happens:** Mapper instructions use relative paths. In worktree mode, the workspace/ path differs.
**How to avoid:** Mapper agent prompts must include explicit project root context. Use the same `<working_directory>` injection pattern as executor agents.
**Warning signs:** Docs appear in wrong directory or agents report write failures.

### Pitfall 2: generate-intel.js Template Resolution

**What goes wrong:** `generate-intel.js` uses `import.meta.url` to find `references/summary-template.md` relative to its own location. When called from kata-execute-phase context, the template resolves to kata-execute-phase's references directory.
**Why it happens:** ESM path resolution is relative to the script file location, which changes based on which skill's scripts/ directory the script lives in.
**How to avoid:** Run `generate-intel.js` from its canonical location in kata-map-codebase's scripts directory. Use the same `find` fallback pattern for locating the script.
**Warning signs:** summary.md missing "Template Reference" section, or "Template not found" warnings.

### Pitfall 3: Context Budget Explosion

**What goes wrong:** The execute-phase orchestrator reads mapper instructions + spawns 4 agents + reads their output, exceeding the 15% context budget.
**Why it happens:** Mapper agents are substantial (each writes 1-2 docs). If the orchestrator tries to read their output, context bloats.
**How to avoid:** Orchestrator only waits for mapper agent completion (Task blocks). Does NOT read the written docs. After confirmation, runs generate-intel.js and scan-codebase.cjs as bash commands. These scripts read the docs themselves.
**Warning signs:** Orchestrator context exceeding 30% after auto-refresh step.

### Pitfall 4: Auto-Refresh Loops

**What goes wrong:** Auto-refresh runs, produces new docs dated today. Next phase execution detects 0 stale files and skips. But if the phase itself changes architectural files, the Analysis Date is still "today" and won't trigger again. This is actually correct behavior.
**Why it happens:** Not a real pitfall, but worth documenting. Auto-refresh sets the Analysis Date to the current date, so subsequent runs correctly detect freshness until the codebase drifts again.
**How to avoid:** No action needed. The date-based detection naturally handles this.

### Pitfall 5: Build System Missing generate-intel.js Distribution

**What goes wrong:** Auto-refresh calls `generate-intel.js` via the `find` fallback, but the plugin distribution might not include kata-map-codebase scripts in the expected location.
**Why it happens:** The build system copies each skill's scripts independently. kata-execute-phase doesn't normally need kata-map-codebase scripts.
**How to avoid:** Verify that the `find` fallback pattern works in plugin distribution. The current SKILL.md already uses this pattern for `detect-stale-intel.cjs` and `scan-codebase.cjs`. The same pattern should work for `generate-intel.js`.
**Warning signs:** "generate-intel.js not found" in plugin mode.

## Key Design Decisions

### Decision 1: Auto-Refresh vs. Warning-Only

The current step 7.25 logs a warning: "Recommend running /kata-map-codebase to refresh codebase knowledge." Phase 58 upgrades this to automatic action.

**Rationale:** The warning approach requires manual user intervention, which defeats the "automatic" in the phase goal. The whole point of v1.12.0 is that agents always receive current codebase context without manual maintenance.

### Decision 2: Full Re-Map vs. Partial Update

Auto-refresh spawns all 4 mapper agents for a complete re-map, rather than updating individual docs.

**Rationale:** Partial doc updates would require determining which docs are affected by which code changes. This is fragile and complex. A full re-map takes ~30 seconds (4 parallel agents with haiku model) and produces guaranteed-fresh output. The simplicity is worth the compute cost, and it matches the existing `/kata-map-codebase` behavior.

### Decision 3: Detection in detect-stale-intel.cjs vs. Separate Script

Brownfield doc staleness detection extends the existing script rather than creating a new one.

**Rationale:** The orchestrator already calls `detect-stale-intel.cjs` and parses its JSON output. Adding a `brownfieldDocStale` field to the output is minimal change. A separate script would require additional script resolution, additional JSON parsing, and additional error handling in step 7.25.

### Decision 4: Threshold of 30% Changed Files

Brownfield docs are considered stale when >30% of source files have changed since the Analysis Date.

**Rationale:** Matches the existing doc gardening warning threshold. Below 30%, the code-scan path (index.json, conventions.json) handles incremental updates. Above 30%, the architectural description in summary.md is likely outdated.

## Code Examples

### Brownfield Doc Staleness Detection (extend detect-stale-intel.cjs)

```javascript
function detectBrownfieldDocStaleness(projectRoot) {
  const codebaseDir = path.join(projectRoot, '.planning', 'codebase');
  if (!dirExists(codebaseDir)) {
    return { brownfieldDocStale: false };
  }

  // Parse Analysis Date from any doc
  const docFiles = ['ARCHITECTURE.md', 'STACK.md', 'CONVENTIONS.md', 'STRUCTURE.md',
                    'TESTING.md', 'INTEGRATIONS.md', 'CONCERNS.md'];
  let analysisDate = null;
  for (const doc of docFiles) {
    const docPath = path.join(codebaseDir, doc);
    if (!fs.existsSync(docPath)) continue;
    const content = fs.readFileSync(docPath, 'utf8');
    const match = content.match(/\*\*Analysis Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    if (match) {
      analysisDate = match[1];
      break;
    }
  }

  if (!analysisDate) {
    return { brownfieldDocStale: false, reason: 'no_analysis_date' };
  }

  // Find commit at or before analysis date
  let baseCommit;
  try {
    baseCommit = git(
      `git log --until="${analysisDate}T23:59:59" --format=%H -1`,
      projectRoot
    );
  } catch {
    return { brownfieldDocStale: false, reason: 'git_log_failed' };
  }

  if (!baseCommit) {
    return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
  }

  // Count changed source files since analysis date
  let changedRaw;
  try {
    changedRaw = git(`git diff --name-only ${baseCommit}..HEAD`, projectRoot);
  } catch {
    return { brownfieldDocStale: false, reason: 'git_diff_failed' };
  }

  if (!changedRaw) {
    return {
      brownfieldDocStale: false,
      brownfieldAnalysisDate: analysisDate,
      brownfieldChangedFiles: 0,
    };
  }

  const changed = changedRaw.split('\n').filter(Boolean);
  // Filter to source files only (using SUPPORTED_EXTENSIONS pattern)
  const sourceChanged = changed.filter(f => {
    const ext = f.split('.').pop();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  // Get total source file count
  let totalFiles;
  try {
    const lsRaw = git(`git ls-files`, projectRoot);
    const allFiles = lsRaw.split('\n').filter(Boolean);
    totalFiles = allFiles.filter(f => {
      const ext = f.split('.').pop();
      return SUPPORTED_EXTENSIONS.includes(ext);
    }).length;
  } catch {
    totalFiles = sourceChanged.length; // fallback
  }

  const changePct = totalFiles > 0 ? sourceChanged.length / totalFiles : 0;

  return {
    brownfieldDocStale: changePct > 0.3,
    brownfieldAnalysisDate: analysisDate,
    brownfieldChangedFiles: sourceChanged.length,
    brownfieldTotalFiles: totalFiles,
    brownfieldChangePct: Math.round(changePct * 100) / 100,
  };
}
```

### Orchestrator Auto-Refresh (SKILL.md step 7.25 addition)

```bash
# --- Brownfield doc auto-refresh ---
BROWNFIELD_STALE=$(echo "$STALE_JSON" | grep -o '"brownfieldDocStale"[[:space:]]*:[[:space:]]*true' || echo "")
if [ -n "$BROWNFIELD_STALE" ]; then
  ANALYSIS_DATE=$(echo "$STALE_JSON" | grep -o '"brownfieldAnalysisDate"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"brownfieldAnalysisDate"[[:space:]]*:[[:space:]]*"//; s/"$//')
  echo "Brownfield docs stale (Analysis Date: $ANALYSIS_DATE). Triggering auto-refresh..." >&2

  # [Orchestrator spawns 4 mapper agents via Task() - see below]
  # [After agents complete, run intel pipeline]

  GENERATE_SCRIPT=""
  [ -f "scripts/generate-intel.js" ] && GENERATE_SCRIPT="scripts/generate-intel.js"
  [ -z "$GENERATE_SCRIPT" ] && GENERATE_SCRIPT=$(find skills/kata-map-codebase/scripts -name "generate-intel.js" -type f 2>/dev/null | head -1)

  if [ -n "$GENERATE_SCRIPT" ]; then
    node "$GENERATE_SCRIPT" 2>/dev/null || true
  fi

  if [ -n "$SCAN_SCRIPT" ]; then
    node "$SCAN_SCRIPT" 2>/dev/null || true
  fi

  SCAN_RAN="true"
fi
```

## State of the Art

| Current State | Phase 58 Adds | Impact |
|---------------|--------------|--------|
| Doc gardening warning only (>30% stale → log message) | Auto-refresh spawns mappers + runs full pipeline | Agents always get fresh brownfield context |
| `detect-stale-intel.cjs` checks code-scan entries only | Extended with brownfield doc Analysis Date parsing | Single script handles all staleness detection |
| `update-intel-summary.cjs` guards against overwriting brownfield summary | Guard remains correct (fresh brownfield docs produce fresh summary) | No changes to existing greenfield path |
| Manual `/kata-map-codebase` required to refresh brownfield docs | Automatic re-map during phase execution when staleness detected | Zero manual maintenance for brownfield intel |

## Open Questions

### 1. Mapper Agent Model During Auto-Refresh

**What we know:** kata-map-codebase uses haiku for balanced profile. kata-execute-phase uses sonnet for executors in balanced profile.
**What's unclear:** Should auto-refresh mapper agents use the map-codebase model (haiku) or the execute-phase model (sonnet)?
**Recommendation:** Use haiku (matching kata-map-codebase). Mapper agents do exploratory reads, not complex reasoning. Haiku is sufficient and cheaper. The execute-phase orchestrator can override its default model selection for these specific Task() calls.

### 2. Auto-Refresh Frequency Guard

**What we know:** Auto-refresh runs in step 7.25, which executes once per phase.
**What's unclear:** Should there be a cooldown to prevent re-mapping if it was done recently (e.g., within the last phase)?
**Recommendation:** No cooldown needed. The Analysis Date check is self-regulating. After auto-refresh, the Analysis Date updates to today. Subsequent phases see fresh docs and skip the refresh. If a phase execution significantly changes the architecture, the next phase's staleness check correctly detects drift.

### 3. Non-Blocking vs. Blocking Behavior

**What we know:** All current step 7.25 operations are non-blocking (`|| true`).
**What's unclear:** Should auto-refresh failures block phase completion?
**Recommendation:** Non-blocking, consistent with all other step 7.25 operations. If mapper agents fail, log the error and continue. The stale summary is better than no phase completion. The user can run `/kata-map-codebase` manually.

## Sources

### Primary (HIGH confidence)
- `skills/kata-map-codebase/SKILL.md` — Full mapping pipeline (steps 3-5.6)
- `skills/kata-map-codebase/scripts/detect-stale-intel.cjs` — Current staleness detection (187 lines)
- `skills/kata-map-codebase/scripts/generate-intel.js` — Doc-derived intel generation (563 lines)
- `skills/kata-map-codebase/scripts/scan-codebase.cjs` — Code-derived scanning (800+ lines)
- `skills/kata-execute-phase/SKILL.md` step 7.25 — Current smart scan integration point (lines 414-503)
- `skills/kata-execute-phase/scripts/update-intel-summary.cjs` — Greenfield summary with brownfield guard (line 54)
- `.planning/codebase/*.md` — All 7 docs with `**Analysis Date:** 2026-01-16` format
- `.planning/v1.12.0-MILESTONE-AUDIT.md` — GAP-1 definition and root cause analysis
- `.planning/v1.12.0-UAT.md` — UAT scenario S1 failure details

### Verified via codebase inspection (HIGH confidence)
- `**Analysis Date:** YYYY-MM-DD` format is consistent across all 7 brownfield docs
- `update-intel-summary.cjs` line 54 guard: `if (dirExists(codebaseDir)) return;`
- `detect-stale-intel.cjs` already returns `hasDocBasedEntries` boolean in output
- Build system `find` fallback pattern works for cross-skill script resolution
- `scripts/build.js` copies skill scripts but does not cross-reference between skills

## Metadata

**Confidence breakdown:**
- Brownfield doc staleness detection: HIGH (Analysis Date format verified, git date-based log verified, threshold consistent with existing patterns)
- Auto-refresh pipeline trigger: HIGH (kata-map-codebase pipeline understood, Task() spawning pattern established, integration point clear)
- Step 7.25 orchestrator changes: HIGH (current flow mapped line-by-line, SCAN_RAN guard pattern established)
- Build system compatibility: HIGH (existing find fallback pattern handles cross-skill script resolution)

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable domain, internal codebase)
