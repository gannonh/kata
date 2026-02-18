# Phase 59: Brownfield Intel Pipeline Gap Closure — Research

**Researched:** 2026-02-17
**Confidence:** HIGH (pure code archaeology, no external dependencies)
**Source files analyzed:**
- `skills/kata-map-codebase/scripts/detect-stale-intel.cjs` (300 lines)
- `skills/kata-execute-phase/scripts/update-intel-summary.cjs` (162 lines)
- `skills/kata-map-codebase/scripts/generate-intel.js` (564 lines)
- `tests/scripts/detect-stale-intel.test.js` (169 lines)
- `skills/kata-execute-phase/SKILL.md` step 7.25 (lines 415-528)
- `skills/kata-map-codebase/SKILL.md` step 5.6 (lines 64-74)
- `.planning/phases/completed/55-codebase-capture-indexing/55-UAT.md` (58 lines)

---

## GAP-1: detectBrownfieldDocStaleness() no_commit_at_date fallback

### Root Cause

Lines 214-227 of `detect-stale-intel.cjs`:

```javascript
// 3. Find the commit at or before the analysis date
let baseCommit;
try {
  baseCommit = git(
    `git log --until="${analysisDate}T23:59:59" --format=%H -1`,
    projectRoot
  );
} catch {
  return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
}

if (!baseCommit) {
  return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
}
```

When `analysisDate` predates the repo's first commit, `git log --until` returns empty string (no error, just empty output). The `!baseCommit` check triggers and returns `brownfieldDocStale: false` with reason `no_commit_at_date`. The function treats "no commit before this date" as "not stale" when the correct interpretation is "everything since the beginning of the repo has changed."

### Fix Design

When `baseCommit` is empty after the `--until` query, fall back to the repo's oldest commit:

```javascript
if (!baseCommit) {
  // Analysis Date predates git history — fall back to oldest commit
  try {
    baseCommit = git('git rev-list --max-parents=0 HEAD', projectRoot);
    // If multiple root commits, take the first one
    if (baseCommit.includes('\n')) {
      baseCommit = baseCommit.split('\n')[0];
    }
  } catch {
    return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
  }
  if (!baseCommit) {
    return { brownfieldDocStale: false, reason: 'no_commit_at_date' };
  }
}
```

`git rev-list --max-parents=0 HEAD` returns the root commit(s). This is more reliable than `git log --format=%H | tail -1` because it handles repos with multiple root commits (merge from unrelated histories). The diff from root commit to HEAD captures all source file changes since inception.

### Impact Analysis

The rest of the function (steps 4-8: git diff, source file filtering, percentage computation) works unchanged once `baseCommit` is populated. The 30% threshold still applies.

For kata-orchestrator specifically: Analysis Date 2026-01-16, earliest commit 2026-01-18. After the fix, `baseCommit` will be the first commit (2026-01-18), and the diff from there to HEAD will show all changed source files. Since every source file has likely changed, `changePct` will exceed 0.3 and `brownfieldDocStale` will return `true`.

### Test Strategy

Existing test file (`tests/scripts/detect-stale-intel.test.js`) uses temp git repos with controlled dates. Pattern:

1. `beforeEach` creates tmp dir, `git init`, 10 source files, initial commit
2. `afterEach` removes tmp dir
3. Tests use `writeBrownfieldDoc()` helper and `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` env vars for backdating

New test case needed:

```
test: Analysis Date predates git history falls back to oldest commit
- Create repo with initial commit (date auto-assigned as today)
- Write brownfield doc with Analysis Date = '2020-01-01' (far before any commit)
- Modify >30% of source files and commit
- Expect brownfieldDocStale: true
- Expect brownfieldChangePct > 0.3
```

Additional edge case test:

```
test: Analysis Date predates git history, no source files changed returns false
- Create repo with initial commit
- Write brownfield doc with Analysis Date = '2020-01-01'
- No modifications after initial commit
- Expect brownfieldDocStale: false (changePct == 0)
```

---

## GAP-2: update-intel-summary.cjs codebase-dir guard blocks scan enrichment

### Root Cause

Line 52-54 of `update-intel-summary.cjs`:

```javascript
// Guard: if .planning/codebase/ exists, generate-intel.js handles summary.md
// Do not overwrite its richer output
if (dirExists(codebaseDir)) return;
```

This guard was correct when introduced (Phase 56): `update-intel-summary.cjs` writes a greenfield-only summary from `index.json` + `conventions.json`. For brownfield projects, `generate-intel.js` produces a richer doc-derived summary from the 7 mapper agent documents. The guard prevents the lighter greenfield summary from overwriting the richer brownfield summary.

The problem: after Phase 58's auto-refresh, `scan-codebase.cjs` overwrites `index.json` and `conventions.json` with v2 code-derived data (per-file imports/exports, naming confidence scores, directory purposes). But `summary.md` still reflects only the doc-derived content from `generate-intel.js`. The code-scan enrichment never surfaces in `summary.md`.

### Fix Design

Two options evaluated:

**Option A: Remove guard, teach update-intel-summary.cjs to merge doc + scan data**
- Complexity: HIGH. Would need to read both `.planning/codebase/` docs AND `index.json`/`conventions.json`, merge sections intelligently.
- Risk: Could produce worse summaries than generate-intel.js for initial brownfield mapping.
- Rejected.

**Option B: Re-run generate-intel.js after scan-codebase.cjs**
- In `kata-map-codebase` SKILL.md step 5.6, `scan-codebase.cjs` already overwrites `index.json` and `conventions.json`. If `generate-intel.js` were called AGAIN after the scan, its `summary.md` output would still be doc-derived only. This doesn't help.
- Rejected.

**Option C: Remove the early-return guard, keep the rest**
- `update-intel-summary.cjs` already reads `index.json` stats (with v1/v2 fallback on line 66) and `conventions.json`. It builds a summary from these files.
- For brownfield projects, after `scan-codebase.cjs` runs, `index.json` contains v2 code-derived data with `byExtension`, `byType`, `byLayer` stats AND per-file entries. `conventions.json` has code-derived naming detection.
- Removing the guard lets `update-intel-summary.cjs` regenerate `summary.md` from the code-scan data, replacing the doc-derived summary.
- The doc-derived summary from `generate-intel.js` is already overwritten by `scan-codebase.cjs`'s `index.json`/`conventions.json`, so the guard's original rationale ("do not overwrite richer output") is already invalidated.
- Risk: The greenfield-format summary (from `update-intel-summary.cjs`) has fewer sections than the doc-derived summary (from `generate-intel.js`). But it includes code-scan accuracy (real naming detection, real file counts) which is more valuable than doc-derived heuristics.
- **Selected.**

Implementation: Remove lines 52-54 (the `if (dirExists(codebaseDir)) return;` guard). The script already handles missing fields gracefully via optional chaining (`??`). The summary label changes from "Source: code-scan (greenfield)" to a more general label, or conditionally choose label based on `.planning/codebase/` existence.

### Where update-intel-summary.cjs is called

Two call sites in `kata-execute-phase` SKILL.md step 7.25:

1. **After brownfield auto-refresh** (line 488-492): `generate-intel.js` runs, then `scan-codebase.cjs`. `update-intel-summary.cjs` is NOT called here. Summary is whatever `generate-intel.js` wrote. This is the primary gap.

2. **After scan decision tree** (lines 520-528): `update-intel-summary.cjs` is called when `SCAN_RAN="true"`. But for brownfield auto-refresh, `SCAN_RAN` is set to `"true"` at line 490, so the guard at line 521 passes and `update-intel-summary.cjs` runs at line 526. However, the codebase-dir guard (line 54) causes it to exit immediately. After removing the guard, this call site will correctly regenerate `summary.md` from scan data.

This means the fix is clean: just remove the codebase-dir guard. The existing `SCAN_RAN` gating in step 7.25 already handles the call flow correctly.

### Label fix

Line 86 of `update-intel-summary.cjs`:

```javascript
lines.push(`Generated: ${new Date().toISOString().slice(0, 10)} | Source: code-scan (greenfield)`);
```

Should conditionally pick the source label:

```javascript
const source = dirExists(codebaseDir) ? 'code-scan (brownfield enrichment)' : 'code-scan (greenfield)';
lines.push(`Generated: ${new Date().toISOString().slice(0, 10)} | Source: ${source}`);
```

This requires passing `codebaseDir` check to the summary builder, or doing the check inline. Since `codebaseDir` is already computed at line 50, the check is trivial.

---

## Issue 2: generate-intel.js v1 to v2 schema migration

### Current State

`generate-intel.js` `buildIndex()` function (lines 253-264):

```javascript
return {
  version: 1,
  generated: generatedIso,
  source: SOURCE_LABEL,
  commitHash: getCurrentCommitHash(projectRoot),
  files,
  stats: {
    total_files: Object.keys(files).length,
    by_type: byType,
    by_layer: byLayer,
  },
};
```

### Target State

```javascript
return {
  version: 2,
  generated: generatedIso,
  source: SOURCE_LABEL,
  commitHash: getCurrentCommitHash(projectRoot),
  files,
  stats: {
    totalFiles: Object.keys(files).length,
    byType: byType,
    byLayer: byLayer,
  },
};
```

### Consumer Audit

All consumers of `stats.*` fields from `index.json`, checked for v1/v2 handling:

| Consumer | File | Field Access | v1/v2 Handling | Fix Needed |
|----------|------|-------------|----------------|------------|
| step 7.25 TOTAL_FILES gate | kata-execute-phase/SKILL.md:497 | `j.stats?.totalFiles ?? j.stats?.total_files ?? 0` | Fallback code | Remove v1 fallback after migration |
| update-intel-summary.cjs | kata-execute-phase/scripts/update-intel-summary.cjs:66 | `index.stats?.totalFiles ?? index.stats?.total_files ?? 0` | Fallback code | Remove v1 fallback after migration |
| update-intel-summary.cjs | same file:92 | `index.stats?.byExtension ?? {}` | v2 only | No change |
| update-intel-summary.cjs | same file:100 | `index.stats?.byLayer ?? {}` | v2 only | No change |
| update-intel-summary.cjs | same file:127 | `index.stats?.byType ?? {}` | v2 only | No change |
| scaffold-intel.cjs | kata-new-project/scripts/scaffold-intel.cjs:43-46 | `totalFiles`, `byType`, `byLayer`, `byExtension` | v2 only | No change |
| scan-codebase.cjs | kata-map-codebase/scripts/scan-codebase.cjs:778-781 | `totalFiles`, `byType`, `byLayer`, `byExtension` | v2 only | No change |
| KATA-STYLE.md schema doc | KATA-STYLE.md:558-569 | `total_files`, `by_type`, `by_layer` | v1 in documentation | Update doc to v2 |

### Migration Plan

1. Change `generate-intel.js` `buildIndex()`: `version: 1` to `version: 2`, snake_case to camelCase
2. Remove v1 fallback in `kata-execute-phase/SKILL.md` line 497: `j.stats?.totalFiles ?? j.stats?.total_files ?? 0` becomes `j.stats?.totalFiles ?? 0`
3. Remove v1 fallback in `update-intel-summary.cjs` line 66: same pattern
4. Update KATA-STYLE.md Index Schema example to v2

### Risk

LOW. `generate-intel.js` output is immediately overwritten by `scan-codebase.cjs` in the normal flow (step 5.5 then 5.6, or auto-refresh lines 474-485). The v1 schema index.json only persists if `scan-codebase.cjs` fails or is skipped. After migration, all producers emit v2 consistently.

---

## Issue 3: Create 55-VERIFICATION.md

### Source Content

`55-UAT.md` contains 8/8 passing tests:

1. Full codebase scan produces valid artifacts (index.json, conventions.json, v2 schema)
2. Import/export extraction per file
3. Naming convention detection with thresholds (5+ exports, 70%+ match)
4. Directory purpose and suffix detection
5. Incremental scan mode (--incremental --since COMMIT)
6. Freshness metadata (per-file lastIndexed, commitHash at top level)
7. Test suite passes (node --test, 84 tests)
8. Skill integration wiring (kata-map-codebase 5.6, kata-execute-phase 7.25)

### VERIFICATION.md Template

From existing verification files (56-VERIFICATION.md, 57-VERIFICATION.md, 58-VERIFICATION.md), the standard format:

```markdown
---
phase: {phase-name}
verified: {ISO timestamp}
status: passed|gaps_found
score: {N}/{N} must-haves verified
gaps: []
---

# Phase {N}: {Name} Verification Report

**Phase Goal:** {goal description}
**Verified:** {date}
**Status:** {status}

## Goal Achievement

### Observable Truths
| # | Truth | Status | Evidence |

### Required Artifacts
| Artifact | Expected | Status | Details |

### Key Link Verification
| From | To | Via | Status | Details |

### Requirements Coverage
| Requirement | Status | Blocking Issue |

### Anti-Patterns Found
### Human Verification Required
```

The 55-UAT.md content maps directly: each of the 8 test outcomes becomes a row in Observable Truths. The artifacts table covers `scan-codebase.cjs` and `conventions.json`. Key links cover the SKILL.md wiring.

This is a documentation-only task requiring no code changes.

---

## Plan Breakdown Recommendation

The ROADMAP specifies 3 plans:

### 59-01-PLAN.md: Fix detectBrownfieldDocStaleness() fallback + test
- **Scope:** Modify `detect-stale-intel.cjs` lines 225-227 to add oldest-commit fallback
- **Test:** Add 2 new test cases to `detect-stale-intel.test.js`
- **Verify:** `npm run test:scripts` passes, manual run on kata-orchestrator shows `brownfieldDocStale: true`
- **Files:** 2 files modified
- **Dependencies:** None

### 59-02-PLAN.md: Fix update-intel-summary.cjs guard + generate-intel.js v2 migration
- **Scope:**
  1. Remove codebase-dir guard (line 52-54) in `update-intel-summary.cjs`
  2. Add conditional source label for brownfield vs greenfield
  3. Migrate `generate-intel.js` `buildIndex()` to v2 schema (3 field renames + version bump)
  4. Remove v1 fallback code in `kata-execute-phase/SKILL.md` line 497 and `update-intel-summary.cjs` line 66
  5. Update KATA-STYLE.md Index Schema to v2
- **Rationale for combining GAP-2 + Issue 2:** Both touch the intel pipeline's schema/summary flow. The guard removal (GAP-2) and schema migration (Issue 2) are independent at the code level but logically related: they both clean up the brownfield intel pipeline inconsistencies. Combining keeps the plan count at 3 as specified.
- **Verify:** `npm run test:scripts` passes, run `generate-intel.js` and confirm v2 output
- **Files:** 4 files modified (update-intel-summary.cjs, generate-intel.js, kata-execute-phase/SKILL.md, KATA-STYLE.md)
- **Dependencies:** None (parallel with 59-01)

### 59-03-PLAN.md: Create 55-VERIFICATION.md + end-to-end verification
- **Scope:**
  1. Create `.planning/phases/completed/55-codebase-capture-indexing/55-VERIFICATION.md` from UAT results
  2. Run end-to-end verification: `npm run test:scripts`, manual `node detect-stale-intel.cjs` on kata-orchestrator, confirm `brownfieldDocStale: true` and `update-intel-summary.cjs` regenerates summary for brownfield
- **Dependencies:** Depends on 59-01 and 59-02 completing first (end-to-end verification covers their fixes)
- **Files:** 1 new file, 0 modified

### Parallelism

59-01 and 59-02 are independent and can execute in parallel. 59-03 must run after both complete (it verifies the fixes from 59-01 and 59-02 plus creates the VERIFICATION.md artifact).

---

## Key Findings Summary

1. **GAP-1 fix is surgical:** 5-line change in `detect-stale-intel.cjs`, replacing `return` with `git rev-list --max-parents=0 HEAD` fallback. No downstream impact.
2. **GAP-2 fix is a guard removal:** Delete 3 lines (the `if (dirExists(codebaseDir)) return;` guard) plus add conditional source label. The existing call flow in step 7.25 already handles the brownfield case correctly once the guard is removed.
3. **v2 migration is 3 field renames:** `total_files` to `totalFiles`, `by_type` to `byType`, `by_layer` to `byLayer`, plus `version: 1` to `version: 2`. Two consumers have fallback code to remove. One doc to update.
4. **55-VERIFICATION.md is a format conversion:** 8 UAT results mapped to the standard VERIFICATION.md template. Documentation only.
5. **All changes are internal to the kata-orchestrator codebase.** No new dependencies, no new scripts, no external library lookups needed.
