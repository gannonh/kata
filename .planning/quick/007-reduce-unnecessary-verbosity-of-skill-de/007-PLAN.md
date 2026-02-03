---
phase: quick
plan: 007
type: execute
wave: 1
depends_on: []
files_modified:
  - skills/kata-add-issue/SKILL.md
  - skills/kata-add-milestone/SKILL.md
  - skills/kata-add-phase/SKILL.md
  - skills/kata-audit-milestone/SKILL.md
  - skills/kata-check-issues/SKILL.md
  - skills/kata-complete-milestone/SKILL.md
  - skills/kata-configure-settings/SKILL.md
  - skills/kata-debug/SKILL.md
  - skills/kata-discuss-phase/SKILL.md
  - skills/kata-execute-phase/SKILL.md
  - skills/kata-execute-quick-task/SKILL.md
  - skills/kata-help/SKILL.md
  - skills/kata-inserting-phases/SKILL.md
  - skills/kata-list-phase-assumptions/SKILL.md
  - skills/kata-map-codebase/SKILL.md
  - skills/kata-new-project/SKILL.md
  - skills/kata-pause-work/SKILL.md
  - skills/kata-plan-milestone-gaps/SKILL.md
  - skills/kata-plan-phase/SKILL.md
  - skills/kata-remove-phase/SKILL.md
  - skills/kata-research-phase/SKILL.md
  - skills/kata-resume-work/SKILL.md
  - skills/kata-review-pull-requests/SKILL.md
  - skills/kata-set-profile/SKILL.md
  - skills/kata-track-progress/SKILL.md
  - skills/kata-verify-work/SKILL.md
  - skills/kata-whats-new/SKILL.md
  - dist/plugin/skills/kata-*/SKILL.md
autonomous: true

must_haves:
  truths:
    - "No skill description starts with 'Use this skill when' or 'Use this skill to'"
    - "All descriptions start with an imperative verb"
    - "Source and dist copies are identical"
  artifacts:
    - path: "skills/kata-*/SKILL.md"
      provides: "Source skill definitions"
      contains: "description:"
    - path: "dist/plugin/skills/kata-*/SKILL.md"
      provides: "Built skill definitions"
      contains: "description:"
  key_links:
    - from: "skills/kata-*/SKILL.md"
      to: "dist/plugin/skills/kata-*/SKILL.md"
      via: "identical description fields"
      pattern: "description:"
---

<objective>
Remove "Use this skill when" and "Use this skill to" filler from all 27 skill description fields.

Purpose: Skill descriptions are consumed by Claude for matching. Starting with the action verb is more direct and matches the imperative voice style guide.
Output: All 27 SKILL.md files updated in both skills/ and dist/plugin/skills/ directories.
</objective>

<context>
@.planning/PROJECT.md
@KATA-STYLE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update all source skill descriptions</name>
  <files>skills/kata-*/SKILL.md (all 27 files)</files>
  <action>
For each of the 27 SKILL.md files in skills/kata-*/, edit the `description:` field in the YAML frontmatter to remove the leading filler phrase:

**Pattern A — "Use this skill when" + gerund:**
- Remove "Use this skill when " prefix
- Convert the first gerund to imperative form (e.g., "archiving" -> "Archive", "executing" -> "Execute", "showing" -> "Show", "creating" -> "Create", "gathering" -> "Gather", "debugging" -> "Systematically debug")
- Capitalize the new first word

**Pattern B — "Use this skill to" + infinitive:**
- Remove "Use this skill to " prefix
- Capitalize what follows (e.g., "to plan" -> "Plan", "to capture" -> "Capture", "to run" -> "Run", "to verify" -> "Verify")

**Pattern C — "Use this skill when" + bare verb (e.g., "configure", "remove"):**
- Remove "Use this skill when " prefix
- Capitalize the verb (e.g., "configure" -> "Configure", "remove" -> "Remove")

Keep the rest of the description intact including all trigger phrases.

Specific transformations for all 27 skills:

1. kata-add-issue: "Use this skill to capture" -> "Capture"
2. kata-add-milestone: "Use this skill when adding" -> "Add"
3. kata-add-phase: "Use this skill to add" -> "Add"
4. kata-audit-milestone: "Use this skill to verify" -> "Verify"
5. kata-check-issues: "Use this skill when reviewing" -> "Review"
6. kata-complete-milestone: "Use this skill when archiving" -> "Archive"
7. kata-configure-settings: "Use this skill when configure" -> "Configure"
8. kata-debug: "Use this skill when systematically debugging" -> "Systematically debug"
9. kata-discuss-phase: "Use this skill when gathering" -> "Gather"
10. kata-execute-phase: "Use this skill when executing" -> "Execute"
11. kata-execute-quick-task: "Use this skill when executing" -> "Execute"
12. kata-help: "Use this skill when showing" -> "Show"
13. kata-inserting-phases: "Use this skill when inserting" -> "Insert"
14. kata-list-phase-assumptions: "Use this skill when surfacing" -> "Surface"
15. kata-map-codebase: "Use this skill when analyzing" -> "Analyze"
16. kata-new-project: "Use this skill when initialize" -> "Initialize"
17. kata-pause-work: "Use this skill when creating" -> "Create"
18. kata-plan-milestone-gaps: "Use this skill when create" -> "Create"
19. kata-plan-phase: "Use this skill to plan" -> "Plan"
20. kata-remove-phase: "Use this skill when remove" -> "Remove"
21. kata-research-phase: "Use this skill when researching" -> "Research"
22. kata-resume-work: "Use this skill when resuming" -> "Resume"
23. kata-review-pull-requests: "Use this skill to run" -> "Run"
24. kata-set-profile: "Use this skill when switch" -> "Switch"
25. kata-track-progress: "Use this skill when check" -> "Check"
26. kata-verify-work: "Use this skill when validating" -> "Validate"
27. kata-whats-new: "Use this skill when showing" -> "Show"
  </action>
  <verify>
Run: `grep -r "Use this skill" skills/kata-*/SKILL.md` — should return zero results.
Run: `grep "^description:" skills/kata-*/SKILL.md | head -5` — confirm descriptions start with imperative verbs.
  </verify>
  <done>All 27 source SKILL.md description fields start with imperative verbs, no "Use this skill" filler remains.</done>
</task>

<task type="auto">
  <name>Task 2: Sync changes to dist/plugin copies</name>
  <files>dist/plugin/skills/kata-*/SKILL.md (all 27 files)</files>
  <action>
Apply the exact same description changes to all 27 SKILL.md files in dist/plugin/skills/kata-*/. The dist copies must have identical description fields to their source counterparts.

Approach: For each skill, read the updated description from skills/kata-{name}/SKILL.md and apply the same edit to dist/plugin/skills/kata-{name}/SKILL.md. The body content of dist files may differ from source (build transforms apply), so only edit the description field in frontmatter — do NOT replace the entire file.
  </action>
  <verify>
Run: `grep -r "Use this skill" dist/plugin/skills/kata-*/SKILL.md` — should return zero results.
Run: `diff <(grep "^description:" skills/kata-*/SKILL.md | sed 's|skills/||') <(grep "^description:" dist/plugin/skills/kata-*/SKILL.md | sed 's|dist/plugin/skills/||')` — should show no differences.
  </verify>
  <done>All 27 dist SKILL.md description fields match their source counterparts exactly.</done>
</task>

</tasks>

<verification>
- `grep -rc "Use this skill" skills/kata-*/SKILL.md dist/plugin/skills/kata-*/SKILL.md` returns 0 for all files
- All 54 SKILL.md files (27 source + 27 dist) have descriptions starting with imperative verbs
- No other content in the files was modified
</verification>

<success_criteria>
- Zero occurrences of "Use this skill when" or "Use this skill to" across all 54 SKILL.md files
- All descriptions begin with an imperative verb (Capture, Add, Plan, Execute, etc.)
- Source and dist description fields are identical for each skill
- No unintended changes to file content beyond the description field
</success_criteria>

<output>
After completion, create `.planning/quick/007-reduce-unnecessary-verbosity-of-skill-de/007-SUMMARY.md`
</output>
