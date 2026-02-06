# Phase 1: Issue Model Foundation - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish "issues" as Kata's vocabulary with local storage and unified display. Migrate existing todos to the new issue model. Users can create issues that persist to `.planning/issues/` in non-GitHub projects, and `/kata:check-issues` displays all issues with consistent format regardless of source.

**Out of scope:** GitHub Issue sync (Phase 2), phase organization directories (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Vocabulary transition
- Auto-migrate existing todos to new issue format on first use
- Archive originals to `.planning/todos/_archived/` (don't delete)
- Show deprecation warnings for old 'todo' commands ("did you mean /kata:check-issues?")
- Command naming follows existing style: `/kata:check-issues`, `/kata:add-issue`

### Issue data model
- Priority: User-configurable with sensible default (High/Medium/Low)
- Auto-capture provenance: record phase/plan context when issue created during work

### Issue creation flow
- Natural language input — user describes issue conversationally, agent structures it
- Ask only if ambiguous — create directly when clear, prompt for clarification if missing key info
- Follow existing Kata pattern: users invoke `/kata:add-issue`, agents invoke `Skill("kata:adding-issues")`

### Claude's Discretion
- Labels/tags system (freeform, predefined categories, or none)
- Status tracking approach (binary open/closed, three states, or directory-based)
- Display format for `/kata:check-issues` (table, list, grouped)
- GitHub + local unified view vs separate sections
- Filtering support (flags, arguments, or defer to later)
- ID/path display format (short IDs, full paths, or both)

</decisions>

<specifics>
## Specific Ideas

- Migration should be seamless — user runs `/kata:check-issues` and existing todos just appear as issues
- "Did you mean...?" deprecation style keeps things friendly, not jarring

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-issue-model-foundation*
*Context gathered: 2026-01-29*
