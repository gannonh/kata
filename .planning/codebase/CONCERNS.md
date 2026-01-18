# Codebase Concerns

**Analysis Date:** 2026-01-16

## Tech Debt

**Duplicate Content Structure:**
- Issue: Content exists in both `agents/` and `.claude/agents/` with only path substitution differences (~/.claude/ vs ./.claude/)
- Files: `agents/*.md`, `.claude/agents/*.md` (11 agent files duplicated)
- Impact: Maintenance burden - changes must be made in two places, risk of drift
- Fix approach: Either generate `.claude/` content at install time from single source, or symlink

**Deprecated Files Not Removed:**
- Issue: Multiple deprecated files remain in codebase with "DEPRECATED" headers but still loadable
- Files:
  - `kata/workflows/plan-phase.md`
  - `kata/workflows/research-phase.md`
  - `kata/workflows/research-project.md`
  - `kata/workflows/debug.md`
  - `kata/references/plan-format.md`
  - `kata/references/principles.md`
  - `kata/references/scope-estimation.md`
  - `kata/references/goal-backward.md`
  - `kata/references/research-pitfalls.md`
  - `kata/references/debugging/*.md` (5 files)
  - `commands/kata/research-project.md`
  - `commands/kata/define-requirements.md`
  - `commands/kata/create-roadmap.md`
- Impact: Context pollution - deprecated files may still be loaded by commands, wasting context window
- Fix approach: Remove deprecated files or move to `_archive/` directory excluded from install

**Empty CLAUDE.md File:**
- Issue: Root `CLAUDE.md` file exists but is empty (0 bytes)
- Files: `/Users/gannonhall/dev/oss/gsd-dev/get-shit-done/CLAUDE.md`
- Impact: Unclear purpose - either incomplete or should be removed
- Fix approach: Either populate with project-specific Claude instructions or remove

## Known Bugs

**None detected during static analysis.**

## Security Considerations

**No Significant Risks Detected:**
- The `bin/install.js` script does not use `eval()`, `exec()`, or `child_process`
- File operations are limited to copying within user-controlled directories
- No network requests except `npm view` for version checking (in background hook)
- Shell hooks only read local files and send desktop notifications

**Shell Script Injection Surface:**
- Risk: Shell scripts in `hooks/` process JSON with jq and use variables in commands
- Files:
  - `hooks/statusline.sh`
  - `hooks/gsd-notify.sh`
  - `hooks/gsd-check-update.sh`
- Current mitigation: Variables are extracted via jq from Claude's own JSON output, not user input
- Recommendations: Consider quoting variables more defensively in shell scripts

## Performance Bottlenecks

**Large Agent Files:**
- Problem: Several agent files exceed 1000 lines
- Files:
  - `agents/kata-planner.md` (1363 lines, 40KB)
  - `agents/kata-debugger.md` (1184 lines, 35KB)
  - `agents/kata-project-researcher.md` (864 lines, 21KB)
- Cause: Agents contain full methodology, examples, and reference material
- Improvement path: Extract reference sections into separate files loaded on-demand; current approach trades startup context cost for better agent autonomy

**Commands Duplicated in .claude/:**
- Problem: 29 command files exist in both `commands/gsd/` and `.claude/commands/gsd/`
- Cause: Install script copies files for path normalization
- Improvement path: Generate at install time rather than maintaining duplicates in repo

## Fragile Areas

**Roadmap Parsing:**
- Files: `commands/gsd/execute-phase.md`, `commands/gsd/plan-phase.md`
- Why fragile: Commands use grep/sed to parse ROADMAP.md for phase information
- Safe modification: Test with various roadmap formats; regex patterns assume specific line formats
- Test coverage: No automated tests - relies on Claude's pattern matching

**Wave-Based Parallel Execution:**
- Files: `commands/gsd/execute-phase.md`, `agents/kata-executor.md`
- Why fragile: Parallel Task spawning depends on correct wave assignment in PLAN.md frontmatter
- Safe modification: Ensure wave numbers are integers, dependency graph is acyclic
- Test coverage: No automated validation of wave assignment

**Path Reference Substitution:**
- Files: `bin/install.js` (copyWithPathReplacement function)
- Why fragile: Regex replaces `~/.claude/` with appropriate prefix for local/global install
- Safe modification: Only handles exact `~/.claude/` pattern; nested paths or variations may break
- Test coverage: Manual testing only

## Scaling Limits

**Context Window Pressure:**
- Current capacity: Agents are designed for 50% context budget per operation
- Limit: Large phases with many plans may cause quality degradation at 70%+ context usage
- Scaling path: Already implemented - wave-based execution spawns fresh subagent contexts

**Single-User Architecture:**
- Current capacity: Designed for solo developer + Claude workflow
- Limit: No multi-user coordination, no shared state, no collaborative editing
- Scaling path: Not applicable - explicit design choice documented in philosophy

## Dependencies at Risk

**No Critical Dependency Risks:**
- Only runtime dependency is Node.js (>=16.7.0)
- No production npm dependencies - uses only Node built-ins (fs, path, os, readline)
- jq required for shell hooks but failures are non-fatal

## Missing Critical Features

**No Automated Testing:**
- Problem: No test files (*.test.*, *.spec.*) exist
- Blocks: Cannot verify install.js behavior automatically, cannot regression test command changes
- Note: This is a meta-prompting system - "testing" happens via Claude execution, not unit tests

**No Changelog Automation:**
- Problem: CHANGELOG.md maintained manually
- Blocks: Potential for version/changelog drift
- Note: Low risk given release frequency and single maintainer

## Test Coverage Gaps

**Zero Automated Test Coverage:**
- What's not tested: Everything - this is a documentation/prompt system, not traditional code
- Files: `bin/install.js` (487 lines of JavaScript with no tests)
- Risk: Install script regressions could break user installations
- Priority: Medium - install script is the only executable code

**No Integration Testing:**
- What's not tested: Command → Agent → Workflow → File output chains
- Files: All `commands/gsd/*.md`, `agents/*.md` interactions
- Risk: Breaking changes in agent prompts may cascade unpredictably
- Priority: Low - this is prompt engineering; "testing" is interactive validation

---

*Concerns audit: 2026-01-16*
