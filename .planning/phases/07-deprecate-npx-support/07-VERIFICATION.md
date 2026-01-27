---
phase: 07-deprecate-npx-support
verified: 2026-01-27T19:30:00Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Documentation accurately reflects plugin-only workflow"
    status: partial
    reason: "Development installation instructions still reference obsolete bin/install.js"
    artifacts:
      - path: "README.md"
        issue: "Lines 92-103 reference 'node bin/install.js --local' which now only shows deprecation message"
      - path: "CLAUDE.md"
        issue: "Lines 21-24 warn about bin/install.js behavior that no longer applies"
    missing:
      - "Replace README.md Development Installation with npm run build:plugin + manual copy instructions"
      - "Update CLAUDE.md to document correct local testing workflow (build:plugin + copy to test project)"
      - "Document --plugin-dir flag for Claude Code local plugin testing"
---

# Phase 7: Deprecate NPX Support Verification Report

**Phase Goal:** Remove NPX distribution path; Kata becomes plugin-only
**Verified:** 2026-01-27T19:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                | Status       | Evidence                                                   |
| --- | ---------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| 1   | All skill directories have kata- prefix removed     | ✓ VERIFIED   | 27 skills in skills/, zero with kata- prefix              |
| 2   | Build system simplified to plugin-only               | ✓ VERIFIED   | NPM target removed, build.js 343 lines (down from ~600)   |
| 3   | NPX-specific files deleted                           | ✓ VERIFIED   | publish.yml, kata-check-update.js, kata-npm-statusline.js deleted |
| 4   | Documentation updated for plugin-only                | ⚠️ PARTIAL   | README/CLAUDE.md have outdated development install steps   |
| 5   | NPM deprecation package ready for manual publish     | ✓ VERIFIED   | bin/install.js is 17-line deprecation stub                |

**Score:** 4/5 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `skills/adding-milestones/SKILL.md` | Renamed directory without kata- prefix | ✓ VERIFIED | Directory exists, frontmatter `name: adding-milestones` |
| `skills/executing-phases/SKILL.md` | Renamed directory without kata- prefix | ✓ VERIFIED | Directory exists, frontmatter `name: executing-phases` |
| `skills/planning-phases/SKILL.md` | Renamed directory without kata- prefix | ✓ VERIFIED | Directory exists, frontmatter `name: planning-phases` |
| `bin/install.js` | Deprecation stub | ✓ VERIFIED | 17 lines, prints deprecation message, exit 0 |
| `.github/workflows/publish.yml` | Deleted | ✓ VERIFIED | File does not exist |
| `hooks/kata-check-update.js` | Deleted | ✓ VERIFIED | File does not exist |
| `hooks/kata-npm-statusline.js` | Deleted | ✓ VERIFIED | File does not exist |
| `skills/kata-updating/` | Deleted | ✓ VERIFIED | Directory does not exist |
| `scripts/build.js` | Simplified, plugin-only | ✓ VERIFIED | 343 lines (reduced ~55%), no NPM target |
| `package.json` | Minimal files field | ✓ VERIFIED | `files: ["bin"]` only |
| `dist/plugin/skills/*/SKILL.md` | Build output with clean names | ✓ VERIFIED | 27 skills built, names match source |
| `README.md` | Plugin-only installation | ⚠️ PARTIAL | Main install section correct, dev install outdated |
| `CLAUDE.md` | Plugin-only syntax | ⚠️ PARTIAL | Skills table correct, dev commands outdated |
| `KATA-STYLE.md` | No NPX references | ✓ VERIFIED | Zero NPX references |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Skill frontmatter | Directory name | name field matches directory | ✓ WIRED | All 27 skills: frontmatter `name:` matches directory name |
| Build output | Source skills | build.js copies | ✓ WIRED | dist/plugin/skills/ contains all 27 skills |
| Plugin distribution | Skill invocation | /kata:skill-name | ✓ WIRED | Build succeeds, skills loadable with /kata: namespace |
| npm publish | Deprecation message | bin/install.js | ✓ WIRED | Stub exits cleanly with install instructions |

### Requirements Coverage

Phase 7 had no explicit requirements in REQUIREMENTS.md. Success criteria from ROADMAP.md:

| Criterion | Status | Evidence |
| --------- | ------ | -------- |
| All 27 skill directories renamed (kata-* -> *) | ✓ SATISFIED | 27 directories renamed, frontmatter updated |
| Build system simplified (NPM target removed, plugin build retained) | ✓ SATISFIED | build.js reduced 55%, npm target gone, plugin build works |
| NPX-specific files deleted | ✓ SATISFIED | publish.yml, update hooks deleted |
| Documentation updated | ⚠️ BLOCKED | Main docs correct, development workflow docs incomplete |
| Final NPM deprecation package published manually | ✓ READY | bin/install.js is deprecation stub, awaiting manual npm publish |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| README.md | 92-103 | References obsolete install command | 🛑 Blocker | Developers can't test local changes following docs |
| CLAUDE.md | 21-24 | Warns about behavior that no longer exists | ⚠️ Warning | Confuses contributors with outdated warnings |

### Gaps Summary

**Truth 4 (Documentation updated) is PARTIAL:**

The main user-facing documentation is correct:
- README.md installation section: Plugin-only ✓
- CLAUDE.md skills syntax: /kata: namespace ✓
- KATA-STYLE.md: No NPX references ✓

However, **development workflow documentation is outdated:**

1. **README.md "Development Installation" (lines 92-103)** still instructs:
   ```bash
   node bin/install.js --local
   ```
   This command now only shows the deprecation message. It doesn't install anything.

2. **CLAUDE.md "Development Commands" (lines 21-24)** warns:
   > ⚠️ NEVER run `node bin/install.js --local` from within the kata directory itself.
   
   This warning is about old behavior. The command doesn't install anymore, so the warning is irrelevant.

3. **No replacement workflow documented.** After deprecation, the correct local testing workflow should be:
   ```bash
   npm run build:plugin
   # Then either:
   # - Copy dist/plugin to test project's .claude/plugins/
   # - Use claude --plugin-dir dist/plugin
   ```

**Impact:** Contributors following current docs will be confused when `node bin/install.js --local` just prints a deprecation message instead of installing.

---

_Verified: 2026-01-27T19:30:00Z_
_Verifier: Claude (kata-verifier)_
