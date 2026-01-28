---
phase: 07
plan: 05
subsystem: distribution
tags: [npm, deprecation, npx, plugin]
requires: [07-03]
provides: [deprecation-package]
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - bin/install.js
decisions: []
metrics:
  duration: 2 min
  completed: 2026-01-27
---

# Phase 7 Plan 05: NPX Deprecation Stub Summary

Replaced 563-line NPX installer with 17-line deprecation stub directing users to plugin installation.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Replace bin/install.js with deprecation stub | 9d2d6dd | bin/install.js |
| 2 | Verify package.json bin configuration | N/A | (verification only) |

## Key Changes

### bin/install.js (563 lines -> 17 lines)

The entire NPX installation system replaced with a minimal deprecation notice:

```javascript
#!/usr/bin/env node

console.log(`
\x1b[33m╔═══════════════════════════════════════════════════════════╗
║  Kata NPX installation has been deprecated                ║
╚═══════════════════════════════════════════════════════════╝\x1b[0m

Kata is now distributed exclusively as a Claude Code plugin.

\x1b[1mTo install:\x1b[0m
  1. Start Claude Code: \x1b[36mclaude\x1b[0m
  2. Run: \x1b[36m/plugin install kata@gannonh-kata-marketplace\x1b[0m

For more information: https://github.com/gannonh/kata
`);

process.exit(0);
```

Features:
- Visual amber box draws attention to deprecation notice
- Clear step-by-step plugin installation instructions
- Link to GitHub for more information
- Clean exit (exit 0) so it doesn't appear as an error

### package.json Configuration

Already correctly configured from 07-03:
- `bin.kata`: Points to `bin/install.js`
- `files`: Includes only `bin` directory

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] `node bin/install.js` shows deprecation message
- [x] Exit code is 0
- [x] Message includes plugin installation instructions
- [x] package.json bin points to bin/install.js
- [x] bin/install.js is minimal (~17 lines)

## Manual Follow-up Required

**IMPORTANT**: After phase completion, manually run `npm publish` to release the deprecation package:

```bash
npm publish
```

This is a one-time manual step. The automated publish workflow was removed in plan 07-02.

## Phase 7 Complete

With this plan, Phase 7 (Deprecate NPX Support) is complete:

| Plan | Name | Status |
| ---- | ---- | ------ |
| 07-01 | Rename Skill Directories | Complete |
| 07-02 | Remove NPX-Specific Files | Complete |
| 07-03 | Simplify Build System | Complete |
| 07-04 | Update Documentation | Complete |
| 07-05 | NPX Deprecation Stub | Complete |

Total code reduction across phase:
- Removed ~600 lines from build.js
- Removed ~560 lines from bin/install.js
- Deleted 4 NPX-specific files
- Renamed 27 skill directories
