---
kata_template:
  name: "Custom Summary (Test Fixture)"
  version: 2
  required:
    frontmatter: [phase, plan, subsystem, tags, duration, completed]
    body: [Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made]
  optional:
    frontmatter: [requires, provides, affects]
    body: [Deviations from Plan, Issues Encountered]
---

# Custom Summary Template

```markdown
---
phase: XX-name
plan: YY
subsystem: category
tags: [tag1, tag2]
duration: Xmin
completed: YYYY-MM-DD
---

# Phase [X]: [Name] Summary

**[One-liner]**

## Performance

- **Duration:** [time]
- **Tasks:** [count]

## Accomplishments
- [Outcome 1]
- [Outcome 2]

## Task Commits
1. **Task 1: [name]** - `abc123f`

## Files Created/Modified
- `path/to/file.ts` - What it does

## Decisions Made
Key decisions here
```
