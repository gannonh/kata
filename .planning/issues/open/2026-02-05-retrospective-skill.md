---
created: 2026-02-05
title: Add kata-retrospective skill for milestone analysis
area: tooling
type: feature
provenance: github:gannonh/kata-orchestrator#98
---

## Problem

Kata has 106 completed plans across 15 milestones with rich structured data (deviations, timing, task counts, verification results) in SUMMARY.md and VERIFICATION.md files. Nobody is using this data. Questions like "why was v1.1.0 five times larger than v1.4.1?" and "which phase ordering produces fewer deviation corrections?" have answers extractable from existing artifacts.

## Solution

Create a `kata-retrospective` skill that reads all SUMMARY.md files from a completed milestone, extracts deviation patterns, timing data, plan sizing correlations, and verification outcomes, and generates a structured RETROSPECTIVE.md document.

### Scope

- Project-local output only (no cross-project infrastructure)
- Output uses standard Kata conventions (YAML frontmatter, markdown sections)
- Cross-project portability deferred until empirical data from multiple projects informs what generalizes

### Estimated Effort

1-2 plans (small milestone or quick task).

### First Step

Build the skill. Run it against Kata's own completed milestones. Evaluate whether the extracted patterns inform future planning.

### Source

Identified during explorer/challenger brainstorm session (radical ideas pair). Original proposal was a full cross-project learning system; descoped to project-local retrospective after challenge rounds.
