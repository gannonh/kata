# M010 UAT Plan — Preferences Config Editor (`/kata config`)

**Milestone:** [M010] Preferences Config Editor  
**Branch:** `cli/uat/M010`  
**Date:** 2026-03-30  
**Status:** Plan ready (execution pending)

---

## 1) UAT Scope

Validate that M010 shipped a production-ready, user-facing preferences editor for Kata CLI:

- `/kata config` is discoverable and routable
- editor loads `.kata/preferences.md` (creating it when missing)
- all preferences fields are editable with correct type handling
- save/cancel behavior is safe and predictable
- validation blocks invalid config writes
- YAML frontmatter + markdown body round-trip safely
- existing `/kata` and Symphony config editor behavior remains intact

---

## 2) Ticket Review (M010)

### Slices

1. **KAT-1868 / S01 — Preferences model, parser, writer**
   - Tasks: KAT-1870, KAT-1871, KAT-1872
   - Delivered: preferences field model, parser, writer, and round-trip test coverage

2. **KAT-1880 / S02 — Validator + ConfigEditor integration**
   - Tasks: KAT-1881, KAT-1882
   - Delivered: preferences validator and parse → edit → validate → write integration tests

3. **KAT-1887 / S03 — `/kata config` command wiring**
   - Tasks: KAT-1888, KAT-1890
   - Delivered: command routing/completions, real TUI bridge, save/cancel + error handling

### Key milestone decisions to verify in UAT

- **D019:** Reuse Symphony ConfigEditor/model/render surfaces
- **D020:** Project-scope editor only (`.kata/preferences.md`)
- **D021:** Complex fields (`skill_rules`, `custom_instructions`) use text-editor fallback

---

## 3) Code Change Review (M010 commits)

### Commit map

- `6e475021` — S01 implementation
- `52c9675f` — S02 implementation
- `b1380731` — S03 implementation

### New files

- `src/resources/extensions/kata/prefs-model.ts`
- `src/resources/extensions/kata/prefs-parser.ts`
- `src/resources/extensions/kata/prefs-writer.ts`
- `src/resources/extensions/kata/prefs-validator.ts`
- `src/resources/extensions/kata/prefs-config-command.ts`
- `src/resources/extensions/kata/tests/prefs-model.vitest.test.ts`
- `src/resources/extensions/kata/tests/prefs-parser.vitest.test.ts`
- `src/resources/extensions/kata/tests/prefs-writer.vitest.test.ts`
- `src/resources/extensions/kata/tests/prefs-validator.vitest.test.ts`
- `src/resources/extensions/kata/tests/prefs-integration.vitest.test.ts`

### Modified files (M010-relevant)

- `src/resources/extensions/kata/commands.ts` (subcommand + routing)
- `src/resources/extensions/symphony/config-model.ts` (generic model support)
- `src/resources/extensions/symphony/config-render.ts` (editor header options)
- `src/resources/extensions/symphony/config-{parser,writer,validator}.ts` (type compatibility updates)
- `src/resources/extensions/symphony/tests/symphony-config-editor.vitest.test.ts`
- `src/tests/app-smoke.test.ts`
- `vitest.config.ts`

---

## 4) Risks to prioritize during UAT

1. **Data integrity risk:** frontmatter corruption or body loss on save
2. **Validation UX risk:** invalid values allowed through or silently rewritten
3. **Complex field UX risk:** `string[]` and `skill_rules` editing produces wrong serialization
4. **Command discoverability risk:** `/kata config` route/completions missing in real TUI flow
5. **Shared-component regression risk:** changes to Symphony config model/render break existing `/symphony config`

---

## 5) Environment Matrix

Execute UAT in at least these environments:

1. **Clean project** (no `.kata/preferences.md`)
2. **Configured project** (valid existing `.kata/preferences.md`)
3. **Malformed YAML project** (intentionally broken frontmatter)
4. **Type-invalid values project** (syntactically valid YAML, semantically invalid values)

Suggested setup:

```bash
cd apps/cli
npm run build
```

For manual UAT, use an isolated temp project directory to avoid mutating real preferences unexpectedly.

---

## 6) UAT Execution Plan

## Phase A — Automated confidence gate

Run before manual acceptance:

```bash
cd apps/cli
npx tsc --noEmit
npx vitest run src/resources/extensions/kata/tests/prefs-model.vitest.test.ts
npx vitest run src/resources/extensions/kata/tests/prefs-parser.vitest.test.ts
npx vitest run src/resources/extensions/kata/tests/prefs-writer.vitest.test.ts
npx vitest run src/resources/extensions/kata/tests/prefs-validator.vitest.test.ts
npx vitest run src/resources/extensions/kata/tests/prefs-integration.vitest.test.ts
npx vitest run src/resources/extensions/symphony/tests/symphony-config-editor.vitest.test.ts
```

Optional full confidence sweep:

```bash
bun run test
```

**Pass criteria:** all commands exit 0.

---

## Phase B — User-facing manual acceptance (primary)

### UAT-M010-01 — Command discoverability

- **Goal:** `/kata config` is visible and callable
- **Steps:**
  1. Start Kata CLI in a project
  2. Enter `/kata` and inspect helper output/completions
  3. Execute `/kata config`
- **Expected:** editor opens (no unknown command warning)
- **Covers:** KAT-1888

### UAT-M010-02 — Missing preferences bootstrap

- **Precondition:** `.kata/preferences.md` absent
- **Steps:** run `/kata config`
- **Expected:** file is auto-created from template, then editor opens
- **Covers:** KAT-1890, D020

### UAT-M010-03 — Editor header + structure

- **Steps:** open editor and inspect top section
- **Expected:**
  - header includes `Kata Preferences Editor`
  - file path is shown
  - sections render correctly (General, Workflow, Linear, PR, Models, Symphony, Skills, Auto Supervisor)
- **Covers:** KAT-1890, config-render updates

### UAT-M010-04 — String field edit and persistence

- **Steps:**
  1. Edit `linear.teamKey`
  2. Save
  3. Re-open `/kata config`
- **Expected:** new value persists in editor + file
- **Covers:** KAT-1882, KAT-1890

### UAT-M010-05 — Enum field edit and persistence

- **Steps:** edit `skill_discovery` (`auto/suggest/off`) and save
- **Expected:** enum selection persists and serializes correctly
- **Covers:** KAT-1881, KAT-1882

### UAT-M010-06 — Boolean and numeric field handling

- **Steps:**
  1. Toggle `pr.enabled`
  2. Edit `auto_supervisor.soft_timeout_minutes`
  3. Save and re-open
- **Expected:**
  - booleans stored as booleans
  - numbers stored as numeric YAML values
- **Covers:** KAT-1881

### UAT-M010-07 — `string[]` fields and multiline behavior

- **Steps:** edit `always_use_skills` and `custom_instructions` with multi-line input
- **Expected:** values serialize to YAML arrays and rehydrate correctly in editor
- **Covers:** KAT-1872, KAT-1890, D021

### UAT-M010-08 — `skill_rules` text-editor fallback

- **Steps:** edit `skill_rules` with multiple rule lines, save, reopen
- **Expected:** values are preserved and editable through text fallback without corruption
- **Covers:** D021

### UAT-M010-09 — Cancel leaves file untouched

- **Precondition:** capture checksum before open (`shasum .kata/preferences.md`)
- **Steps:** open `/kata config`, make edits, cancel
- **Expected:** checksum unchanged
- **Covers:** success criterion + KAT-1890

### UAT-M010-10 — Validation blocks bad enum values

- **Precondition:** create syntactically valid but invalid value (e.g. `workflow.mode: file`)
- **Steps:** open editor, attempt save
- **Expected:** validation error shown; no write occurs
- **Covers:** KAT-1881, KAT-1890

### UAT-M010-11 — Validation blocks bad number/boolean values

- **Precondition:** invalid values like string in numeric/boolean field
- **Steps:** save through editor
- **Expected:** specific issue list shown; no write occurs
- **Covers:** KAT-1881

### UAT-M010-12 — Parse error reporting quality

- **Precondition:** malformed YAML frontmatter (syntax error)
- **Steps:** run `/kata config`
- **Expected:** parse error with line number (when available), no crash
- **Covers:** KAT-1872, KAT-1890

---

## Phase C — Regression checks

### UAT-M010-13 — `/kata prefs` unaffected

- **Steps:** run `/kata prefs status`, `/kata prefs project`
- **Expected:** existing behavior intact
- **Covers:** command routing regression guard

### UAT-M010-14 — Other `/kata` subcommands unaffected

- **Steps:** smoke `/kata status`, `/kata plan` (or other normal subcommands)
- **Expected:** no regressions from command handler changes
- **Covers:** `commands.ts` integration safety

### UAT-M010-15 — Symphony config editor still works

- **Steps:** run `/symphony config`
- **Expected:** header/rendering/functionality unaffected
- **Covers:** shared `config-model` + `config-render` compatibility

---

## 7) Evidence capture checklist

For each UAT case, capture:

- terminal transcript snippet (or saved log)
- before/after preference excerpts (for save cases)
- checksum proof for cancel case
- exact validation message text for failure-path cases
- any screenshots for TUI visual structure (optional but recommended)

Use this lightweight result template per case:

```markdown
### UAT-M010-XX — <name>
- Result: Pass | Fail
- Evidence:
  - Command(s):
  - Output snippet:
  - File diff/checksum:
- Notes:
```

---

## 8) Exit criteria (GO / NO-GO)

**GO requires all of the following:**

- All Phase A checks pass
- All Phase B user-facing cases pass
- No data-loss/corruption defects in save/cancel/round-trip scenarios
- Validation reliably blocks invalid enums, numbers, booleans
- No regressions in `/kata prefs`, other `/kata` commands, or `/symphony config`

**NO-GO triggers:**

- any frontmatter/body corruption
- cancel mutates file
- invalid config can be saved
- editor fails to open in supported baseline setup

---

## 9) Suggested execution order (fastest signal first)

1. Phase A automated checks
2. UAT-M010-02 (bootstrap) + 03 (structure)
3. UAT-M010-04/05/06/07/08 (core editing)
4. UAT-M010-09/10/11/12 (safety/failure paths)
5. UAT-M010-13/14/15 (regression)

This order surfaces high-severity issues early (routing, persistence, corruption) before lower-risk polish checks.
