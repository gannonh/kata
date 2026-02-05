---
phase: 07-deprecate-npx-support
verified: 2026-01-27T23:28:25Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Documentation accurately reflects plugin-only workflow"
  gaps_remaining: []
  regressions: []
---

# Phase 7: Deprecate NPX Support Verification Report

**Phase Goal:** Remove NPX distribution path; Kata becomes plugin-only
**Verified:** 2026-01-27T23:28:25Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 07-06)

## Goal Achievement

### Observable Truths

| #   | Truth                                                | Status     | Evidence                                                           |
| --- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 1   | All skill directories have kata- prefix removed     | ✓ VERIFIED | 27 skills in skills/, zero with kata- prefix                      |
| 2   | Build system simplified to plugin-only               | ✓ VERIFIED | NPM target removed, build.js 343 lines (down from ~600)           |
| 3   | NPX-specific files deleted                           | ✓ VERIFIED | publish.yml, kata-check-update.js, kata-npm-statusline.js deleted |
| 4   | Documentation accurately reflects plugin-only        | ✓ VERIFIED | All dev workflow docs updated with build:plugin + --plugin-dir    |
| 5   | NPM deprecation package ready for manual publish     | ✓ VERIFIED | bin/install.js is 17-line deprecation stub                        |

**Score:** 5/5 truths verified

### Re-verification Details

**Previous verification (2026-01-27T19:30:00Z):** Truth 4 was PARTIAL

**Gap identified:**
- README.md Development Installation referenced obsolete `node bin/install.js --local`
- CLAUDE.md had outdated warning about old install.js behavior
- No documentation for new workflow: `npm run build:plugin` + `--plugin-dir` flag

**Gap closure (plan 07-06):**
- ✓ README.md lines 91-114 replaced with build:plugin workflow
- ✓ CLAUDE.md lines 19-40 updated with --plugin-dir testing instructions
- ✓ CLAUDE.md lines 150-154 marked Installation System as deprecated
- ✓ Additional fix: Line 182 in "Making Changes to Kata" section also updated

**Current state:**
- ✓ No references to `bin/install.js --local` in README.md or CLAUDE.md (outside historical files)
- ✓ Both files document `npm run build:plugin` workflow
- ✓ Both files document `--plugin-dir` flag for local testing
- ✓ Deprecation notice present in CLAUDE.md

**Regressions:** None. All previously passing truths remain verified.

### Required Artifacts

| Artifact                                | Expected                             | Status     | Details                                                 |
| --------------------------------------- | ------------------------------------ | ---------- | ------------------------------------------------------- |
| `skills/adding-milestones/SKILL.md`     | Renamed without kata- prefix         | ✓ VERIFIED | Directory exists, frontmatter `name: adding-milestones` |
| `skills/executing-phases/SKILL.md`      | Renamed without kata- prefix         | ✓ VERIFIED | Directory exists, frontmatter `name: executing-phases`  |
| `skills/planning-phases/SKILL.md`       | Renamed without kata- prefix         | ✓ VERIFIED | Directory exists, frontmatter `name: planning-phases`   |
| `bin/install.js`                        | Deprecation stub                     | ✓ VERIFIED | 17 lines, prints deprecation message, exit 0           |
| `.github/workflows/publish.yml`         | Deleted                              | ✓ VERIFIED | File does not exist                                     |
| `hooks/kata-check-update.js`            | Deleted                              | ✓ VERIFIED | File does not exist                                     |
| `hooks/kata-npm-statusline.js`          | Deleted                              | ✓ VERIFIED | File does not exist                                     |
| `skills/kata-updating/`                 | Deleted                              | ✓ VERIFIED | Directory does not exist                                |
| `scripts/build.js`                      | Simplified, plugin-only              | ✓ VERIFIED | 343 lines (reduced ~55%), no NPM target                |
| `package.json`                          | Minimal files field                  | ✓ VERIFIED | `files: ["bin"]` only                                   |
| `dist/plugin/skills/*/SKILL.md`         | Build output with clean names        | ✓ VERIFIED | 27 skills built, names match source                    |
| `README.md`                             | Plugin-only installation             | ✓ VERIFIED | Dev install uses build:plugin + --plugin-dir            |
| `CLAUDE.md`                             | Plugin-only syntax                   | ✓ VERIFIED | Dev workflow updated, Installation System deprecated   |
| `KATA-STYLE.md`                         | No NPX references                    | ✓ VERIFIED | Zero NPX references                                     |

### Key Link Verification

| From                  | To               | Via                            | Status   | Details                                              |
| --------------------- | ---------------- | ------------------------------ | -------- | ---------------------------------------------------- |
| Skill frontmatter     | Directory name   | name field matches directory   | ✓ WIRED  | All 27 skills: frontmatter `name:` matches directory |
| Build output          | Source skills    | build.js copies                | ✓ WIRED  | dist/plugin/skills/ contains all 27 skills           |
| Plugin distribution   | Skill invocation | /kata:skill-name               | ✓ WIRED  | Build succeeds, skills loadable with /kata: namespace|
| npm publish           | Deprecation msg  | bin/install.js                 | ✓ WIRED  | Stub exits cleanly with install instructions         |
| Dev workflow          | Plugin build     | npm run build:plugin           | ✓ WIRED  | Documented in README.md and CLAUDE.md                |

### Requirements Coverage

Phase 7 had no explicit requirements in REQUIREMENTS.md. Success criteria from ROADMAP.md:

| Criterion                                                      | Status      | Evidence                                                   |
| -------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| All 27 skill directories renamed (kata-* -> *)                 | ✓ SATISFIED | 27 directories renamed, frontmatter updated                |
| Build system simplified (NPM target removed, plugin retained)  | ✓ SATISFIED | build.js reduced 55%, npm target gone, plugin build works |
| NPX-specific files deleted                                     | ✓ SATISFIED | publish.yml, update hooks, kata-updating skill deleted     |
| Documentation updated (README, CLAUDE.md, KATA-STYLE.md)       | ✓ SATISFIED | All docs reflect plugin-only workflow                      |
| Final NPM deprecation package published manually               | ✓ READY     | bin/install.js is deprecation stub, awaiting npm publish   |

### Anti-Patterns Found

No anti-patterns or blocking issues found in re-verification. Previous issues resolved by plan 07-06.

---

_Verified: 2026-01-27T23:28:25Z_
_Verifier: Claude (kata-verifier)_
