---
phase: quick
plan: 008
type: execute
wave: 1
depends_on: []
files_modified:
  - hooks/hooks.json
  - hooks/kata-setup-statusline.js (delete)
  - hooks/kata-plugin-statusline.js (delete)
  - hooks/kata-config-validator.js
  - scripts/build-hooks.cjs
  - skills/kata-new-project/SKILL.md
  - skills/kata-configure-settings/SKILL.md
  - skills/kata-configure-settings/scripts/read-pref.sh
  - skills/kata-execute-phase/references/planning-config.md
  - .planning/config.json
  - .claude/hooks/kata-statusline.js (delete)
autonomous: true

must_haves:
  truths:
    - "No file references 'statusline' except this plan and its summary"
    - "hooks.json has no statusline hook entry"
    - "build-hooks.cjs has no statusline entries"
    - "config.json has no display.statusline block"
  artifacts:
    - path: "hooks/hooks.json"
      provides: "SessionStart hooks without statusline"
    - path: "hooks/kata-config-validator.js"
      provides: "Config validator without display.statusline key"
    - path: "scripts/build-hooks.cjs"
      provides: "Hook build script without statusline entries"
---

<objective>
Remove the statusline feature from Kata entirely. Delete statusline hook files, remove statusline references from config schema, settings UI, project setup, and planning config.

Purpose: The statusline feature is deprecated. All traces must be removed from hooks, skills, scripts, and config.
Output: Zero references to statusline remain in the codebase (excluding planning artifacts).
</objective>

<context>
Files to DELETE (3):
- hooks/kata-setup-statusline.js — SessionStart hook that sets up statusline
- hooks/kata-plugin-statusline.js — Plugin statusline hook
- .claude/hooks/kata-statusline.js — Project-local copy

Files to EDIT (8):
- hooks/hooks.json — Remove kata-setup-statusline.js entry from SessionStart array
- hooks/kata-config-validator.js — Remove 'display.statusline' from KNOWN_KEYS (line 15)
- scripts/build-hooks.cjs — Remove 3 statusline entries from HOOKS_TO_COPY array
- skills/kata-new-project/SKILL.md — Remove display.statusline from config schema, remove "Statusline setup" section (lines ~600-640)
- skills/kata-configure-settings/SKILL.md — Remove STATUSLINE read-pref call, statusline question from settings UI, set-config call, side-effects sections, summary table entry
- skills/kata-configure-settings/scripts/read-pref.sh — Remove 'display.statusline' default (line 26)
- skills/kata-execute-phase/references/planning-config.md — Remove display.statusline from schema, reference table, and "Display Settings" section
- .planning/config.json — Remove the "display": { "statusline": false } block
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete statusline hook files and clean hook infrastructure</name>
  <files>hooks/kata-setup-statusline.js, hooks/kata-plugin-statusline.js, .claude/hooks/kata-statusline.js, hooks/hooks.json, scripts/build-hooks.cjs, hooks/kata-config-validator.js, .planning/config.json</files>
  <action>
1. Delete 3 files:
   ```bash
   rm hooks/kata-setup-statusline.js
   rm hooks/kata-plugin-statusline.js
   rm .claude/hooks/kata-statusline.js
   ```

2. Edit hooks/hooks.json — Remove the kata-setup-statusline.js entry from the SessionStart hooks array. The result should have only two hooks remaining (kata-template-drift.js and kata-config-validator.js):
   ```json
   {
     "description": "Kata framework hooks for session management",
     "hooks": {
       "SessionStart": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-template-drift.js"
             },
             {
               "type": "command",
               "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/kata-config-validator.js"
             }
           ]
         }
       ]
     }
   }
   ```

3. Edit scripts/build-hooks.cjs — Remove all 3 statusline entries from HOOKS_TO_COPY. The array should contain only:
   ```javascript
   const HOOKS_TO_COPY = [
     'kata-check-update.js'
   ];
   ```
   Note: kata-npm-statusline.js doesn't exist on disk but is listed in the array. Remove it along with the other two.

4. Edit hooks/kata-config-validator.js — Remove line 15 (`'display.statusline': { type: 'boolean' },`) from the KNOWN_KEYS object.

5. Edit .planning/config.json — Remove the entire `"display": { "statusline": false }` block (lines 8-10), including the trailing comma on the preceding line if needed. Ensure valid JSON.
  </action>
  <verify>
```bash
# Deleted files should not exist
[ ! -f hooks/kata-setup-statusline.js ] && echo "PASS: setup deleted" || echo "FAIL"
[ ! -f hooks/kata-plugin-statusline.js ] && echo "PASS: plugin deleted" || echo "FAIL"
[ ! -f .claude/hooks/kata-statusline.js ] && echo "PASS: project-local deleted" || echo "FAIL"

# hooks.json should not reference statusline
grep -c "statusline" hooks/hooks.json && echo "FAIL" || echo "PASS: hooks.json clean"

# build-hooks.cjs should not reference statusline
grep -c "statusline" scripts/build-hooks.cjs && echo "FAIL" || echo "PASS: build-hooks clean"

# config-validator should not reference statusline
grep -c "statusline" hooks/kata-config-validator.js && echo "FAIL" || echo "PASS: validator clean"

# config.json should not reference statusline
grep -c "statusline" .planning/config.json && echo "FAIL" || echo "PASS: config clean"

# config.json should be valid JSON
node -e "JSON.parse(require('fs').readFileSync('.planning/config.json','utf8')); console.log('PASS: valid JSON')"
```
  </verify>
  <done>All 3 statusline hook files deleted. hooks.json, build-hooks.cjs, kata-config-validator.js, and config.json cleaned of statusline references.</done>
</task>

<task type="auto">
  <name>Task 2: Remove statusline from skills and config documentation</name>
  <files>skills/kata-new-project/SKILL.md, skills/kata-configure-settings/SKILL.md, skills/kata-configure-settings/scripts/read-pref.sh, skills/kata-execute-phase/references/planning-config.md</files>
  <action>
1. **skills/kata-configure-settings/SKILL.md** — Remove all statusline traces:
   a. Remove the STATUSLINE read-pref line (~line 35):
      `STATUSLINE=$(bash "$SCRIPT_DIR/read-pref.sh" "display.statusline" "true")`
   b. Remove the statusline question from the AskUserQuestion settings UI (~lines 130-135, the object with `question: "Enable Kata statusline?"` and its two options)
   c. Remove the `bash "$SCRIPT_DIR/set-config.sh" "display.statusline" "$NEW_STATUSLINE"` call (~line 217)
   d. Remove the entire "If `display.statusline` changed to `true`:" section (~lines 252-280) which includes the .claude/settings.json setup code
   e. Remove the entire "If `display.statusline` changed to `false`:" section (~line 283+) which includes the removal instructions
   f. Remove statusline from the summary table row if present (~line 378)

2. **skills/kata-configure-settings/scripts/read-pref.sh** — Remove line 26:
   `'display.statusline': 'true',`

3. **skills/kata-new-project/SKILL.md** — Two removals:
   a. Remove `"statusline": true` from the config schema example (~line 380)
   b. Remove the entire "Statusline setup" section (~lines 600-640) which includes the .claude/settings.json creation and statusline hook installation

4. **skills/kata-execute-phase/references/planning-config.md** — Three removals:
   a. Remove `"statusline": true|false` from the config schema example (~line 21)
   b. Remove the `| display.statusline |` row from the reference table (~line 40)
   c. Remove the entire `### display.statusline (default: true)` section (~lines 370-388) which includes the description, behavior when true/false, and the bash snippet
  </action>
  <verify>
```bash
# No statusline references should remain in any skill or reference
grep -rc "statusline" \
  skills/kata-configure-settings/SKILL.md \
  skills/kata-configure-settings/scripts/read-pref.sh \
  skills/kata-new-project/SKILL.md \
  skills/kata-execute-phase/references/planning-config.md \
  && echo "FAIL: statusline references remain" || echo "PASS: all clean"
```
  </verify>
  <done>All statusline references removed from skills, read-pref defaults, and planning-config documentation.</done>
</task>

</tasks>

<verification>
```bash
echo "=== Full Verification ==="

# 1. Deleted files
for f in hooks/kata-setup-statusline.js hooks/kata-plugin-statusline.js .claude/hooks/kata-statusline.js; do
  [ ! -f "$f" ] && echo "PASS: $f deleted" || echo "FAIL: $f still exists"
done

# 2. No statusline references in codebase (excluding planning artifacts)
echo "Remaining statusline references (excluding .planning/quick/):"
grep -r "statusline" --include="*.js" --include="*.md" --include="*.json" --include="*.sh" \
  hooks/ scripts/ skills/ .planning/config.json .claude/ 2>/dev/null | grep -v ".planning/quick/" || echo "PASS: zero references"

# 3. JSON validity
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('PASS: hooks.json valid')"
node -e "JSON.parse(require('fs').readFileSync('.planning/config.json','utf8')); console.log('PASS: config.json valid')"

# 4. Build still works
npm run build:plugin >/dev/null 2>&1 && echo "PASS: build succeeds" || echo "FAIL: build broken"
```
</verification>

<success_criteria>
- [ ] hooks/kata-setup-statusline.js deleted
- [ ] hooks/kata-plugin-statusline.js deleted
- [ ] .claude/hooks/kata-statusline.js deleted
- [ ] hooks/hooks.json has no statusline entry
- [ ] scripts/build-hooks.cjs has no statusline entries
- [ ] hooks/kata-config-validator.js has no display.statusline key
- [ ] .planning/config.json has no display block
- [ ] skills/kata-configure-settings/SKILL.md has no statusline references
- [ ] skills/kata-configure-settings/scripts/read-pref.sh has no statusline default
- [ ] skills/kata-new-project/SKILL.md has no statusline config or setup section
- [ ] skills/kata-execute-phase/references/planning-config.md has no statusline schema, table row, or section
- [ ] All JSON files remain valid
- [ ] `npm run build:plugin` succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/008-deprecate-status-line-feature/008-SUMMARY.md`
</output>
