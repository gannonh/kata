# Canonical ROADMAP.md Format Specification

This document defines the current format for `.planning/ROADMAP.md` files. Skills that parse ROADMAP.md rely on these conventions.

## Required Sections

### 1. Title

```markdown
# Roadmap: [Project Name]
```

### 2. Milestones Overview

```markdown
## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped YYYY-MM-DD)
- 🔄 **v1.1 Security** — Phases 5-6 (in progress)
- ○ **v2.0 Redesign** — planned
```

**Status icons:**
- `✅` — shipped/completed milestone
- `🔄` — current/in-progress milestone
- `○` — planned/future milestone

### 3. Completed Milestones (in `<details>` blocks)

```markdown
<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED YYYY-MM-DD</summary>

**Goal:** [One sentence milestone goal]

- [x] Phase 1: Foundation (2/2 plans) — completed YYYY-MM-DD
- [x] Phase 2: Authentication (2/2 plans) — completed YYYY-MM-DD
- [x] Phase 3: Core Features (3/3 plans) — completed YYYY-MM-DD
- [x] Phase 4: Polish (1/1 plan) — completed YYYY-MM-DD

[Full archive](milestones/v1.0-ROADMAP.md)

</details>
```

### 4. Current Milestone

```markdown
## Current Milestone: v1.1 Security

**Goal:** [Milestone goal]

### Phase 5: Security Audit

**Goal:** [Phase goal]
**Depends on:** Phase 4
**Plans:** 2 plans

Plans:
- [ ] Plan 01: Audit authentication flow
- [ ] Plan 02: Fix identified vulnerabilities
```

### 5. Progress Summary (optional but recommended)

```markdown
## Progress Summary

| Phase             | Milestone | Plans Complete | Status      | Completed  |
| ----------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation     | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 2. Authentication | v1.0      | 2/2            | Complete    | YYYY-MM-DD |
| 5. Security Audit | v1.1      | 0/2            | Not started | -          |
```

## Phase Line Format

Within milestone sections:

```markdown
- [x] Phase N: Name (X/Y plans) — completed YYYY-MM-DD
- [ ] Phase N: Name (X/Y plans) — in progress
- [ ] Phase N: Name (X/Y plans)
```

## Detection Criteria

A ROADMAP.md is in **current format** if it contains BOTH:
1. A `## Milestones` section heading
2. At least one of:
   - `## Current Milestone:` heading
   - `## Completed Milestones` heading  
   - A `<details>` block (for archived milestones)

Old-format files lack the `## Milestones` overview section and may have phases listed without milestone grouping.
