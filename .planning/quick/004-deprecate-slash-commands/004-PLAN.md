---
phase: quick
plan: 004
type: execute
wave: 1
depends_on: []
files_modified:
  - commands/kata/*.md (delete 29 files)
  - skills/*/SKILL.md (update 27 files)
  - scripts/build.js
  - CLAUDE.md
  - KATA-STYLE.md
  - .planning/STATE.md
autonomous: true

must_haves:
  truths:
    - "Skills can be invoked directly via /kata:skill-name"
    - "Commands directory no longer exists"
    - "Build produces working plugin without commands"
  artifacts:
    - path: "skills/*/SKILL.md"
      provides: "User-invocable skills"
      contains: "user-invocable: true"
    - path: "scripts/build.js"
      provides: "Plugin build without commands"
---

<objective>
Deprecate slash commands and consolidate on user-invocable skills.

Purpose: Commands are thin wrappers that just invoke skills. With Claude Code's native skill system, users can invoke skills directly via /kata:skill-name. The indirection is unnecessary.

Output: Skills become directly invocable, commands directory deleted, build updated.
</objective>

<context>
Current state:
- 29 command files in commands/kata/ (thin wrappers calling Skill())
- 27 skill files with user-invocable: false
- Skills have redundant <user_command> tags
- build.js includes commands/kata in INCLUDES array
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update all skills to be user-invocable</name>
  <files>skills/*/SKILL.md (27 files)</files>
  <action>
For each SKILL.md file in skills/:

1. Change `user-invocable: false` to `user-invocable: true` in frontmatter
2. Remove the `<user_command>/kata:xxx</user_command>` line (usually line 14-15, right after frontmatter)

Do NOT change anything else in the skill files.

Files to update (27 total):
- skills/adding-issues/SKILL.md
- skills/adding-milestones/SKILL.md
- skills/adding-phases/SKILL.md
- skills/auditing-milestones/SKILL.md
- skills/checking-issues/SKILL.md
- skills/completing-milestones/SKILL.md
- skills/configuring-settings/SKILL.md
- skills/debugging/SKILL.md
- skills/discussing-phases/SKILL.md
- skills/executing-phases/SKILL.md
- skills/executing-quick-tasks/SKILL.md
- skills/inserting-phases/SKILL.md
- skills/listing-phase-assumptions/SKILL.md
- skills/mapping-codebases/SKILL.md
- skills/pausing-work/SKILL.md
- skills/planning-milestone-gaps/SKILL.md
- skills/planning-phases/SKILL.md
- skills/providing-help/SKILL.md
- skills/removing-phases/SKILL.md
- skills/researching-phases/SKILL.md
- skills/resuming-work/SKILL.md
- skills/reviewing-pull-requests/SKILL.md
- skills/setting-profiles/SKILL.md
- skills/showing-whats-new/SKILL.md
- skills/starting-projects/SKILL.md
- skills/tracking-progress/SKILL.md
- skills/verifying-work/SKILL.md

Note: reviewing-pull-requests may not have <user_command> tag (grep found 26, not 27). Check before removing.
  </action>
  <verify>
```bash
# All skills should have user-invocable: true
grep -r "user-invocable: false" skills/ | wc -l  # Should be 0

# No skills should have <user_command> tags
grep -r "<user_command>" skills/ | wc -l  # Should be 0

# All skills should have user-invocable: true
grep -r "user-invocable: true" skills/*/SKILL.md | wc -l  # Should be 27
```
  </verify>
  <done>All 27 skills have user-invocable: true and no <user_command> tags</done>
</task>

<task type="auto">
  <name>Task 2: Delete commands and update build</name>
  <files>commands/kata/*.md, scripts/build.js</files>
  <action>
1. Delete the entire commands/kata/ directory:
   ```bash
   rm -rf commands/kata/
   ```

2. In scripts/build.js, remove 'commands/kata' from the INCLUDES array (line 36):
   Change:
   ```javascript
   const INCLUDES = [
     'commands/kata',
     'skills',
     'agents',
     'hooks',
     'CHANGELOG.md',
   ];
   ```
   To:
   ```javascript
   const INCLUDES = [
     'skills',
     'agents',
     'hooks',
     'CHANGELOG.md',
   ];
   ```

3. Verify build still works:
   ```bash
   npm run build:plugin
   ```
  </action>
  <verify>
```bash
# Commands directory should not exist
ls commands/kata/ 2>&1 | grep -q "No such file" && echo "PASS: commands deleted"

# Build should succeed
npm run build:plugin && echo "PASS: build works"

# dist/plugin should NOT have commands
ls dist/plugin/commands 2>&1 | grep -q "No such file" && echo "PASS: no commands in dist"
```
  </verify>
  <done>commands/kata/ deleted, build.js updated, plugin builds successfully</done>
</task>

<task type="auto">
  <name>Task 3: Update documentation</name>
  <files>CLAUDE.md, KATA-STYLE.md, .planning/STATE.md</files>
  <action>
1. In CLAUDE.md:
   - Update "Skills Architecture" section to reflect skills are now primary interface (remove commands layer)
   - Remove or update any text about "Commands invoke skills" flow
   - Keep /kata:skill-name syntax documentation (that's how skills are invoked)
   - Update any decision log entries if present

2. In KATA-STYLE.md:
   - Remove "Slash Commands" section if it exists (commands/kata/*.md format docs)
   - Update any references to commands → skills flow
   - Keep skill invocation syntax (/kata:skill-name)

3. In .planning/STATE.md:
   - Add decision to Decisions section:
     "**2026-02-01: Commands deprecated** - Removed commands/kata/ wrapper layer. Skills are now user-invocable directly via /kata:skill-name. 29 command files deleted, 27 skills updated."

Do NOT remove references to /kata:skill-name invocation syntax - that's how skills are invoked.
Do NOT update other files (README.md can be done separately if needed).
  </action>
  <verify>
```bash
# CLAUDE.md should not reference commands → skills flow
grep -c "Commands invoke skills" CLAUDE.md  # Should be 0 or reduced

# STATE.md should have the new decision
grep -c "Commands deprecated" .planning/STATE.md  # Should be 1
```
  </verify>
  <done>Documentation updated to reflect skills-first architecture</done>
</task>

</tasks>

<verification>
```bash
# Full verification suite
echo "=== Verification ==="

# 1. Skills are user-invocable
echo "Skills with user-invocable: true:"
grep -l "user-invocable: true" skills/*/SKILL.md | wc -l

# 2. No user_command tags remain
echo "Skills with <user_command> tags:"
grep -l "<user_command>" skills/*/SKILL.md | wc -l || echo "0"

# 3. Commands deleted
echo "Commands directory exists:"
ls -d commands/kata 2>/dev/null && echo "FAIL" || echo "PASS (deleted)"

# 4. Build works
echo "Plugin build:"
npm run build:plugin >/dev/null 2>&1 && echo "PASS" || echo "FAIL"

# 5. No commands in dist
echo "Commands in dist:"
ls -d dist/plugin/commands 2>/dev/null && echo "FAIL" || echo "PASS (none)"
```
</verification>

<success_criteria>
- [ ] All 27 skills have `user-invocable: true`
- [ ] No skills have `<user_command>` tags
- [ ] commands/kata/ directory deleted (29 files)
- [ ] build.js INCLUDES no longer has 'commands/kata'
- [ ] `npm run build:plugin` succeeds
- [ ] dist/plugin/ has no commands/ directory
- [ ] CLAUDE.md updated
- [ ] KATA-STYLE.md updated
- [ ] STATE.md has decision logged
</success_criteria>

<output>
After completion, create `.planning/quick/004-deprecate-slash-commands/004-SUMMARY.md`
</output>
