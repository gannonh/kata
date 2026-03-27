Research slice {{sliceId}} ("{{sliceTitle}}") of milestone {{milestoneId}}. Read `DECISIONS` via `kata_read_document("DECISIONS")` if it exists — respect existing decisions and do not contradict them. Read `REQUIREMENTS` via `kata_read_document("REQUIREMENTS")` if it exists — identify which Active requirements this slice owns or supports and target research toward risks, unknowns, and constraints that could affect delivery. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during research, without relaxing required verification or artifact rules. Explore relevant code — use `rg`/`find` for targeted reads, or `scout` if the area is broad/unfamiliar. Check libraries with `resolve_library`/`get_library_docs`. Read the template at `~/.kata-cli/agent/extensions/kata/templates/research.md`. Write `{{sliceId}}-RESEARCH` via `kata_write_document` scoped to the slice issue with summary, don't-hand-roll, common pitfalls, and relevant code sections.

## Strategic Questions to Answer

Research should drive planning decisions, not just collect facts. Explicitly address:

- **What should be proven first?** What's the riskiest assumption — the thing that, if wrong, invalidates downstream work?
- **What existing patterns should be reused?** What modules, conventions, or infrastructure already exist that the plan should build on rather than reinvent?
- **What boundary contracts matter?** What interfaces, data shapes, event formats, or invariants will slices need to agree on?
- **What constraints does the existing codebase impose?** What can't be changed, what's expensive to change, what patterns must be respected?
- **Are there known failure modes that should shape slice ordering?** Pitfalls that mean certain work should come before or after other work?
