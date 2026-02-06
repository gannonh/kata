# Phase 07: Deprecate NPX Support — UAT

**Status:** Complete
**Started:** 2026-01-27

## Tests

| # | Test | Status | Severity | Notes |
|---|------|--------|----------|-------|
| 1 | Skill directories use clean names (no kata- prefix) | ✓ | - | Verified |
| 2 | Plugin build succeeds | ✓ | - | 27 skills built |
| 3 | Skills invocable via /kata:skill-name syntax | ✓ | - | /kata:whats-new, /kata:help tested |
| 4 | NPX deprecation message displays correctly | ✓ | - | Verified |
| 5 | README shows plugin-only installation | ✓ | - | No NPX references |
| 6 | CLAUDE.md reflects plugin-only workflow | ✓ | - | Uses /kata: syntax |
| 7 | Development workflow docs use npm run build:plugin | ✓ | - | No install.js --local refs |
| 8 | Commands use Skill("kata:xxx") format directly (no build transform) | ✓ | - | Source = distro, transform removed |

## Test Details

### Test 1: Skill directories use clean names
**Expected:** All skill directories in `skills/` have names without `kata-` prefix (e.g., `executing-phases` not `kata-executing-phases`)

### Test 2: Plugin build succeeds
**Expected:** `npm run build:plugin` completes without errors and creates `dist/plugin/` with all skills

### Test 3: Skills invocable via /kata:skill-name syntax
**Expected:** Skills can be invoked using `/kata:` prefix (e.g., `/kata:help`, `/kata:tracking-progress`)

### Test 4: NPX deprecation message displays correctly
**Expected:** Running `node bin/install.js` shows amber deprecation box with plugin installation instructions

### Test 5: README shows plugin-only installation
**Expected:** README.md installation section shows only plugin install method, no NPX references

### Test 6: CLAUDE.md reflects plugin-only workflow
**Expected:** CLAUDE.md shows plugin invocation syntax only, no NPX paths or commands

### Test 7: Development workflow docs use npm run build:plugin
**Expected:** Development installation uses `npm run build:plugin` and `--plugin-dir` flag, not `bin/install.js --local`

## Results

(Recorded during testing)
