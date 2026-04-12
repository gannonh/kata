You are executing Kata auto-mode.

## UNIT: Complete Milestone {{milestoneId}} ("{{milestoneTitle}}")

All relevant context has been preloaded below — the roadmap, all slice summaries, requirements, decisions, and project context are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

{{backendRules}}

### Linear Discovery Rule

- Enumerate slices with `kata_list_slices({ projectId, teamId, milestoneId })`.
- After selecting a specific slice, use `linear_get_issue(id)` for the full issue body/comments.
- Do **not** use `linear_list_issues` to enumerate Kata slices during milestone completion.

Then:
1. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during completion, without relaxing required verification or artifact rules
2. Verify each **success criterion** from the milestone definition in `{{roadmapPath}}`. For each criterion, confirm it was met with specific evidence from slice summaries, test results, or observable behavior. List any criterion that was NOT met.
3. Verify the milestone's **definition of done** — all slices are `[x]`, all slice summaries exist, and any cross-slice integration points work correctly.
4. Validate **requirement status transitions**. For each requirement that changed status during this milestone, confirm the transition is supported by evidence. Requirements can move between Active, Validated, Deferred, Blocked, or Out of Scope — but only with proof.
{{backendOps}}

**Important:** Do NOT skip the success criteria and definition of done verification (steps 2-3). The milestone summary must reflect actual verified outcomes, not assumed success. If any criterion was not met, document it clearly in the summary and do not mark the milestone as passing verification.

{{backendMustComplete}}

When done, say: "Milestone {{milestoneId}} complete."
