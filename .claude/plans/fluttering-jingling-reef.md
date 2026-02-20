# Kata Test Infrastructure: Update Fixtures + Add Template Coverage

## Context

The template system required 6 commits of fixes, each revealing new bugs in the next test round. We ran 17 ad-hoc tests manually but none are captured in the automated test suite. Meanwhile, `create-test-project.sh` (1,152 lines) generates test projects with stale file formats that don't match current Kata output.

**Goal:** Update the test fixture generator to match current Kata state. Add automated tests for the template system so this class of bug is caught before release. Make testing a standard part of the development process.

## Deliverable 1: Automated Template System Tests

New file: `tests/scripts/template-system.test.js`

This codifies the 17 tests we ran manually today as automated Node.js tests. These tests invoke bash scripts directly (no Claude API calls, fast, free) and validate the template infrastructure.

**Test structure using existing harness patterns** (node:test, beforeEach/afterEach with temp dirs):

```
describe('template scripts')
  describe('resolve-template.sh')
    - finds override from project root
    - finds override from skill subdirectory
    - falls back to default when no override
    - exits 1 with search paths for nonexistent template

  describe('list-templates.sh')
    - returns all 5 templates from project root
    - detects override files from project root
    - works from skill subdirectory

  describe('check-template-drift.sh')
    - exits 0 with no output when overrides are valid (project root)
    - exits 0 with no output from skill subdirectory
    - reports missing fields when override has drift

  describe('YAML frontmatter')
    - all 5 default templates have valid kata_template schema
    - all 5 default templates are version 2
```

**Test isolation:** Each test creates a temp dir, copies the built plugin's `dist/plugin/skills/` into it, creates a `.planning/templates/` with known override content, and runs scripts from both the project root and skill subdirectories.

**Key difference from skill tests:** These call `execSync('bash script.sh')` directly. No Claude invocation. Runs in <5 seconds total. Can run in CI on every push.

**Files:**
- `tests/scripts/template-system.test.js` (new)
- `tests/fixtures/kata-project/.planning/templates/` (add sample override fixture)

**npm script addition in package.json:**
- Add `test:scripts` to run script-level tests
- Update `test:all` to include `test:scripts`

**Affected-file mapping:** Update `tests/harness/affected.js` to map changes in `skills/kata-*/scripts/` to `tests/scripts/template-system.test.js`.

## Deliverable 2: Update create-test-project.sh

The script's architecture (incremental state builders, interactive menu, config) is solid. The generated file content is stale.

### Audit of what's outdated

**Skill command syntax:** Uses `/kata:verb-noun` throughout. Should be `/kata-verb-noun`.

**config.json** (line 115-136): Missing `workflows` section that contains:
- `workflows.execute-phase.post_task_command`
- `workflows.verify-work.extra_verification_commands`
- `workflows.complete-milestone.version_files`

Also missing: the `display` key was removed from current format.

**STATE.md** (line 209-244): Uses table-based format. Current format uses prose sections: `Project Reference`, `Current Position`, `Accumulated Context` with subsections for Decisions, Pending Todos, Blockers/Concerns.

**PLAN.md** (line 389-441): Frontmatter has `type, status, phase, plan, created`. Current YAML template schema expects: `phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves`. Body uses `<tasks>` wrapper which is fine, but missing `<execution_context>`, `<context>`, `<verification>`, `<output>` sections.

**SUMMARY.md** (line 443-501): Frontmatter has `status, started, completed, commit`. Current YAML template schema expects: `phase, plan, subsystem, tags, duration, completed`. Body sections don't match template: missing Performance, Accomplishments, Task Commits table, Files Created/Modified, Decisions Made.

**UAT.md** (line 557-633): No YAML frontmatter. Table-based session info. Current template schema expects frontmatter: `status, phase, source, started, updated`. Body expects: Current Test, Tests, Summary, Gaps sections.

**VERIFICATION.md** (line 504-555): No YAML frontmatter. Current template schema expects: `phase, verified, status, score`. Body expects: Goal Achievement, Observable Truths, Required Artifacts, Key Link Verification, Requirements Coverage.

**Missing directories:** `.planning/templates/`, `.planning/issues/`, `.planning/quick/`, `.planning/todos/`, `.planning/brainstorms/`, `.planning/deferred/`, `.planning/milestones/`, `.planning/MILESTONES.md`.

**Missing `.claude/` setup:** Test projects need `.claude/skills/.gitkeep` and a `CLAUDE.md` for skills to work.

### Changes to make

1. **write_config_json():** Add `workflows` section, remove `display`
2. **write_state_md():** Rewrite to prose format matching current STATE.md
3. **write_plan_md():** Update frontmatter to YAML template v2 schema, add missing body sections
4. **write_summary_md():** Update frontmatter to match template schema, restructure body
5. **write_uat_md():** Add YAML frontmatter, restructure to Current Test/Tests/Summary/Gaps
6. **write_verification_md():** Add YAML frontmatter, restructure to match template sections
7. **create_directory_structure():** Add templates/, issues/, quick/, todos/, brainstorms/, deferred/, milestones/ dirs
8. **All state text:** Replace `/kata:` with `/kata-` throughout
9. **Add write_template_overrides():** New function that creates sample overrides in `.planning/templates/` for UAT-template.md and changelog-entry.md
10. **Add write_claude_md():** Creates minimal CLAUDE.md in project root
11. **build_* functions:** Add template override creation for states >= milestone-defined

### File

- `../kata-burner/create-test-project.sh` (update in place)

## Deliverable 3: Update Test Fixture

The minimal fixture at `tests/fixtures/kata-project/` also needs updating to match current formats.

- `tests/fixtures/kata-project/.planning/STATE.md` — Update to prose format
- `tests/fixtures/kata-project/.planning/config.json` — Add (currently missing; some tests create inline)
- `tests/fixtures/kata-project/.planning/templates/` — Add directory with sample override for template tests

## Deliverable 4: Process Documentation

Update `CLAUDE.md` development commands section:

```
### Testing

# Fast script tests (no Claude invocation, <5s)
npm run test:scripts

# Build artifact validation
npm run test:artifacts

# Full test suite including skill tests ($$$)
npm run test:all

# Only tests affected by current branch changes
npm run test:affected
```

## Execution Order

1. Deliverable 1 (template tests) — highest value, prevents regression
2. Deliverable 3 (update fixture) — needed by template tests
3. Deliverable 2 (create-test-project.sh) — manual testing support
4. Deliverable 4 (docs) — process integration

## Verification

After implementation:
```bash
npm run build:plugin          # Rebuild
npm run test:scripts          # New template tests pass
npm test                      # Existing tests still pass
npm run test:artifacts        # Artifact validation still passes
```

Manual: Run `create-test-project.sh`, select "Milestone Defined", verify generated files match current Kata formats.
