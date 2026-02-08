# Brainstorm: Project-Specific Workflow Preferences

**Date:** 2026-02-07
**Pairs:** 3 (Storage & Schema, Capture & Discovery, Extension Model)
**Focus:** How Kata supports project-specific customization without forking core skills
**Source issue:** #104 (user workflow preferences override mechanism)

---

## Storage & Schema

3 proposals survived debate. Core recommendation: separate `preferences.json` with accessor script.

| # | Proposal | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Flat-key `preferences.json` with accessor script | **Ship** | Grep-safe dot-notation keys, centralized defaults, clean separation from session-variable config |
| 2 | Separate `has-pref.sh` for discovery checks | **Ship** | Enables progressive capture: key absence = "not yet asked" |
| 3 | Profile-based defaults layer | **Defer** | Compatible with flat-key design but needs template overrides and config variants first |

**Key design decisions:**
- `preferences.json` for project-lifetime constants (changelog format, version files, doc conventions)
- `config.json` for session-variable settings (mode, depth, model_profile)
- Boundary rule: "Would you change this between runs?" Yes = config, No = preferences
- Accessor script (`read-pref.sh`) centralizes parsing, defaults, and migration from config.json
- Resolution order: preferences.json -> config.json -> built-in defaults

**Eliminated:** Extending config.json (mixed concerns, grep ambiguity), YAML frontmatter (wrong tool for bash parsing), layered defaults with `_source` markers (over-engineered)

[Full report](storage-report.md)

---

## Capture & Discovery

4 proposals adopted (with modifications), 2 deferred. Core recommendation: reduce onboarding to 5 questions, defer 1 to first plan-phase, silent-default 3 workflow agent toggles.

| # | Proposal | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Check-or-ask inline (with config write utility) | **Adopt** | Simple pattern; utility script handles JSON write fragility |
| 2 | Tiered onboarding (conceptual model) | **Adopt** | Document which preferences are asked when; don't enforce tiers in code |
| 3 | Silent defaults for experience-dependent prefs | **Adopt** | Workflow agents can't be evaluated until experienced; default on with notice |
| 4 | Preference registry | **Reject** | Over-engineered for 15 keys |
| 5 | Context-aware inference | **Defer** | Useful complement for 2-3 signals; full inference shifts cognitive load |
| 6 | Preference cascade (cross-project) | **Defer** | Doesn't solve first-project problem |

**Net result:** 11 onboarding questions -> 5 at onboarding + 1 at first plan-phase

**What moves where:**
- Stays at onboarding (5): mode, depth, commit_docs, pr_workflow, github
- Deferred to first `/kata-plan-phase` (1): model_profile
- Silent default with notice (3): workflow.research, workflow.plan_check, workflow.verifier
- Dropped (1): parallelization (dead config, no skill reads it)

**Key challenger correction:** Asking users to disable agents they've never seen provides no value. Silent defaults with prominent first-run notice are the right UX.

[Full report](capture-report.md)

---

## Extension Model

2 mechanisms ship; 1 deferred. Core insight: the question is not "how do users customize skills?" but "how do users inject project-specific context into subagent prompts?"

| # | Proposal | Verdict | Rationale |
|---|----------|---------|-----------|
| 1 | Template overrides (`.planning/templates/`) | **Ship first** | Low risk: affects output shape, not execution flow |
| 2 | Config-driven workflow variants (`workflows` section) | **Ship second** | Handles "run this command" needs via config keys injected into subagent prompts |
| 3 | Hook points (`.planning/hooks/`) | **Defer** | Only needed when customization requires Claude to reason about project-specific things that can't be a command string |
| 4 | Skill shadowing | **Reject** | Claude Code doesn't support precedence; @-references break; silent upgrade breakage |
| 5 | Composable skill fragments | **Reject** | Requires refactoring all 30 skills; fragment bugs cascade |
| 6 | Project profiles (archetypes) | **Premature** | Profiles compose primitives (templates + config + hooks). Build primitives first. |

**Three real customization gaps identified:**
1. Changelog format (hardcoded in subagent reference)
2. Verification commands (no way to specify project-specific checks)
3. Summary template sections (embedded, not overridable)

**Template overrides:** 5 templates extractable. Projects place overrides at `.planning/templates/{name}.md`. Skills check project dir, fall back to plugin default. Schema comments mark required fields. Session-start hook warns on drift.

**Config workflow variants:** Per-skill `workflows` section in config. Values are strings/arrays (commands, format names), not arbitrary prompt text. Skills inject values into subagent prompts as structured context.

**Forward compatibility:** Warn, don't block. No automatic migration. Projects own their overrides.

[Full report](extension-report.md)

---

## Cross-Cutting Themes

1. **Subagent boundary is the design constraint.** CLAUDE.md doesn't propagate to subagents. Every customization mechanism must work by placing content where skills can inline it into subagent prompts. This rules out approaches that modify the skill structure itself (shadowing, fragments).

2. **Separation of concerns: config vs preferences vs templates.** Three distinct layers emerged independently across pairs: session-variable settings (config.json), project-lifetime constants (preferences.json), and output format customization (template overrides). Each has different change frequency, different capture timing, and different risk profile.

3. **Progressive disclosure applies to preferences too.** The same principle that drives Kata's skill/workflow/template/reference hierarchy applies to how preferences are gathered. Ask at onboarding only what affects onboarding. Ask at first plan-phase only what affects planning. Default everything else until the user has enough experience to evaluate.

4. **Build primitives before compositions.** Profiles, presets, and cross-project cascades all compose simpler mechanisms (templates, config keys, accessor scripts). Building the composition layer before primitives exist is backwards. Ship primitives, observe usage patterns, then compose.

5. **Small scope, tangible gaps.** The actual customization needs found in the current codebase are specific and limited: changelog format, verification commands, summary sections, 5-6 preference keys. The rejected proposals were consistently the architecturally ambitious ones that solved hypothetical problems.

---

## Recommended Implementation Sequence

| Phase | What | Scope | Dependencies |
|-------|------|-------|-------------|
| 1 | `preferences.json` + accessor scripts + reduced onboarding | Small (1-2 plans) | None |
| 2 | Check-or-ask in kata-plan-phase + silent default notices | Small (1 plan) | Phase 1 |
| 3 | Template extraction and override resolution | Small-medium (2 plans) | None (parallel with 1-2) |
| 4 | Config workflow variants (execute-phase, verify-work) | Medium (2 plans) | Phase 1 |
| 5 | Hook points | Deferred | Phases 3-4 deployed + user feedback |
| 6 | Project profiles/presets | Deferred | Phases 3-4 deployed + usage patterns |

**Total estimated scope for v1.8.0:** Phases 1-4, approximately 6-8 plans across 3-4 phases.
