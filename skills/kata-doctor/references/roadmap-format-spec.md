# Roadmap Format Specification

This document defines the canonical ROADMAP.md format created by `kata-add-milestone`.

## Required Sections

The format detection script (`check-roadmap-format.sh`) checks for these markers:

### Must Have

1. **`## Milestones`** - Overview list with status symbols
2. **`## Current Milestone: v[X.Y] [Name]`** - Active milestone heading

### Must NOT Have

1. **`## Phases`** - Old format indicator (phases should be under milestone sections)

## Canonical Structure

```markdown
# Roadmap: [Project Name]

## Overview

[2-3 sentence project description]

## Milestones

- ✅ **v1.0.0 [Name]** — Phases N-M (shipped YYYY-MM-DD)
- ✅ **v1.1.0 [Name]** — Phases N-M (shipped YYYY-MM-DD)
- 🔄 **v1.2.0 [Name]** — Phases N-M (in progress)
- ○ **v2.0.0 [Name]** — Phases TBD (planned)

## Current Milestone: v[X.Y] [Name]

**Goal:** [One sentence describing milestone focus]

- [x] Phase N: [Name] (P/P plans) — completed YYYY-MM-DD
- [x] Phase N+1: [Name] (P/P plans) — completed YYYY-MM-DD
- [ ] Phase N+2: [Name] (P/P plans)

## Completed Milestones

<details>
<summary>✅ v[X.Y] [Name] (Phases N-M) — SHIPPED YYYY-MM-DD</summary>

**Goal:** [milestone goal]

- [x] Phase N: [Name] (P/P plans) — completed YYYY-MM-DD
- [x] Phase N+1: [Name] (P/P plans) — completed YYYY-MM-DD

[Full archive](milestones/v[X.Y]-ROADMAP.md)

</details>

## Planned Milestones

### ○ v[X.Y] [Name]

**Goal:** [planned milestone goal]

**Target features:**
- [Feature 1]
- [Feature 2]

---

## Progress Summary

| Milestone | Phases | Plans | Status      | Shipped    |
| --------- | ------ | ----- | ----------- | ---------- |
| v1.0.0    | 4      | 12    | Shipped     | YYYY-MM-DD |
| v1.1.0    | 3      | 8     | Shipped     | YYYY-MM-DD |
| v1.2.0    | 5      | —     | In Progress | —          |
| v2.0.0    | —      | —     | Planned     | —          |

---
*Roadmap created: YYYY-MM-DD*
*Last updated: YYYY-MM-DD — [update note]*
```

## Milestone Symbols

| Symbol | Meaning     | Used In               |
| ------ | ----------- | --------------------- |
| ✅     | Shipped     | Milestones list, details summary |
| 🔄     | In Progress | Milestones list       |
| ○      | Planned     | Milestones list, Planned Milestones section |

## Phase Heading Levels

Phases appear at different heading levels depending on context:

- **In Current Milestone section**: List items with checkboxes
  ```markdown
  - [x] Phase 37: Preferences Infrastructure (2/2 plans) — completed 2026-02-07
  - [ ] Phase 38: Template Overrides (2/2 plans)
  ```

- **In Completed Milestones details**: Same list format
  ```markdown
  - [x] Phase 30: Proof of Concept (3/3 plans) — completed 2026-02-05
  ```

## Old Format Detection

The following patterns indicate an old format that needs migration:

1. **`## Phases`** as a top-level section
2. **`### Phase N:`** headings at root level (not under a milestone)
3. Missing `## Current Milestone:` heading
4. Using `<details>` blocks without `## Completed Milestones` section

## Migration

When old format is detected, `kata-doctor` performs:

1. Create `## Current Milestone:` section from existing phases
2. Move active phases under current milestone
3. Create `## Completed Milestones` for any shipped work
4. Remove standalone `## Phases` section
5. Preserve all phase content and metadata
