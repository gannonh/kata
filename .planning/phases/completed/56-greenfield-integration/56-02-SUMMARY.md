---
phase: 56
plan: 02
title: Full-vs-Incremental Gate Logic
subsystem: codebase-intelligence
tags: [greenfield, intel, scan, summary]
dependency_graph:
  depends_on: [56-01]
  feeds_into: []
tech:
  - update-intel-summary.cjs (new Node.js CJS script)
  - kata-execute-phase SKILL.md step 7.25 (modified)
files:
  created:
    - skills/kata-execute-phase/scripts/update-intel-summary.cjs
  modified:
    - skills/kata-execute-phase/SKILL.md
decisions: []
metrics:
  duration_seconds: 163
  tasks_completed: 2
  tasks_total: 2
  commits: 2
---

# Phase 56 Plan 02: Full-vs-Incremental Gate Logic Summary

Smart scan gate in step 7.25 detects greenfield projects (totalFiles==0) and runs full codebase scan instead of incremental; new update-intel-summary.cjs regenerates summary.md from code-scan data for projects without mapper-agent docs.

## Task Results

### Task 1: Create update-intel-summary.cjs script
- **Commit:** 42108f8
- **Result:** Created Node.js CJS script that regenerates summary.md from index.json + conventions.json
- **Guards:** Exits silently when totalFiles==0, when .planning/codebase/ exists (brownfield), or when files are missing
- **Output format:** Matches the summary.md section schema consumed by planners and executors (Stack, Architecture, Conventions, Key Patterns, Concerns)
- **Verified:** 4 test scenarios (normal regen, zero files, brownfield guard, missing files)

### Task 2: Modify kata-execute-phase step 7.25 with smart gate logic
- **Commit:** 1a966e7
- **Result:** Step 7.25 renamed from "incremental scan" to "smart scan" with three-branch gate logic
- **Gate logic:** No index.json = skip; totalFiles==0 = full scan; totalFiles>0 = incremental scan
- **Summary update:** Calls update-intel-summary.cjs after any scan completes
- **Compatibility:** Handles both v1 (total_files) and v2 (totalFiles) stats field names
- **Non-blocking:** All operations wrapped in `|| true`

## Deviations

None.
