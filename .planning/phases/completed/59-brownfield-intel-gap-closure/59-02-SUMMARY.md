---
phase: 59-brownfield-intel-gap-closure
plan: 02
subsystem: codebase-intelligence
tags: [brownfield, intel, schema-migration, v2]
requires: []
provides: [brownfield-enrichment, v2-index-schema]
affects: [update-intel-summary.cjs, generate-intel.js, SKILL.md, KATA-STYLE.md]
tech-stack: [node.js]
key-files:
  - skills/kata-execute-phase/scripts/update-intel-summary.cjs
  - skills/kata-map-codebase/scripts/generate-intel.js
  - skills/kata-execute-phase/SKILL.md
  - KATA-STYLE.md
decisions: []
duration: 2 min
completed: 2026-02-18
---

Remove brownfield guard from update-intel-summary.cjs so scan-data enrichment runs for both greenfield and brownfield projects, and migrate generate-intel.js to v2 schema with camelCase stats fields (totalFiles, byType, byLayer).

## Changes

### update-intel-summary.cjs
- Removed early-return guard that skipped enrichment when `.planning/codebase/` existed
- Added conditional source label: "code-scan (brownfield enrichment)" vs "code-scan (greenfield)"
- Removed v1 `total_files` fallback from stats reading

### generate-intel.js
- Changed `buildIndex()` return from `version: 1` to `version: 2`
- Renamed stats fields from snake_case (`total_files`, `by_type`, `by_layer`) to camelCase (`totalFiles`, `byType`, `byLayer`)

### kata-execute-phase SKILL.md
- Removed v1 fallback expression `j.stats?.total_files` from inline Node.js stats reader

### KATA-STYLE.md
- Updated Index Schema documentation to show v2 format with camelCase stats fields

## Verification
- `npm run build:plugin` passes
- `npm test` passes (44/44)
- `npm run test:scripts` passes (167/167, including integration test confirming `version: 2`)
- Zero remaining `total_files`, `by_type`, or `by_layer` references in modified files

## Commits
- `57d9cd7`: fix(59-02): remove brownfield guard from update-intel-summary.cjs and add conditional source label
- `dc0966b`: feat(59-02): migrate generate-intel.js to v2 schema with camelCase stats
