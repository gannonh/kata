---
phase: 04
plan: GAP-2
type: fix
wave: 1
autonomous: true
files_modified:
  - skills/kata-planning-phases/SKILL.md
---

<objective>
Fix Claude skipping Step 13 (GitHub Issue Update) after plan verification passes.

**Root Cause:** Step 11 says "Proceed to step 13" but Claude interprets this loosely and jumps directly to "present final status" without executing Step 13's bash commands.

**Evidence:**
- Transcript shows Claude saying "Now I'll present the final status" (not following Step 11's exact text)
- No `gh issue` commands appear in transcript
- GitHub issue still has placeholder text after planning completes

**Fix Strategy:** Make Step 11's routing explicit with action verbs, and change Step 13's title to not sound optional.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Make Step 11 routing explicit</name>
  <files>skills/kata-planning-phases/SKILL.md</files>
  <action>
In Step 11 "Handle Checker Return", replace the weak "Proceed to step 13" instruction with explicit action:

**Before:**
```markdown
**If `## VERIFICATION PASSED`:**
- Display: `Plans verified. Ready for execution.`
- Proceed to step 13
```

**After:**
```markdown
**If `## VERIFICATION PASSED`:**
- Display: `Plans verified. Checking GitHub integration...`
- **Execute Step 13 now** — run the GitHub config check and issue update
```

This uses an action verb ("Execute") and includes what Step 13 does, making it clear Claude must run that step's content.
  </action>
  <verify>grep -A3 "VERIFICATION PASSED" skills/kata-planning-phases/SKILL.md | grep -q "Execute Step 13"</verify>
  <done>Step 11 explicitly says "Execute Step 13 now"</done>
</task>

<task type="auto">
  <name>Task 2: Remove "optional" signal from Step 13 title</name>
  <files>skills/kata-planning-phases/SKILL.md</files>
  <action>
Change Step 13's title from ambiguous "(if enabled)" phrasing to always-run phrasing:

**Before:**
```markdown
## 13. Update GitHub Issue with Plan Checklist (if enabled)
```

**After:**
```markdown
## 13. GitHub Integration Check
```

The config guard inside the step handles the "if enabled" logic. The title should not signal that the step itself is optional.
  </action>
  <verify>grep "## 13\." skills/kata-planning-phases/SKILL.md | grep -q "GitHub Integration Check"</verify>
  <done>Step 13 title is "GitHub Integration Check" (no optional signal)</done>
</task>

<task type="auto">
  <name>Task 3: Add explicit transition to Step 14</name>
  <files>skills/kata-planning-phases/SKILL.md</files>
  <action>
At the end of Step 13, before the "Error handling principle" line, add explicit routing:

**Add after the "Track result for display" section:**
```markdown
**After GitHub check completes (success or skip), proceed to Step 14.**
```

This creates a clear flow: Step 11 → Step 13 → Step 14, with no ambiguity about skipping.
  </action>
  <verify>grep -B2 "Error handling principle" skills/kata-planning-phases/SKILL.md | grep -q "proceed to Step 14"</verify>
  <done>Step 13 explicitly routes to Step 14 at the end</done>
</task>

</tasks>

<verification>
```bash
# Verify all three changes
echo "=== Step 11 routing ===" && grep -A3 "VERIFICATION PASSED" skills/kata-planning-phases/SKILL.md
echo "=== Step 13 title ===" && grep "## 13\." skills/kata-planning-phases/SKILL.md
echo "=== Step 13 end routing ===" && grep -B2 "Error handling principle" skills/kata-planning-phases/SKILL.md
```

Expected:
1. Step 11 contains "Execute Step 13 now"
2. Step 13 title is "GitHub Integration Check"
3. Step 13 ends with "proceed to Step 14"
</verification>

<success_criteria>
- [ ] Step 11 uses "Execute Step 13 now" (action verb, explicit)
- [ ] Step 13 title changed from "(if enabled)" to neutral
- [ ] Step 13 ends with explicit routing to Step 14
- [ ] Tests still pass (content verification)
</success_criteria>
