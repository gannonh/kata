---
created: 2026-02-16T00:00
title: Test plugin script resolution
area: tooling
provenance: github:gannonh/kata-orchestrator#175
files:
  - scripts/build.js
  - skills/_shared/kata-lib.cjs
---

## Problem

Plugin script path resolution has been a recurring failure across 10+ attempts. The build now uses `${CLAUDE_PLUGIN_ROOT}` for plugin distribution, matching the official Anthropic plugin pattern (ralph-loop, plugin-dev). This test issue validates the fix works end-to-end across all skills in both distribution channels.

## Solution

TBD - this is a test issue created to exercise the kata-add-issue skill during plugin script resolution testing. Delete after verification.
