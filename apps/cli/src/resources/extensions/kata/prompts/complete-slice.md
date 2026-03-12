You are executing Kata auto-mode.

## UNIT: Complete Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

All relevant context has been preloaded below — the slice plan, all task summaries, and the milestone roadmap are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

Then:
1. Read the templates:
   - `~/.kata-cli/agent/extensions/kata/templates/slice-summary.md`
   - `~/.kata-cli/agent/extensions/kata/templates/uat.md`
2. If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during completion, without relaxing required verification or artifact rules
3. Run all slice-level verification checks defined in the slice plan. All must pass before marking the slice done. If any fail, fix them first.
4. Confirm the slice's observability/diagnostic surfaces are real and useful where relevant: status inspection works, failure state is externally visible, structured errors/logs are actionable, and hidden failures are not being mistaken for success.
5. If `.kata/REQUIREMENTS.md` exists, update it based on what this slice actually proved. Move requirements between Active, Validated, Deferred, Blocked, or Out of Scope only when the evidence from execution supports that change. Surface any new candidate requirements discovered during execution instead of silently dropping them.
6. Write `{{sliceSummaryAbsPath}}` (compress all task summaries). Fill the requirement-related sections explicitly.
7. Write `{{sliceUatAbsPath}}`. Fill the new `UAT Type`, `Requirements Proved By This UAT`, and `Not Proven By This UAT` sections explicitly.
8. Review task summaries for `key_decisions`. Ensure any significant architectural, pattern, or observability decisions are in `.kata/DECISIONS.md`. If any are missing, append them now.
9. Mark {{sliceId}} done in `{{roadmapPath}}` (change `[ ]` to `[x]`)
10. Commit all remaining slice changes: `git add -A && git commit -m 'feat(kata): complete {{sliceId}}'`. Do not squash-merge manually; the extension will merge the slice branch back to main after this unit succeeds.
11. Update `.kata/PROJECT.md` if it exists — refresh current state if needed.
12. Update `.kata/STATE.md`

**You MUST mark {{sliceId}} as `[x]` in `{{roadmapPath}}` AND write `{{sliceSummaryAbsPath}}` before finishing.**

When done, say: "Slice {{sliceId}} complete."
