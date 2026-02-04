# Phase 3: Roadmap Enhancements - Research

**Researched:** 2026-02-04
**Domain:** Markdown document structure and visual formatting
**Confidence:** HIGH

## Summary

ROADMAP.md improvements focus on three areas: future milestone visibility (ROAD-01), visual hierarchy and formatting consistency (ROAD-02), and scannable progress indicators. The current structure already includes milestone sections, phase details, and progress tables, but lacks a "Planned Milestones" or "Future Milestones" section and has inconsistent formatting in archived milestone blocks.

The standard approach is hierarchical markdown with consistent heading levels, visual separators (horizontal rules), and status indicators (emoji/symbols). Best practices emphasize logical heading hierarchy (H1→H2→H3), scannable structure for readers who skim, and consistent formatting conventions.

**Primary recommendation:** Add a "Planned Milestones" section after "Milestones" overview, standardize collapsible block formatting for completed milestones, and use consistent status symbols throughout.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Markdown | 1.0.1+ | Document structure | Universal format for technical documentation |
| Unicode Box Drawing | UTF-8 | Visual separators | Cross-platform text-based UI elements |
| Unicode Symbols | UTF-8 | Status indicators | Universally supported progress/status markers |

### Supporting
| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| HTML `<details>` | HTML5 | Collapsible sections | Archive completed milestones without clutter |
| Horizontal Rules | Markdown | Visual separation | Divide major sections |
| Tables | GitHub Flavored Markdown | Structured data | Progress summaries, phase overviews |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Unicode symbols | ASCII art/badges | Badges require external services, less maintainable |
| `<details>` blocks | Separate files | Separate files lose single-file overview benefit |
| Tables | Lists | Tables provide better scannability for structured data |

**Installation:**
Not applicable - uses standard Markdown features supported by all editors.

## Architecture Patterns

### Recommended Document Structure

Based on current ROADMAP.md analysis and best practices:

```
# Roadmap: [Project Name]

## Overview
[2-3 sentence project description]

## Milestones
[Active and completed milestones as bullet points]

## Planned Milestones           ← NEW SECTION (ROAD-01)
[Future milestones with goals, not yet started]

## Completed Milestones
[Collapsible details blocks with consistent formatting]

---

## Current Milestone           ← ENHANCED FORMATTING (ROAD-02)
### v[X.Y] [Name] (In Progress)
[Consistent phase structure with visual hierarchy]

---

## Progress Summary
[Table with scannable indicators]
```

### Pattern 1: Future Milestone Visibility (ROAD-01)

**What:** Add "Planned Milestones" section between current overview and archived milestones.

**When to use:** Immediately after completing current milestone phases, before starting new milestone.

**Example:**
```markdown
## Planned Milestones

### v1.6.0 Issue Workflow Enhancements
**Goal:** Improve issue management and workflow automation.
**Target features:**
- Issue templates and automation rules
- Bulk operations on issues
- Advanced filtering and search

### v1.7.0 Performance & Scalability
**Goal:** Optimize for larger projects and faster execution.
**Target features:**
- Incremental plan execution
- Parallel phase processing
- Caching layer for research
```

**Key elements:**
- Use H3 for milestone names (matches "Current Milestone" structure)
- Include **Goal** and **Target features** (not full phase breakdown)
- Order by priority/sequence
- Keep descriptions brief (expand detail when milestone becomes active)

### Pattern 2: Consistent Milestone Formatting (ROAD-02)

**What:** Standardize completed milestone `<details>` blocks and phase listings.

**Current inconsistency:**
- Some use `✅`, others use checkmarks in different positions
- Phase format varies (some with dependencies, some without)
- Success criteria sometimes included, sometimes omitted
- Inconsistent use of "Plans:" vs direct plan listing

**Standardized format:**
```markdown
<details>
<summary>✅ v[X.Y] [Name] — SHIPPED [DATE]</summary>

**Goal:** [One sentence milestone goal]

- [x] Phase 1: [Name] (N/N plans) — completed [DATE]
- [x] Phase 2: [Name] (N/N plans) — completed [DATE]
- [x] Phase N: [Name] (N/N plans) — completed [DATE]

[Full archive](milestones/v[X.Y]-ROADMAP.md)

</details>
```

**Rationale:**
- Checkmark at start of summary for consistent scanning
- SHIPPED status with date for quick reference
- Consistent goal statement (matches phase pattern)
- Phase checkboxes with plan counts for progress indication
- Archive link for detailed retrospective

### Pattern 3: Scannable Progress Indicators

**What:** Consistent status symbols and progress visualization throughout document.

**Symbol vocabulary (from ui-brand.md):**
```
✓  Complete / Passed
✗  Failed / Blocked
◆  In Progress
○  Pending
⚠  Warning
🎉 Milestone complete (banner only)
```

**Usage locations:**
1. **Milestones overview** (bullet list at top)
   - ✅ v1.4.1 Issue Execution — shipped 2026-02-03
   - 🔄 v1.5.0 Phase Management — in progress
   - ○ v1.6.0 Issue Enhancements — planned

2. **Current milestone phases**
   - [x] Phase 1: Organization (2/2 plans) — completed 2026-02-03
   - [x] Phase 2: Movement (2/2 plans) — completed 2026-02-03
   - [ ] Phase 3: Enhancements (0/2 plans) — pending

3. **Progress table**
   ```markdown
   | Milestone | Status   | Shipped    |
   | --------- | -------- | ---------- |
   | v1.4.1    | Shipped  | 2026-02-03 |
   | v1.5.0    | Active   | —          |
   | v1.6.0    | Planned  | —          |
   ```

### Anti-Patterns to Avoid

- **Inconsistent heading levels:** Don't skip H2→H4, always H2→H3→H4
- **Varying box widths:** Don't mix 60-char and 62-char separators
- **Random emoji:** Stick to defined status symbols, not arbitrary decorations
- **Incomplete phase details:** Always include plan counts, dates, and status
- **Missing archive links:** Every completed milestone should link to archive

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Status badges | Custom badge generator | Unicode symbols (✓, ○, ◆) | No external dependencies, universal support |
| Collapsible sections | JavaScript/custom | HTML `<details>` | Built into GitHub Markdown, widely supported |
| Progress bars | ASCII art generator | Unicode block chars (█░) | Consistent with ui-brand.md patterns |

**Key insight:** Markdown viewers (GitHub, editors, Claude) render `<details>` consistently. Custom solutions break in different contexts.

## Common Pitfalls

### Pitfall 1: Inconsistent Heading Hierarchy

**What goes wrong:** Using H2 for some milestones and H3 for others breaks document scanning.

**Why it happens:** Incremental edits without checking existing structure.

**How to avoid:**
- Current Milestone uses H3 for milestone name (### v1.5.0 Phase Management)
- Phases use H4 (#### Phase 1: Organization)
- Maintain this structure in "Planned Milestones"

**Warning signs:** Table of contents shows irregular indentation levels.

### Pitfall 2: Details Block Formatting Drift

**What goes wrong:** Each completed milestone uses slightly different formatting, making scanning difficult.

**Why it happens:** Copy-paste from different sources, editing at different times.

**How to avoid:**
- Create template in milestone-archive-template.md
- Reference template when archiving milestones
- Validate format consistency during milestone completion

**Warning signs:** Some completed milestones show more detail than others, checkmarks in different positions.

### Pitfall 3: Progress Table Staleness

**What goes wrong:** Progress Summary table at bottom doesn't reflect current state.

**Why it happens:** Forgotten during phase completion, no automated update.

**How to avoid:**
- Update Progress Summary as part of milestone/phase completion workflow
- Include progress table update in complete-milestone and execute-phase skills
- Add to success criteria for phase/milestone completion

**Warning signs:** "Last updated" date doesn't match most recent activity.

### Pitfall 4: Mixing Status Indicators

**What goes wrong:** Using ✅ in some places, [x] in others, ✓ in a third creates visual inconsistency.

**Why it happens:** Different conventions from different files/skills.

**How to avoid:**
- Establish clear rules: ✅ for milestone status, [x] for checkboxes, ✓ for inline completion
- Document in ui-brand.md
- Enforce in templates

**Warning signs:** Same concept (completion) shown multiple ways in same document.

## Code Examples

Verified patterns from existing ROADMAP.md:

### Milestones Overview Section (Current Pattern)
```markdown
## Milestones

- ✅ **v1.4.1 Issue Execution** — Phases 1-4 (shipped 2026-02-03)
- 🔄 **v1.5.0 Phase Management** — Phases 1-3 (in progress)
```

### Completed Milestone Block (Current Pattern)
```markdown
<details>
<summary>✅ v1.4.1 Issue Execution (Phases 1-4) — SHIPPED 2026-02-03</summary>

**Goal:** Complete the issue lifecycle with execution workflows and PR integration.

- [x] Phase 1: PR → Issue Closure (1/1 plans) — completed 2026-02-01
- [x] Phase 2: Issue Execution Workflow (2/2 plans) — completed 2026-02-02
- [x] Phase 3: Issue → Roadmap Integration (2/2 plans) — completed 2026-02-02
- [x] Phase 4: Wire plan-phase Issue Context (1/1 plans) — completed 2026-02-02

[Full archive](milestones/v1.4.1-ROADMAP.md)

</details>
```

### Current Milestone Section (Current Pattern)
```markdown
## Current Milestone

### v1.5.0 Phase Management (In Progress)

**Goal:** Improved phase organization, movement, and roadmap visibility.

#### Phase 1: Phase Organization

**Goal:** Organize phase artifacts into state directories with completion validation.
**Requirements:** PHASE-01, PHASE-05
**Plans:** 2 plans

- [x] Phase 1: Phase Organization (2/2 plans) — completed 2026-02-03
```

### Progress Summary Table (Current Pattern)
```markdown
## Progress Summary

| Milestone | Phases | Plans | Status   | Shipped    |
| --------- | ------ | ----- | -------- | ---------- |
| v0.1.4    | 1      | 5     | Shipped  | 2026-01-18 |
| v0.1.5    | 6      | 30    | Shipped  | 2026-01-22 |
| v1.5.0    | 3      | 4+    | Active   | —          |
```

### NEW: Planned Milestones Section (Recommended)
```markdown
## Planned Milestones

### v1.6.0 Issue Workflow Enhancements

**Goal:** Improve issue management and workflow automation.

**Target features:**
- Issue templates and automation rules
- Bulk operations on issues
- Advanced filtering and search

**Dependencies:** v1.5.0 complete

### v1.7.0 Performance & Scalability

**Goal:** Optimize for larger projects and faster execution.

**Target features:**
- Incremental plan execution
- Parallel phase processing
- Caching layer for research

**Dependencies:** v1.6.0 complete
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Flat milestone list | Structured with current + completed sections | Early 2024 | Improved scannability |
| Text status | Unicode symbols (✓, ○, ◆) | Common practice | Visual recognition faster |
| All milestones visible | Collapsible `<details>` for completed | HTML5 support | Reduced visual clutter |
| Manual progress bars | Unicode block characters (█░) | Common in CLI tools | Consistent with terminal UX |

**Deprecated/outdated:**
- ASCII art headers (====, ----) — Unicode box drawing cleaner
- Badge URLs (shields.io) — External dependency, breaks offline
- Custom HTML styling — Breaks in different Markdown renderers

## Open Questions

Things that couldn't be fully resolved:

1. **How many future milestones to show?**
   - What we know: Current structure shows all completed milestones (collapsed)
   - What's unclear: Should "Planned Milestones" show all future work or just next 2-3?
   - Recommendation: Show next 2-3 planned milestones, add "...and more TBD" if roadmap extends further

2. **Should Progress Summary include planned milestones?**
   - What we know: Current table only shows shipped and active milestones
   - What's unclear: Would adding "Planned" status rows help or clutter?
   - Recommendation: Add planned milestones with "Planned" status and "—" for metrics, improves visibility

3. **How to handle milestone status transitions?**
   - What we know: Status changes from Planned → In Progress → Complete → Shipped
   - What's unclear: When to move from "Planned Milestones" to "Current Milestone"?
   - Recommendation: Move when first requirement defined (add-milestone completes), update status to "In Progress"

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` (actual current structure)
- `.planning/milestones/v1.4.1-ROADMAP.md` (archived milestone format)
- `.planning/milestones/v1.1.0-ROADMAP.md` (archived milestone with decimal phases)
- `skills/kata-add-milestone/SKILL.md` (milestone creation workflow)
- `skills/kata-complete-milestone/references/milestone-archive-template.md` (archiving format)
- `skills/kata-plan-phase/references/ui-brand.md` (status symbols and visual patterns)

### Secondary (MEDIUM confidence)
- [Markdown Best Practices Guide](https://www.tomarkdown.org/guides/markdown-best-practice) — Hierarchy and scannability principles
- [Mozilla Science Lab Roadmapping](https://mozillascience.github.io/working-open-workshop/roadmapping/) — Mission/Timeline/Involvement sections
- [Google Markdown Style Guide](https://google.github.io/styleguide/docguide/style.html) — Heading hierarchy best practices

### Tertiary (LOW confidence)
- WebSearch results on status badges — External services not recommended for local files
- WebSearch results on progress bars — Validated Unicode approach against alternatives

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing ROADMAP.md patterns and universal Markdown features
- Architecture: HIGH - Patterns extracted from current working structure
- Pitfalls: MEDIUM - Inferred from formatting inconsistencies in archived milestones

**Research date:** 2026-02-04
**Valid until:** 90 days (stable domain, Markdown spec changes slowly)
