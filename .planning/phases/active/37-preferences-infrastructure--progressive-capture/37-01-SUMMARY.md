---
phase: 37
plan: 1
subsystem: preferences-infrastructure
tags: [bash, node, json, config, preferences, accessor-scripts]
dependency_graph:
  requires: []
  provides: [read-pref-script, has-pref-script, set-config-script, defaults-table]
  affects: [37-02, 38, 39]
tech_stack:
  added: []
  patterns: [heredoc-node-invocation, atomic-write-via-rename, preference-resolution-chain]
key_files:
  created:
    - skills/kata-configure-settings/scripts/read-pref.sh
    - skills/kata-configure-settings/scripts/has-pref.sh
    - skills/kata-configure-settings/scripts/set-config.sh
  modified: []
decisions:
  - Heredoc node invocation avoids bash !== escaping issues
  - DEFAULTS table in read-pref.sh is single source of truth for all 17 known keys
  - fs.renameSync used for atomic writes on POSIX
  - Environment variables pass KEY/FALLBACK to node to avoid shell interpolation
metrics:
  duration: 2m
  completed: 2026-02-07
---

# Phase 37 Plan 01: Accessor & Utility Scripts Summary

Three executable bash scripts providing centralized JSON config reading, preference discovery, and atomic config writing for Kata's preferences infrastructure.

## Commits

- `f126a8e`: feat(37-01): create accessor and utility scripts for preferences infrastructure

## What Was Built

**read-pref.sh** — Resolves preference values through a four-level chain: `preferences.json` (flat key) -> `config.json` (nested via `resolveNested`) -> built-in DEFAULTS table (17 keys) -> fallback argument -> empty string. Uses `process.stdout.write()` for clean output without trailing newlines.

**has-pref.sh** — Detects whether a user has expressed a preference. Returns exit 0 if key exists in `preferences.json` (flat) or `config.json` (nested). Returns exit 1 if absent from both. Does not check the DEFAULTS table, which makes it useful for the check-or-ask pattern (key absence = "not yet asked").

**set-config.sh** — Atomically writes nested JSON keys to `config.json`. Navigates/creates intermediate objects for dot-separated paths. Type coerces values: `true`/`false` to boolean, numeric strings to number, else string. Writes to temp file then uses `fs.renameSync` for POSIX-atomic replacement.

## Verification Results

- 8 unit-level checks: all pass
- 19 integration tests against realistic config structures: all pass
- `bash -x` trace: no escaping issues on any script
- Tested: flat keys, nested keys (2 and 3 levels), missing files, preference override chain, type coercion (boolean, number, string), key preservation after writes

## Deviations from Plan

None — plan executed exactly as written.
