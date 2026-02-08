<!-- kata-template-schema
required-fields:
  frontmatter: [phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves]
  body: [objective, execution_context, context, tasks, verification, success_criteria, output]
optional-fields:
  frontmatter: [user_setup, source_issue, gap_closure]
  body: []
version: 1
-->

# PLAN.md Template

```markdown
---
phase: XX-name
plan: NN
type: execute
wave: N                     # Execution wave (1, 2, 3...)
depends_on: []              # Plan IDs this plan requires
files_modified: []          # Files this plan touches
autonomous: true            # false if plan has checkpoints
user_setup: []              # Human-required setup (omit if empty)
source_issue: ""            # Optional: github:#N or local file path

must_haves:
  truths: []                # Observable behaviors
  artifacts: []             # Files that must exist
  key_links: []             # Critical connections
---

<objective>
[What this plan accomplishes]

Purpose: [Why this matters for the project]
Output: [What artifacts will be created]
</objective>

<execution_context>
<!-- Executor agent has built-in instructions for plan execution and summary creation -->
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Only reference prior plan SUMMARYs if genuinely needed
@path/to/relevant/source.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext</files>
  <action>[Specific implementation]</action>
  <verify>[Command or check]</verify>
  <done>[Acceptance criteria]</done>
</task>

</tasks>

<verification>
[Overall phase checks]
</verification>

<success_criteria>
[Measurable completion]
</success_criteria>

<output>
After completion, create `.planning/phases/XX-name/{phase}-{plan}-SUMMARY.md`
</output>
```
