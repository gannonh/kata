You are executing Kata auto-mode.

## UNIT: Research Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — start working immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections — they contain hard-won knowledge about what's fragile, what assumptions changed, and what to watch out for.

{{dependencySummaries}}

{{backendRules}}

### Linear Discovery Rule

- Enumerate slices with `kata_list_slices({ projectId, teamId, milestoneId })` and tasks with `kata_list_tasks({ sliceIssueId })`.
- After selecting a specific dependency slice or task, use `linear_get_issue(id)` for the full issue body/comments.
- Do **not** use `linear_list_issues` to enumerate Kata slices during research.

Then research what this slice needs:
0. If `REQUIREMENTS.md` was preloaded above, identify which Active requirements this slice owns or supports. Research should target these requirements — surfacing risks, unknowns, and implementation constraints that could affect whether the slice actually delivers them.
1. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during research, without relaxing required verification or artifact rules
2. **Skill Discovery ({{skillDiscoveryMode}}):**{{skillDiscoveryInstructions}}
3. Explore relevant code for this slice's scope. For targeted exploration, use `rg`, `find`, and reads. For broad or unfamiliar subsystems, use `scout` to map the relevant area first.
4. Use `resolve_library` / `get_library_docs` for unfamiliar libraries
5. Read the template at `~/.kata-cli/agent/extensions/kata/templates/research.md`
{{backendOps}}

{{backendMustComplete}}

When done, say: "Slice {{sliceId}} researched."
