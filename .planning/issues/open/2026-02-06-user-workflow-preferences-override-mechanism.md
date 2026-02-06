---
created: 2026-02-06T10:29
title: Add user workflow preferences override mechanism
area: planning
provenance: github:gannonh/kata-orchestrator#104
files:
  - .planning/config.json
  - skills/kata-execute-phase/SKILL.md
  - skills/kata-releasing-kata/SKILL.md
  - skills/kata-new-project/SKILL.md
---

## Problem

Kata workflows embed best-practice defaults for activities like changelog updates, README updates, and release processes. These defaults are not always appropriate because release processes, documentation conventions, and file update requirements vary significantly between projects.

There is no mechanism for users to declare project-specific preferences that Kata workflows read at decision points. For example, when executing a phase near the end of a milestone, Kata should know which files to update, what documentation to touch, and what release steps to follow for *this* project.

Additionally, gathering these preferences needs to happen progressively. Onboarding should capture only essentials. Remaining preferences should be established just-in-time when workflows first encounter a decision point that needs them (e.g., first release, first milestone completion).

## Solution

Key design considerations:

1. **Preferences file** read consistently by workflows at decision points (could extend `.planning/config.json` or introduce a dedicated preferences file)
2. **Progressive capture** strategy: onboarding gathers basics, workflows prompt for preferences on first encounter and persist them for future runs
3. **Override granularity**: which files to update on release, documentation update rules, changelog format, README sections to maintain, custom release steps
4. **Fallback to defaults**: existing best-practice defaults remain when no user preference is set
5. **Discovery surface**: workflows need a standard way to check "has the user expressed a preference for X?" and, if not, either use the default or prompt

TBD: schema design, storage location, prompt-vs-file balance.
