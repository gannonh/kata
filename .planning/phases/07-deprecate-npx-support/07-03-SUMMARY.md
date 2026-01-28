---
phase: 07-deprecate-npx-support
plan: 03
subsystem: build
tags: [build, simplification, plugin-only]
dependency-graph:
  requires: [07-01, 07-02]
  provides: [plugin-only-build]
  affects: []
tech-stack:
  added: []
  patterns: [plugin-only-distribution]
key-files:
  created: []
  modified:
    - scripts/build.js
    - tests/build.test.js
    - package.json
decisions:
  - "Skill() transform updated for skills without kata- prefix"
  - "Tests reduced from 64 to 29 (NPM suite removed)"
  - "files array reduced to bin only for deprecation package"
metrics:
  duration: 3 min
  completed: 2026-01-27
---

# Phase 07 Plan 03: Simplify Build System Summary

**One-liner:** Plugin-only build.js with Skill() transform for renamed skills, tests reduced 55%

## What Was Built

Simplified the build system to plugin-only distribution:

1. **build.js simplification** (530 -> 343 lines, -35%)
   - Removed `buildNpm()` function and `NPM_INCLUDES` constant
   - Removed `renameSkillDir()` and `transformSkillName()` (skills already renamed in 07-01)
   - Updated `transformPluginPaths()` for skills without kata- prefix: `Skill("xxx")` -> `Skill("kata:xxx")`
   - Simplified `validateBuild()` to plugin-only validation
   - Renamed `COMMON_INCLUDES` to `INCLUDES`
   - Updated `main()` to only accept 'plugin' target

2. **Test suite reduction** (864 -> 633 lines, -27%)
   - Removed entire "NPM build" describe block (9 tests)
   - Removed "built npm VERSION matches package.json" test
   - Removed workflow @-reference validation (workflows no longer exist post-2.1)
   - Updated skill path references: `kata-executing-phases` -> `executing-phases`
   - Added new test: "skills no longer have kata- prefix in directory names"

3. **package.json minimization**
   - Updated `build` script: `node scripts/build.js all` -> `node scripts/build.js plugin`
   - Removed `build:npm` script
   - Reduced `files` array: `["README.md", "bin", "agents", "commands", "hooks", "skills"]` -> `["bin"]`

## Key Technical Details

### Skill() Transform Logic

Before (skills had kata- prefix in source):
```javascript
// Transform: Skill("kata-xxx") → Skill("kata:xxx")
content = content.replace(/Skill\("kata-/g, 'Skill("kata:');
```

After (skills renamed, no kata- prefix):
```javascript
// Transform: Skill("xxx") → Skill("kata:xxx")
content = content.replace(/Skill\("(?!kata:)([^"]+)"\)/g, 'Skill("kata:$1")');
```

The negative lookahead `(?!kata:)` prevents double-transformation.

## Verification Results

- `npm run build` succeeds (plugin only)
- `npm test` passes (29 tests, down from 64)
- `ls dist/plugin/skills/` shows skills without kata- prefix
- `package.json` files array is `["bin"]`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
| ---- | ------- |
| e7004b3 | feat(07-03): simplify build.js to plugin-only distribution |
| 3b38a62 | feat(07-03): update tests and package.json for plugin-only |

## Next Phase Readiness

Plan 04 (Update Documentation) can proceed. Build system is now plugin-only.
