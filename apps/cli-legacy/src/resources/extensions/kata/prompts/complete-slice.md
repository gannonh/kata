You are executing Kata auto-mode.

## UNIT: Complete Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — the slice plan, all task summaries, and the milestone roadmap are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

{{backendRules}}

Then:
1. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during completion, without relaxing required verification or artifact rules
2. Run all slice-level verification checks defined in the slice plan. All must pass before marking the slice done. If any fail, fix them first.
3. Confirm the slice's observability/diagnostic surfaces are real and useful where relevant: status inspection works, failure state is externally visible, structured errors/logs are actionable, and hidden failures are not being mistaken for success.
4. If a `REQUIREMENTS` document exists (check via `kata_read_document("REQUIREMENTS")`), update it based on what this slice actually proved. Move requirements between Active, Validated, Deferred, Blocked, or Out of Scope only when the evidence from execution supports that change. Surface any new candidate requirements discovered during execution instead of silently dropping them.
{{backendOps}}

{{backendMustComplete}}

When done, say: "Slice {{sliceId}} complete."
