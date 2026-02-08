---
status: testing
phase: 38-template-overrides
source: [38-01-SUMMARY.md, 38-02-SUMMARY.md]
started: 2026-02-08T15:00:00Z
updated: 2026-02-08T15:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Five standalone template files exist with schema comments
expected: |
  Running: `for f in skills/kata-complete-milestone/references/changelog-entry.md skills/kata-plan-phase/references/plan-template.md skills/kata-verify-work/references/verification-report.md skills/kata-execute-phase/references/summary-template.md skills/kata-verify-work/references/UAT-template.md; do head -3 "$f"; echo "---"; done`
  Each file exists and starts with `<!-- kata-template-schema`
awaiting: user response

## Tests

### 1. Five standalone template files exist with schema comments
expected: All 5 template files exist in their skill's references/ directory, each starting with a kata-template-schema HTML comment
result: [pending]

### 2. resolve-template.sh returns plugin default when no override
expected: Running `CLAUDE_PLUGIN_ROOT="$(pwd)" bash skills/kata-execute-phase/scripts/resolve-template.sh summary-template.md` returns a path to skills/kata-execute-phase/references/summary-template.md
result: [pending]

### 3. resolve-template.sh returns project override when present
expected: Creating .planning/templates/summary-template.md and running resolve-template.sh returns the project override path instead of the plugin default
result: [pending]

### 4. Four orchestrator skills reference resolve-template.sh
expected: Running `grep -l "resolve-template.sh" skills/kata-execute-phase/references/phase-execute.md skills/kata-complete-milestone/references/milestone-complete.md skills/kata-verify-work/references/verify-work.md skills/kata-plan-phase/SKILL.md` returns all 4 files
result: [pending]

### 5. Drift hook emits nothing when no .planning/templates/ exists
expected: Running `echo '{"cwd":"'"$(pwd)"'"}' | CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/kata-template-drift.js` produces no output
result: [pending]

### 6. Drift hook warns when project override is missing required fields
expected: Creating a minimal .planning/templates/summary-template.md and running the drift hook emits a warning about missing required fields
result: [pending]

### 7. hooks.json registers both session-start hooks
expected: hooks/hooks.json contains both kata-setup-statusline.js and kata-template-drift.js entries
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
