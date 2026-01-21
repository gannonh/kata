---
name: audit-milestone
description: Audit milestone completion against original intent before archiving
argument-hint: "[version]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
  - Write
---

<objective>
Verify milestone achieved its definition of done. Check requirements coverage, cross-phase integration, and end-to-end flows.

</objective>

<step name="parse_arguments">
Version: $ARGUMENTS (optional — defaults to current milestone)
</step>

<step name="run_skill">
Run the following skill to audit the milestone:
Skill("kata-auditing-milestones")
</step>