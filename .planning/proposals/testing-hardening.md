# Proposal: Testing Hardening & Regression Prevention

## Problem

Regressions in bash scripts and hooks. All three bugs documented in MEMORY.md originated in untested bash scripts. Zero unit tests exist for 5 bash scripts and 4 hooks. Skill integration tests (28 files) test through Claude CLI invocation but can't isolate script-level failures.

## Current Coverage

| Layer | Files | Tests | Gap |
|-------|-------|-------|-----|
| Build system | build.js | build.test.js, smoke.test.js, artifact-validation.test.js | Covered |
| Architecture | migration rules | migration-validation.test.js | Covered |
| Skill workflows | 30 SKILL.md files | 28 skill integration tests (Claude CLI) | Mostly covered |
| Bash scripts | 5 scripts | 0 tests | **Zero coverage** |
| Hooks | 4 hooks | 0 tests | **Zero coverage** |
| Multi-skill chains | plan→execute→verify | 0 tests | **Zero coverage** |
| Error/edge cases | various | 0 tests | **Zero coverage** |

## Documented Regressions (from MEMORY.md)

1. **find-phase.sh: missing state directories** — `find` exits non-zero when directory missing, `pipefail` kills script silently
2. **find-phase.sh: bash vs zsh** — tests passed in zsh but failed in bash due to different `pipefail` handling
3. **Phase directory move not staged in git** — `mv` moves directory on filesystem but git staging only catches specific files, not the directory move
4. **gh issue list --milestone with closed milestones** — returns empty silently, causing missing `Closes #N` lines in PR bodies

## Proposed Work

### Phase A: Extract Inline Bash into Testable Scripts

Extract duplicated and regression-prone inline bash from SKILL.md files into standalone scripts in each skill's `scripts/` directory.

**High-value extractions:**

1. **discover-phases.sh** — The `for state in active pending completed; do find...` pattern is copy-pasted across ~6 skills. Already caused 2 bugs. Single script replaces all instances.

2. **resolve-milestone-issues.sh** — The `gh api` two-step lookup (resolve milestone title to number via `milestones?state=all`, then query issues by number) is duplicated in 4 skills after the closed-milestone fix. One script eliminates that duplication.

3. **stage-phase-move.sh** — The `git add`/`git rm` sequence for moving phase directories between `pending/active/completed`. Caused the "phase directory move not staged" bug.

**Extraction criteria (what to extract vs leave inline):**
- Extract: complex logic with loops/conditionals, code duplicated across skills, code that has caused bugs
- Leave inline: single `cat`/`grep` lines, output formatting, one-liner file checks

**Existing examples of this pattern:** `find-phase.sh`, `resolve-template.sh`, `read-pref.sh`, `has-pref.sh`, `set-config.sh` — all previously extracted from inline bash.

### Phase B: Bash Script Unit Tests

Add bats-core (Bash Automated Testing System) for script-level unit testing.

**Infrastructure:**
- Install bats-core as dev dependency
- Create `tests/scripts/` directory
- Add `npm run test:scripts` command
- Wire into CI (`npm test` should include script tests)

**Test files to create:**

| Script | Test Cases |
|--------|------------|
| find-phase.sh | missing state dirs, empty results, pipefail in bash, multiple matches, flat dir fallback |
| read-pref.sh | missing files, invalid JSON, nested keys, fallback chain, type resolution |
| has-pref.sh | key in prefs only, key in config only, nested keys, absent key, defaults ignored |
| set-config.sh | flat keys, nested keys, type coercion (bool/number/string), atomic write, concurrent writes |
| resolve-template.sh | override present, override absent, missing template, glob expansion |
| discover-phases.sh | (from Phase A) all state combos, empty dirs, backward compat |
| resolve-milestone-issues.sh | (from Phase A) open milestone, closed milestone, no issues, multiple issues |
| stage-phase-move.sh | (from Phase A) pending→active, active→completed, git status verification |

**Regression tests from MEMORY.md (named, permanent):**
- `find-phase-missing-directory.bats` — state directory doesn't exist
- `find-phase-pipefail-bash.bats` — explicit `/bin/bash` execution, not zsh
- `gh-milestone-closed.bats` — milestone in closed state returns issues

### Phase C: Hook Unit Tests

Test hooks using Node.js built-in test runner (already in use).

**Infrastructure:**
- Create `tests/hooks/` directory
- Mock stdin input (`{"cwd":"/path/to/project"}`)
- Capture stdout/stderr for assertion
- Add `npm run test:hooks` command

**Test files to create:**

| Hook | Test Cases |
|------|------------|
| kata-config-validator.js | valid config silent, unknown key warns, invalid enum errors, invalid boolean errors, invalid array errors, broken JSON silent, always exits 0 |
| kata-template-drift.js | no overrides silent, complete override silent, missing fields warns, multiple templates, no .planning/templates/ dir silent |
| kata-setup-statusline.js | settings.json created/updated, existing settings preserved |
| kata-plugin-statusline.js | status line output format |

### Phase D: Affected Test Detection + CI Hardening

**Extend affected.js dependency graph:**
- If `read-pref.sh` changes → re-test all skills that use it (execute-phase, verify-work, complete-milestone, configure-settings, plan-phase)
- If a hook changes → re-test the hook
- If `find-phase.sh` changes → re-test execute-phase, audit-milestone, track-progress
- Map: `scripts/*.sh` → skills that reference them → skill tests

**CI additions:**
- `npm run test:scripts` in release pipeline (before artifact validation)
- `npm run test:hooks` in release pipeline
- shellcheck lint pass on all `.sh` files

## Requirements Sketch

### Script Extraction
- [ ] Phase discovery pattern extracted into standalone script, called from all skills that use it
- [ ] GitHub milestone-to-issue lookup extracted, called from all skills that use it
- [ ] Phase move git staging extracted, called from kata-execute-phase
- [ ] All SKILL.md files updated to call scripts instead of inline bash
- [ ] No behavioral changes (pure refactor)

### Bash Testing
- [ ] bats-core installed and wired into `npm run test:scripts`
- [ ] Every bash script in `scripts/` has a corresponding `.bats` test file
- [ ] Every MEMORY.md bug has a named regression test
- [ ] Tests run in `/bin/bash` explicitly (not default shell)
- [ ] CI runs script tests before artifact validation

### Hook Testing
- [ ] Hook tests use Node.js test runner with mocked stdin
- [ ] Every hook has tests for valid input, invalid input, and edge cases
- [ ] All hooks verified to exit 0 regardless of input
- [ ] CI runs hook tests

### Affected Detection
- [ ] Script changes trigger downstream skill tests
- [ ] Hook changes trigger hook tests
- [ ] shellcheck runs on all `.sh` files in CI

## Out of Scope

- Multi-skill workflow integration tests (plan→execute→verify chain) — high value but expensive (Claude invocation), defer to separate milestone
- Skill integration test expansion — existing 28 tests provide adequate workflow coverage
- Performance testing — not a current concern
- Security testing — bash scripts don't handle user input from external sources

## Source

- Milestone audit conversation (2026-02-08)
- MEMORY.md bug documentation
- Test infrastructure exploration of tests/ directory
