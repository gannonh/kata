---
created: 2026-01-20T18:12:58Z
title: Folder-based phase state management
area: planning
type: improvement
files:
  - .planning/phases/
  - skills/kata-executing-project-phases/SKILL.md
  - skills/kata-verifying-work-outcomes-and-user-acceptance-testing/SKILL.md
---

## Problem

Completed phases remain in the main `.planning/phases/` directory alongside pending and active phases. This makes it harder to see what work remains and clutters the phases directory over time.

## Solution

Implement folder-based phase state organization:

```
.planning/phases/
├── pending/          # Phases not yet started
│   └── 03-feature-x/
├── active/           # Currently executing phase (0-1 phases)
│   └── 02-auth-system/
└── completed/        # Finished phases
    ├── 00-setup/
    └── 01-core-models/
```

**Implementation notes:**
- Move phase folder to `completed/` upon successful verification
- Consider `active/` folder for the phase currently being executed
- Update phase discovery logic in relevant skills/workflows
- Maintain phase numbering in folder names for history
