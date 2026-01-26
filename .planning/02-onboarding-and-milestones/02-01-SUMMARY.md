---
phase: 02-onboarding-and-milestones
plan: 01
subsystem: onboarding
tags: [github, config, skill, onboarding]

dependency_graph:
  requires: [01-02]
  provides: [github-onboarding-questions]
  affects: [02-02, 02-03]

tech_stack:
  added: []
  patterns: [conditional-question-flow, config-namespace]

key_files:
  created: []
  modified:
    - skills/kata-starting-projects/SKILL.md

decisions:
  - key: github-tracking-default
    choice: "Optional, recommended"
    rationale: "GitHub integration opt-in maintains backward compatibility"

metrics:
  duration: 3min
  completed: 2026-01-25
---

# Phase 02 Plan 01: GitHub Onboarding Questions Summary

**One-liner:** GitHub Milestone/Issue tracking questions added to kata-starting-projects Phase 5 with conditional flow and config.json integration.

## What Was Built

Extended the kata-starting-projects skill to prompt users about GitHub integration during new project onboarding. Users can now opt-in to GitHub Milestone/Issue tracking from project initialization.

### Key Deliverables

| Deliverable | Location | Description |
| ----------- | -------- | ----------- |
| GitHub Tracking question | SKILL.md line 297 | Primary question in Phase 5 Round 1 |
| Issue Creation follow-up | SKILL.md line 307 | Conditional question (only if GitHub enabled) |
| config.json template | SKILL.md line 393 | Updated with github namespace |
| Conditional logic docs | SKILL.md lines 408-422 | Yes/No path handling documented |

## Technical Details

### Question Flow

```
GitHub Tracking: "Enable GitHub Milestone/Issue tracking?"
├── Yes (Recommended) → Issue Creation question
│   ├── Auto → github.issueMode: "auto"
│   ├── Ask per milestone → github.issueMode: "ask"
│   └── Never → github.issueMode: "never"
└── No → Skip Issue Creation, set github.enabled: false, github.issueMode: "never"
```

### Config Schema Addition

```json
{
  "github": {
    "enabled": true|false,
    "issueMode": "auto|ask|never"
  }
}
```

## Commits

| Hash | Type | Description |
| ---- | ---- | ----------- |
| 5af40d4 | feat | Add GitHub integration questions to project onboarding |

## Verification Results

All verification checks passed:

- [x] GitHub Tracking question exists in Phase 5 (line 297)
- [x] Issue Creation conditional question documented (line 307)
- [x] config.json template includes github.enabled and github.issueMode
- [x] Conditional flow handles both Yes (line 410) and No (line 419) responses
- [x] 3 occurrences of "If GitHub Tracking" documented (exceeds requirement of >= 2)

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Ready for 02-02: Create milestone sync skill (`kata-syncing-milestones`). Foundation established:
- GitHub config namespace defined in Phase 1
- Onboarding questions capture user preferences
- config.json structure ready for consumption by sync skill
