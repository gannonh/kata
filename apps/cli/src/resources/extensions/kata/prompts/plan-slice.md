You are executing Kata auto-mode.

## UNIT: Plan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — start working immediately without re-reading these files.

{{inlinedContext}}

### Dependency Slice Summaries

Pay particular attention to **Forward Intelligence** sections — they contain hard-won knowledge about what's fragile, what assumptions changed, and what this slice should watch out for.

{{dependencySummaries}}

{{backendRules}}

### Linear Discovery Rule

- Enumerate slices with `kata_list_slices({ projectId, teamId, milestoneId })` and tasks with `kata_list_tasks({ sliceIssueId })`.
- After selecting a specific dependency slice or task, use `linear_get_issue(id)` for the full issue body/comments.
- Do **not** use `linear_list_issues` to enumerate Kata slices for planning.

Then:
0. If `REQUIREMENTS.md` was preloaded above, identify which Active requirements the roadmap says this slice owns or supports. These are the requirements this plan must deliver — every owned requirement needs at least one task that directly advances it, and verification must prove the requirement is met.
1. Read the templates:
   - `~/.kata-cli/agent/extensions/kata/templates/plan.md`
   - `~/.kata-cli/agent/extensions/kata/templates/task-plan.md`
2. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during planning, without overriding required plan formatting
3. Define slice-level verification first — the objective stopping condition for this slice:
   - For non-trivial slices: plan actual test files with real assertions. Name the files. The first task creates them (initially failing). Remaining tasks make them pass.
   - For simple slices: executable commands or script assertions are fine.
   - If the project is non-trivial and has no test framework, the first task should set one up.
   - If this slice establishes a boundary contract, verification must exercise that contract.
4. Plan observability and diagnostics explicitly:
   - For non-trivial backend, integration, async, stateful, or UI slices, include an `Observability / Diagnostics` section in the slice plan.
   - Define how a future agent will inspect state, detect failure, and localize the problem.
   - Prefer structured logs/events, stable error codes/types, status surfaces, and persisted failure state over ad hoc debug text.
   - Include at least one verification check for a diagnostic or failure-path signal when relevant.
5. Fill the `Proof Level` and `Integration Closure` sections truthfully:
   - State whether the slice proves contract, integration, operational, or final-assembly behavior.
   - Say whether real runtime or human/UAT is required.
   - Name the wiring introduced in this slice and what still remains before the milestone is truly usable end-to-end.
6. Decompose the slice into tasks, each fitting one context window
7. Every task in the slice plan should be written as an executable increment with:
   - a concrete, action-oriented title
   - the inline task entry fields defined in the plan.md template (Why / Files / Do / Verify / Done when)
   - a matching task plan containing description, steps, must-haves, verification, observability impact, inputs, and expected output
8. Each task needs: title, description, steps, must-haves, verification, observability impact, inputs, and expected output
9. If verification includes test files, ensure the first task includes creating them with expected assertions (they should fail initially — that's correct)
{{backendOps}}

{{backendMustComplete}}

When done, say: "Slice {{sliceId}} planned."
