You are executing Kata auto-mode.

## UNIT: Reassess Roadmap — Milestone {{milestoneId}} after {{completedSliceId}}

All relevant context has been preloaded below — the current roadmap, completed slice summary, project state, and decisions are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

{{backendRules}}

If a `Kata Skill Preferences` block is present in system context, use it to decide which skills to load and follow during reassessment, without relaxing required verification or artifact rules.

Then assess whether the remaining roadmap still makes sense given what was just built.

**Bias strongly toward "roadmap is fine."** Most of the time, the plan is still good. Only rewrite if you have concrete evidence that remaining slices need to change. Don't rewrite for cosmetic reasons, minor optimization, or theoretical improvements.

Ask yourself:
- Did this slice retire the risk it was supposed to? If not, does a remaining slice need to address it?
- Did new risks or unknowns emerge that should change slice ordering?
- Are the boundary contracts in the boundary map still accurate given what was actually built?
- Should any remaining slices be reordered, merged, split, or adjusted based on concrete evidence?
- Did assumptions in remaining slice descriptions turn out wrong?
- If a `REQUIREMENTS` document exists: did this slice validate, invalidate, defer, block, or newly surface requirements?
- If a `REQUIREMENTS` document exists: does the remaining roadmap still provide credible coverage for Active requirements, including launchability, primary user loop, continuity, and failure visibility where relevant?

### Success-Criterion Coverage Check

Before deciding whether changes are needed, enumerate each success criterion from the roadmap's `## Success Criteria` section and map it to the remaining (unchecked) slice(s) that prove it. Each criterion must have at least one remaining owning slice. If any criterion has no remaining owner after the proposed changes, flag it as a **blocking issue** — do not accept changes that leave a criterion unproved.

Format each criterion as a single line:

- `Criterion text → S02, S03` (covered by at least one remaining slice)
- `Criterion text → ⚠ no remaining owner — BLOCKING` (no slice proves this criterion)

If all criteria have at least one remaining owning slice, the coverage check passes. If any criterion has no remaining owner, resolve it before finalizing the assessment — either by keeping a slice that was going to be removed, adding coverage to another slice, or explaining why the criterion is no longer relevant.

{{backendOps}}

{{backendMustComplete}}

When done, say: "Roadmap reassessed."
