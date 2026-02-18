# Codebase Concerns

**Analysis Date:** 2026-02-18

## Tech Debt

**Stale Codebase Documentation:**
- Issue: Multiple documentation files in `.planning/codebase/` last updated 2026-01-16, now stale (32+ days old)
- Files: `ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md`, `INTEGRATIONS.md`, `STACK.md`, `TESTING.md`
- Impact: Documentation doesn't reflect current codebase state (v1.12.0 architecture). Agents/planners consume stale intel if they reference dated analysis
- Fix approach: Regenerate via `/kata-map-codebase` periodically (monthly or post-major-release). Consider automating stale detection

**Script Distribution Complexity:**
- Issue: Scripts exist in three forms: source (`skills/kata-*/scripts/`), shared (`skills/_shared/`), and distributed (`dist/plugin/skills/kata-*/scripts/`)
- Files: `scripts/build.js` (lines 56-57, 240-450, 515-545), `11+ skills/kata-*/scripts/`, `skills/_shared/kata-lib.cjs`, `skills/_shared/manage-worktree.sh`
- Impact: Multiple copies of same script (`kata-lib.cjs`, `manage-worktree.sh`) distributed to each skill increases maintenance burden and risk of drift
- Fix approach: Consolidate to single canonical source; consider Node.js path resolution at runtime or build-time variable substitution instead of copying

**Version Consistency Across Distribution Channels:**
- Issue: Version must be manually synchronized in `package.json` and `.claude-plugin/plugin.json`
- Files: `package.json` (line 4), `.claude-plugin/plugin.json` (line 3)
- Impact: Risk of version drift if either file is updated without the other; affects marketplace listings and skill registry
- Fix approach: Generate plugin.json VERSION from package.json at build time (already in build.js, confirmed consistent)

**GitHub API Rate Limiting Not Enforced:**
- Issue: Multiple GitHub API calls without rate limiting checks; 9+ `gh api` calls in skills
- Files: `skills/kata-plan-phase/SKILL.md`, `skills/kata-execute-phase/SKILL.md`, `skills/kata-add-milestone/SKILL.md`, `skills/kata-complete-milestone/SKILL.md`, and others
- Impact: Users hitting rate limits during batch operations (planning multiple phases, auditing milestones) see "rate limited" warnings but no retry logic or request batching
- Fix approach: Add rate limit detection (from gh CLI warnings) and implement exponential backoff or batch delays between API calls

**Large SKILL.md Files Approaching Context Limit:**
- Issue: Several SKILL.md files exceed 1000 lines, approaching practical orchestrator size limits
- Files: `skills/kata-add-milestone/SKILL.md` (1272 lines), `skills/kata-check-issues/SKILL.md` (1160 lines), `skills/kata-execute-phase/SKILL.md` (926 lines)
- Impact: Large orchestrators consume 15-20% of context window before execution starts; leaves less room for state/errors. Future skill additions will cross practical limits
- Fix approach: Extract reference sections to separate files (already done partially via `references/` pattern); consider breaking mega-skills into smaller specialized skills

## Known Bugs

**GitHub Milestone Lookup with Closed Milestones (FIXED):**
- Symptom: Phase issues (#113, #114) stayed open after PRs merged; `Closes #N` missing from PR body
- Root cause: `gh issue list --milestone "vX.Y.Z"` returns empty when milestone is closed
- Files affected: `skills/kata-execute-phase/SKILL.md`, `skills/kata-plan-phase/SKILL.md`, `skills/kata-complete-milestone/SKILL.md`, `skills/kata-add-milestone/SKILL.md`
- Status: FIXED (2026-02-07) — Replaced with two-step `gh api` lookup (resolve milestone ID, then query issues by number)

**Script Path Resolution in Plugin Context (FIXED):**
- Symptom: Scripts fail silently when Claude cd's to plugin directory; relative paths resolve incorrectly
- Root cause: SKILL.md code blocks use relative paths (`bash "./scripts/find-phase.sh"`); Claude resolves relative to plugin dir, not project root
- Files affected: 11 vulnerable scripts in `skills/kata-execute-phase/scripts/`, `skills/kata-plan-phase/scripts/`, etc.
- Status: FIXED (2026-02-11) — Created `project-root.sh` helper that detects project root via env var, CWD, or explicit error. All vulnerable scripts now source it first

**Phase Directory Move Not Staged in Git (FIXED):**
- Symptom: SUMMARY files remain in `active/` after phase completes; directory move never committed
- Root cause: `mv` operation was filesystem-only; git staging didn't include directory deletions/additions
- Files affected: `skills/kata-execute-phase/SKILL.md` step 7.5 and step 10
- Status: FIXED (2026-02-07) — Added explicit git staging for phase directory moves (deletions from pending/, additions at completed/)

## Security Considerations

**GitHub API Token Exposure Risk:**
- Risk: GitHub operations require `gh` CLI auth; if user's `gh` auth fails silently, errors might leak to stdout/stderr
- Files: All skills using `gh api` commands (9+ locations)
- Current mitigation: `gh` CLI uses system keychain for credentials (not in env vars or files); errors redirect to stderr with `2>&1`
- Recommendations: Verify error messages don't leak partial token information; test with invalid gh auth to confirm graceful degradation

**No Shell Injection Hardening in Script Arguments:**
- Risk: Scripts accept arguments from SKILL.md and pass them to shell commands; potential injection if arguments contain special chars
- Files: `skills/kata-execute-phase/scripts/find-phase.sh` (line 13: `PHASE_ARG="${1:?...}"`), `skills/kata-execute-phase/scripts/create-phase-branch.sh`, others
- Current mitigation: Arguments are quoted (`"$PHASE_ARG"`); numeric validation for phase numbers
- Recommendations: Add escaping for special shell characters in phase names/descriptions if they're user-supplied

**File Operation Permissions:**
- Risk: Build script copies files with default permissions; distributed files might have overly permissive settings
- Files: `scripts/build.js` (copyDir, copyFile functions)
- Current mitigation: No world-writable permissions observed; tests verify file readability
- Recommendations: Explicitly set file permissions to 0644 (non-executable) and 0755 (executable scripts) in copy operations

## Performance Bottlenecks

**Slow Codebase Scanning for Large Projects:**
- Problem: `skills/kata-map-codebase/scripts/scan-codebase.cjs` (959 lines) walks entire project tree
- Files: `skills/kata-map-codebase/scripts/scan-codebase.cjs`
- Cause: Recursive directory traversal with no filtering; processes all files then filters later
- Improvement path: Add `.gitignore`-based exclusion patterns; parallelize file stat operations; cache results per commit hash

**Generate Intel Script Blocks Until All Scans Complete:**
- Problem: `generate-intel.js` (571 lines) spawns 4+ parallel scan tasks but waits sequentially for results
- Files: `skills/kata-map-codebase/scripts/generate-intel.js`
- Cause: Promise.all() and sequential file writes limit parallelism
- Improvement path: Stream results directly to output files as tasks complete; implement worker pool for long-running scans

**Grep-Based Index Lookups Not Indexed:**
- Problem: Phase/issue lookups use grep to search through files (ROADMAP, STATE) instead of parsed data structures
- Files: `skills/kata-execute-phase/scripts/find-phase.sh` (find + grep), `skills/kata-execute-phase/SKILL.md` (grep ROADMAP)
- Cause: Bash/shell limitations; no JSON parsing of project state
- Improvement path: Parse ROADMAP.md into JSON at project load time; cache in memory across skill invocations

## Fragile Areas

**Wave-Based Parallel Execution Depends on Frontmatter Integrity:**
- Files: `skills/kata-execute-phase/SKILL.md` (steps 3-9), `skills/kata-plan-phase/references/planner-instructions.md`, PLAN.md frontmatter
- Why fragile: Wave numbers must be sequential integers with no gaps; dependency graph must be acyclic. No validation before execution
- Safe modification: Add schema validation in `kata-lib.cjs` to check wave numbers before spawning parallel tasks
- Test coverage: No automated validation; relies on planner agent correctly formatting waves

**Phase State Transitions (active → completed) Not Atomic:**
- Files: `skills/kata-execute-phase/SKILL.md` step 7.5, 10, 11 (move phase dir, stage, commit)
- Why fragile: Git operations can fail mid-transition; if move succeeds but commit fails, state is corrupted (phase dir exists in two places)
- Safe modification: Wrap entire transition in git transaction (or create backup before move); rollback on failure
- Test coverage: No tests for transaction failure scenarios

**Worktree Layout Detection Brittle:**
- Files: `skills/_shared/kata-lib.cjs` (resolve-root), `skills/_shared/manage-worktree.sh`, 11+ SKILL.md files
- Why fragile: Detection logic assumes standard worktree names (`main/`, `workspace/`); custom layouts could confuse detection
- Safe modification: Add explicit `KATA_LAYOUT` env var (bare/standard) set during project init; reference this instead of inferring
- Test coverage: No tests for non-standard layouts

**Template Placeholder Resolution Doesn't Validate Required Fields:**
- Files: `scripts/resolve-template.sh` (line 10+), skill reference sections that use `@` placeholders
- Why fragile: Missing placeholders silently become empty strings; no validation that required fields were filled
- Safe modification: Add optional validation phase after template resolution; warn on empty critical fields
- Test coverage: Manual testing only

## Scaling Limits

**Context Window Pressure in Large Phases:**
- Current capacity: Orchestrators designed for ~15% context, execution agents for ~50%
- Limit: Phases with 20+ plans or agents with 100+ KB references approach quality degradation at 70%+ context usage
- Scaling path: Already mitigated via wave-based parallel execution (fresh context per wave); future: consider compression of reference sections or lazy-loading

**GitHub Rate Limits Impose Batch Size Constraints:**
- Current capacity: ~5000 requests/hour for standard auth (60/min for unauthenticated)
- Limit: Batch operations (audit all milestones, sync all phase issues) can hit limits with 50+ phases
- Scaling path: Implement request batching, exponential backoff, rate limit awareness; document batch size recommendations

**Build System Output Size Growing:**
- Current capacity: `dist/plugin/` ~500 KB, `dist/skills-sh/` ~600 KB
- Limit: Each new skill adds ~50-100 KB; at 40+ skills, distribution size impacts download time and plugin load time
- Scaling path: Lazy-load skill references (not core to functionality); compress CHANGELOG.md; remove old migration docs

## Dependencies at Risk

**Node.js Version Requirement Not Validated at Runtime:**
- Risk: `package.json` requires Node >=20.0.0; errors only appear if user has older Node
- Files: `package.json` (line 34), no runtime validation in scripts
- Impact: Users with Node 18.x might partially execute scripts, see cryptic errors
- Recommendation: Add Node version check in `kata-lib.cjs` (line 1); fail fast with clear message

**Script Shebangs Assume `/usr/bin/env` Is Available:**
- Risk: Non-standard shells or OS configurations might not have `/usr/bin/env`
- Files: All `.sh` scripts (`scripts/find-phase.sh` line 1, others)
- Impact: Low — most modern systems have this; Windows users use WSL or Git Bash
- Recommendation: Document shell requirements; consider adding fallback detection

**jq Dependency for Shell Scripts Not Checked:**
- Risk: `jq` is required for JSON parsing in shell scripts but not validated before use
- Files: Implicit in scripts that parse `gh api` JSON output
- Impact: Scripts fail with cryptic "command not found" if jq is missing
- Recommendation: Add jq version check in `kata-lib.cjs` or document as required system dependency

## Missing Critical Features

**No Automated Changelog Generation:**
- Problem: CHANGELOG.md updated manually; risk of version/changelog drift
- Impact: Release notes might miss features or commits; hard to audit what changed per version
- Workaround: Currently low-risk due to single maintainer and frequent releases
- Recommendation: Consider auto-generating from git commits on release; validate with manual review

**No Automated API Documentation:**
- Problem: Skills and references documented in markdown; no API spec or OpenAPI schema
- Impact: New developers unfamiliar with Kata patterns must read all documentation to understand skill contracts
- Recommendation: Not critical for solo developer; document as future nice-to-have

**No Health Check / Self-Test Script:**
- Problem: No way to verify Kata installation is correct without running a full project
- Impact: Users troubleshooting installation issues must create a test project
- Recommendation: Add `/kata-doctor` script to validate: Node version, gh auth, jq presence, project structure

## Test Coverage Gaps

**Integration Tests for Script Interactions:**
- What's not tested: find-phase.sh → SKILL.md parsing → phase execution chains
- Files: `tests/scripts/` (11 test files covering individual scripts), but no end-to-end tests
- Risk: Breaking changes in script output format cascade unpredictably
- Priority: Medium — scripts are updated infrequently; manual testing adequate for now

**Worktree Layout Handling Not Tested:**
- What's not tested: Bare repo with worktrees; phase execution with `main/` and `workspace/` directories
- Files: `tests/` (no worktree-specific tests), `skills/kata-execute-phase/SKILL.md` (worktree code paths not exercised)
- Risk: Users with worktrees enabled might hit untested code paths
- Priority: High — worktrees added in v1.10.0; recommend adding worktree-based test scenarios

**GitHub Integration Not Tested:**
- What's not tested: `gh` CLI calls; GitHub API error handling; rate limiting
- Files: Skills with GitHub operations; no mocked gh CLI tests
- Risk: Changes to GitHub integration could break silently until user exercises code path
- Priority: Medium — can test by using throw-away GitHub repos

**Build Artifact Validation:**
- What's not tested: Plugin distribution integrity; skill script presence in dist/
- Files: `tests/artifact-validation.test.js` (checks file structure), but doesn't validate script execution
- Risk: Distributed plugin might be missing scripts if build fails silently
- Priority: Low — current build validation adequate; automated smoke tests exist

---

*Concerns audit: 2026-02-18*
*Previous audit: 2026-01-16 (stale, regenerated)*
