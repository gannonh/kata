---
phase: 01-issue-model-foundation
verified: 2026-01-31T17:03:31Z
status: gaps_found
score: 1/3 must-haves verified
gaps:
  - truth: "User can create issues that persist to `.planning/issues/` in non-GitHub projects"
    status: failed
    reason: "Commands still reference old skill names; .planning/todos/ directory not migrated; plugin build is stale"
    artifacts:
      - path: "commands/kata/add-todo.md"
        issue: "References Skill('kata:adding-todos') which was renamed to 'kata:adding-issues'"
      - path: "commands/kata/check-todos.md"
        issue: "References Skill('kata:checking-todos') which was renamed to 'kata:checking-issues'"
      - path: ".planning/todos/"
        issue: "Legacy directory still exists with pending/ and done/ subdirs, not migrated to .planning/issues/"
      - path: "dist/plugin/skills/"
        issue: "Plugin build contains adding-todos/ and checking-todos/ (built 2026-01-31 05:06), not the renamed versions (modified 2026-01-31 08:57)"
    missing:
      - "New commands: commands/kata/add-issue.md and commands/kata/check-issues.md"
      - "Migration of .planning/todos/ to .planning/issues/ with open/closed structure"
      - "Rebuild plugin to include renamed skills"
  - truth: "/kata:check-issues displays all issues with consistent format regardless of source"
    status: failed
    reason: "Command /kata:check-issues does not exist; /kata:check-todos exists but calls renamed skill"
    artifacts:
      - path: "skills/checking-issues/SKILL.md"
        issue: "Exists and has correct display format, but no command routes to it"
    missing:
      - "Command file commands/kata/add-issue.md (or remove commands layer entirely)"
      - "Command file commands/kata/check-issues.md"
  - truth: "All Kata skills, agents, and UI messages use 'issues' instead of 'todos'"
    status: partial
    reason: "Skills renamed and use correct vocabulary, but commands, STATE.md, CLAUDE.md, and .planning/todos/ still use 'todo'"
    artifacts:
      - path: ".planning/STATE.md"
        issue: "Header says '### Pending Issues' but content says '26 pending todos' and references .planning/todos/pending/"
      - path: "CLAUDE.md"
        issue: "Example uses 'kata-managing-todos' instead of 'kata-managing-issues'"
      - path: ".planning/todos/pending/"
        issue: "22 todo files exist, not migrated to .planning/issues/open/"
      - path: ".planning/todos/done/"
        issue: "10 todo files exist, not migrated to .planning/issues/closed/"
    missing:
      - "Update STATE.md to reference .planning/issues/open/ and use 'issues' vocabulary"
      - "Update CLAUDE.md example to use 'kata-managing-issues'"
      - "Migrate .planning/todos/ → .planning/issues/ with open/closed structure"
---

# Phase 1: Issue Model Foundation Verification Report

**Phase Goal:** Establish "issues" as Kata's vocabulary with local storage and unified display.
**Verified:** 2026-01-31T17:03:31Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All Kata skills, agents, and UI messages use "issues" instead of "todos" | ⚠️ PARTIAL | Skills renamed and use correct vocabulary (adding-issues, checking-issues exist with "issue" terminology). Migration logic in place. BUT: commands still reference old skill names, STATE.md has mixed vocabulary, CLAUDE.md example uses "todo", .planning/todos/ directory not migrated |
| 2 | User can create issues that persist to \`.planning/issues/\` in non-GitHub projects | ✗ FAILED | Skills have correct mkdir logic and paths (.planning/issues/open/, .planning/issues/closed/). BUT: commands/kata/add-todo.md calls Skill("kata:adding-todos") which doesn't exist (renamed to kata:adding-issues). No add-issue.md command exists. Plugin build (dist/plugin/) contains old skill names (stale build from 05:06, source updated at 08:57). .planning/todos/ directory still exists with 32 files, not migrated |
| 3 | \`/kata:check-issues\` displays all issues with consistent format regardless of source | ✗ FAILED | skills/checking-issues/SKILL.md has correct display format (numbered list, area filter, sorting). BUT: No /kata:check-issues command exists. commands/kata/check-todos.md exists but calls Skill("kata:checking-todos") which was renamed |

**Score:** 1/3 truths verified (Truth 1 is partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| \`skills/adding-issues/SKILL.md\` | Renamed from adding-todos | ✓ VERIFIED | Exists, 238 lines, substantive implementation, correct frontmatter (name: adding-issues), uses .planning/issues/open/ and .planning/issues/closed/, has migration logic, 6662 bytes |
| \`skills/checking-issues/SKILL.md\` | Renamed from checking-todos | ✓ VERIFIED | Exists, 269 lines, substantive implementation, correct frontmatter (name: checking-issues), uses .planning/issues/open/, has display format and migration logic, 7178 bytes |
| \`skills/adding-todos/\` | Should be removed | ✗ MISSING | Directory does not exist (correctly removed) |
| \`skills/checking-todos/\` | Should be removed | ✗ MISSING | Directory does not exist (correctly removed) |
| \`commands/kata/add-issue.md\` | Routes /kata:add-issue to skill | ✗ MISSING | Does NOT exist. commands/kata/add-todo.md exists instead and calls Skill("kata:adding-todos") |
| \`commands/kata/check-issues.md\` | Routes /kata:check-issues to skill | ✗ MISSING | Does NOT exist. commands/kata/check-todos.md exists instead and calls Skill("kata:checking-todos") |
| \`.planning/issues/\` directory | Created by skills | ⚠️ ORPHANED | Does not exist yet (expected - created on first use). Skills have mkdir -p logic. BUT .planning/todos/ still exists with pending/ and done/ subdirs containing 32 files |
| \`dist/plugin/skills/adding-issues/\` | Built plugin distribution | ✗ MISSING | Stale build: dist/plugin/skills/adding-todos/ exists (built 2026-01-31 05:06:15), source was updated 2026-01-31 08:57:43. Plugin build does NOT include renamed skills |
| \`dist/plugin/skills/checking-issues/\` | Built plugin distribution | ✗ MISSING | Stale build: dist/plugin/skills/checking-todos/ exists. Same issue as adding-issues |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| \`/kata:add-issue\` command | adding-issues skill | Skill() call | ✗ NOT_WIRED | Command does not exist. Old /kata:add-todo command exists but calls Skill("kata:adding-todos") which was renamed |
| \`/kata:check-issues\` command | checking-issues skill | Skill() call | ✗ NOT_WIRED | Command does not exist. Old /kata:check-todos command exists but calls Skill("kata:checking-todos") which was renamed |
| adding-issues skill | .planning/issues/open/ | mkdir + write | ✓ WIRED | Skill creates directory structure (line 68), writes to .planning/issues/open/\${date}-\${slug}.md (line 141) |
| checking-issues skill | .planning/issues/open/ | ls + parse | ✓ WIRED | Skill reads .planning/issues/open/*.md (line 97), parses frontmatter, displays as numbered list |
| Skills | Migration logic | check + migrate | ✓ WIRED | Both skills have identical migration logic (lines 41-63): checks for .planning/todos/pending without _archived, copies to .planning/issues/open and .planning/issues/closed, archives originals |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| ISS-01: Rename "todos" vocabulary to "issues" throughout Kata | ⚠️ PARTIAL | Skills renamed, vocabulary updated in skills. BUT: commands still use "todo", STATE.md content uses "pending todos", CLAUDE.md example uses "todos", .planning/todos/ directory exists |
| ISS-03: Keep local \`.planning/issues/\` fallback for non-GitHub projects | ✗ BLOCKED | Skills create correct directory structure, but commands don't route to skills (old skill names). User cannot invoke /kata:add-issue (doesn't exist). Plugin build is stale |
| ISS-04: Display issues in \`/kata:check-issues\` with unified view | ✗ BLOCKED | Display format exists in checking-issues skill (numbered list, area, age). BUT: /kata:check-issues command doesn't exist |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| commands/kata/add-todo.md | 20 | Calls Skill("kata:adding-todos") | 🛑 Blocker | Command fails because skill was renamed to kata:adding-issues |
| commands/kata/check-todos.md | 20 | Calls Skill("kata:checking-todos") | 🛑 Blocker | Command fails because skill was renamed to kata:checking-issues |
| .planning/STATE.md | 116 | "26 pending todos:" | ⚠️ Warning | Vocabulary inconsistency - header says "Pending Issues" but content says "todos" |
| .planning/STATE.md | 117 | References .planning/todos/pending/ | ⚠️ Warning | Should reference .planning/issues/open/ after migration |
| CLAUDE.md | ~58 | Example "kata-managing-todos" | ⚠️ Warning | Documentation uses old vocabulary |
| .planning/todos/pending/ | N/A | 22 todo files exist | 🛑 Blocker | Files not migrated to .planning/issues/open/ |
| .planning/todos/done/ | N/A | 10 todo files exist | 🛑 Blocker | Files not migrated to .planning/issues/closed/ |
| dist/plugin/skills/ | N/A | Contains adding-todos/, checking-todos/ | 🛑 Blocker | Stale plugin build from before skills were renamed. Users installing plugin get old vocabulary |

### Gaps Summary

**Phase 1 goal not achieved.** All 6 plans executed and source skills renamed correctly, but critical integration points were missed:

**Gap 1: Commands layer not updated**
- Commands still reference old skill names (kata:adding-todos, kata:checking-todos)
- New commands (add-issue.md, check-issues.md) were never created
- User cannot invoke /kata:add-issue or /kata:check-issues

**Gap 2: Data migration not executed**
- .planning/todos/ directory still exists with 32 files (22 pending, 10 done)
- Migration logic exists in skills but was never triggered
- Skills expect .planning/issues/open/ and .planning/issues/closed/
- No automated migration script to convert existing Kata projects

**Gap 3: Plugin build not refreshed**
- dist/plugin/skills/ contains adding-todos/ and checking-todos/ (built 05:06)
- Source skills renamed at 08:57 (3.5 hours later)
- Users installing plugin get old vocabulary and broken functionality

**Gap 4: Documentation and state files use mixed vocabulary**
- STATE.md: Header says "Pending Issues" but content says "pending todos"
- CLAUDE.md: Example uses "kata-managing-todos"
- These are user-facing and create vocabulary confusion

**Root cause:** Plans focused on skill file renaming but missed the full integration picture. The skills ARE correct, but nothing routes to them and existing data hasn't migrated.

---

_Verified: 2026-01-31T17:03:31Z_
_Verifier: Claude (kata-verifier)_
