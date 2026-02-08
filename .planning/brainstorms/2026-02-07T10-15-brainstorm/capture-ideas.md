# Capture & Discovery Pattern Proposals

Explorer: explorer-capture
Date: 2026-02-07

---

## Proposal 1: Check-or-Ask Inline Pattern

**What:** Each skill that needs a preference reads config.json for the key. If the key exists, use it. If the key is missing, prompt the user with AskUserQuestion inline, then persist the answer to config.json before continuing. No new infrastructure. The "discovery" surface is the existing `cat .planning/config.json | grep` pattern with a fallback branch.

**UX Flow:**
1. User runs `/kata-plan-phase 1` for the first time
2. Skill reads config.json, finds `model_profile` key missing
3. Skill presents: "Which model profile for agents? [Quality / Balanced / Budget]"
4. User selects "Balanced"
5. Skill writes `"model_profile": "balanced"` to config.json
6. Skill continues with planning using balanced profile
7. Second run of `/kata-plan-phase 2` finds key present, skips prompt

**Why:** Minimal implementation. No new abstractions. Each skill owns its own preferences. The existing grep-based config read pattern already returns a default when keys are missing (the `|| echo "balanced"` fallback). The change is: instead of silently using the default, prompt once and persist.

**Scope:** Small. Modify 3 skills (kata-new-project removes questions, kata-plan-phase adds check-or-ask for model_profile and workflow toggles). ~50 lines of SKILL.md changes per skill.

**Risks:**
- Duplicated check-or-ask logic across skills. Each skill reinvents the prompt/persist pattern.
- No central registry of what preferences exist or which skills own them.
- Race condition if two skills check the same key simultaneously (unlikely in practice since skills run sequentially).
- Fragile: config.json writes via node one-liners in bash are error-prone for nested keys like `workflow.research`.

---

## Proposal 2: Preference Registry with Declarative Schema

**What:** Create a `kata/references/preferences.md` file that declares all known preferences with metadata: key path, type, default, owning skill, prompt text, options. Skills consult this registry at runtime. A shared bash function (or inline pattern) handles the check-read-or-prompt-and-persist flow. New preferences are added by editing the registry file.

**UX Flow:**
1. User runs `/kata-plan-phase 1`
2. Skill hits `resolve_preference("model_profile")`
3. Function checks config.json for `model_profile`
4. Key missing: function looks up registry, finds prompt text and options
5. Presents AskUserQuestion to user
6. User selects, function persists to config.json
7. Returns value to skill

**Why:** Single source of truth for all preferences. Skills don't need to know prompt text or option lists. Adding new preferences requires only a registry entry, not skill modifications. The registry doubles as documentation for `kata-configure-settings` to enumerate all available settings.

**Scope:** Medium. Create registry reference file. Create shared resolution pattern (documented in a reference file that skills inline). Modify kata-new-project to read from registry for its essentials-only set. Modify kata-plan-phase and other skills to use the pattern.

**Risks:**
- Over-engineering for 15 config keys. The registry adds a layer of indirection that may not pay off until Kata has 30+ preferences.
- The "shared function" is hard to implement in Kata's architecture since skills are markdown prompts executed by Claude, not real code. The "function" would be a documented inline pattern, which is just a more structured version of Proposal 1.
- Registry drift: the file must stay in sync with actual skill behavior.

---

## Proposal 3: Tiered Onboarding with Deferred Groups

**What:** Categorize all preferences into tiers based on when the user can make an informed decision:

- **Tier 1 (onboarding):** mode, depth, git tracking, PR workflow, GitHub integration. Asked during `/kata-new-project`.
- **Tier 2 (first plan):** model profile, workflow agent toggles. Asked at the start of `/kata-plan-phase` if not yet set.
- **Tier 3 (first execution):** statusline. Defaulted on, mentioned in completion output with instructions to disable.
- **Tier 4 (first release/milestone-complete):** changelog format, README update sections, release steps. Asked when `kata-complete-milestone` or a release skill first runs.

The tier assignment is documented in a reference file. Each tier's skills know which preferences to check-or-ask. Config.json gains a `_meta.tiers_completed` array to track which tiers have been resolved.

**UX Flow:**
1. `/kata-new-project`: 5 questions (Tier 1). Config written with only those keys plus defaults.
2. `/kata-plan-phase 1`: Detects Tier 2 unresolved. Asks 2 questions (model profile, workflow agents as a group). Writes to config. Marks `_meta.tiers_completed: [1, 2]`.
3. `/kata-execute-phase 1`: No new questions. Tier 3 defaulted.
4. `/kata-complete-milestone`: Detects Tier 4 unresolved. Asks about release preferences. Marks tier complete.

**Why:** Predictable. Users encounter preference prompts at natural transition points (init, first plan, first release). No surprises mid-execution. The tier structure makes it clear which skills are responsible for which preferences.

**Scope:** Medium. Modify kata-new-project to remove Round 2 questions. Add check-or-ask blocks to kata-plan-phase and kata-complete-milestone. Create tier reference documentation. Add _meta tracking to config.json.

**Risks:**
- Rigid. If a user wants to set a Tier 4 preference before their first release, they must use `kata-configure-settings`. The tier system doesn't prevent this but also doesn't facilitate it.
- The _meta tracking adds complexity. A simpler check: "does the key exist in config.json" achieves the same result without meta-tracking.
- Tier boundaries are judgment calls. Reasonable people disagree about whether PR workflow is Tier 1 or Tier 2.

---

## Proposal 4: Silent Defaults with Opt-in Prompting

**What:** Eliminate almost all onboarding questions. Set opinionated defaults for everything. Users who want to customize run `kata-configure-settings`. Skills never prompt for preferences inline. Instead, each skill reads config.json with built-in defaults (the existing `|| echo "balanced"` pattern). The first-run experience is: answer 2 questions (mode and depth), then start working.

When a default is used that has visible effects (e.g., researcher agent spawning), the skill outputs a one-line notice: `Using default: research enabled. Run /kata-configure-settings to change.`

**UX Flow:**
1. `/kata-new-project`: 2 questions (mode, depth). Everything else defaulted.
2. `/kata-plan-phase 1`: Spawns researcher (default on). Shows: "Researcher: on (default). /kata-configure-settings to customize."
3. User notices they don't want researcher. Runs `/kata-configure-settings` to toggle it off.
4. `/kata-plan-phase 2`: No researcher. No message.

**Why:** Fastest onboarding possible. Opinionated tools attract users who share those opinions. Users who need customization can find it. This follows the pattern of tools like Next.js (opinionated defaults, escape hatches available).

**Scope:** Small. Reduce kata-new-project questioning. Add "default notice" one-liners to skills. No new infrastructure.

**Risks:**
- Users may not realize customization exists. The one-line notice is easy to miss in output.
- Opinionated defaults may not match user expectations (e.g., defaulting GitHub integration to enabled when user has no GitHub repo).
- Some defaults have cost implications (workflow agents consume API tokens). Silently defaulting these "on" could surprise users.
- Harder to discover what's configurable. Users must know to run `/kata-configure-settings` or read docs.

---

## Proposal 5: Context-Aware Preference Inference

**What:** Instead of asking users, infer preferences from project context. Detect package.json for Node.js conventions. Detect .github/ for GitHub integration. Detect existing test frameworks for verification preferences. Detect monorepo structure for parallelization. Use `kata-map-codebase` output (if available) to set intelligent defaults.

Inference happens during `/kata-new-project` (brownfield) or `/kata-add-milestone` (evolving project). Results are written to config.json with a `source: "inferred"` annotation. User can override via `kata-configure-settings`.

**UX Flow:**
1. User runs `/kata-new-project` on existing Node.js project
2. Kata detects: package.json (Node), .github/workflows/ (CI exists), jest.config.js (testing), .github/PULL_REQUEST_TEMPLATE.md (PR workflow)
3. Auto-sets: pr_workflow=true, github.enabled=true, workflow.verifier=true (test framework exists)
4. Presents inferred config for confirmation: "Based on your project, I've set: [table]. Adjust anything?"
5. User confirms or tweaks one setting
6. Done. Zero questions about things the codebase already answers.

**Why:** The best question is one you don't need to ask. Brownfield projects carry signals that answer most configuration questions. This respects the user's time and demonstrates that Kata understands their project.

**Scope:** Medium-large. Extend brownfield detection in kata-new-project. Create inference rules mapping project signals to config keys. Handle greenfield gracefully (no signals, must ask or default).

**Risks:**
- Inference can be wrong. A .github/ directory doesn't mean the user wants Kata to manage PRs.
- Greenfield projects get no benefit since there's nothing to infer from.
- Maintaining inference rules as project ecosystems evolve. New frameworks, new conventions.
- The "confirm inferred config" step is itself a form of questioning, just with better defaults pre-selected.

---

## Proposal 6: Preference Cascade with Project/User Layers

**What:** Two-layer preference system. User-level defaults in `~/.config/kata/defaults.json` (or `~/.claude/kata/defaults.json`). Project-level overrides in `.planning/config.json`. Resolution: project > user > built-in defaults.

Capture flow: first project asks all questions, writes to both user defaults and project config. Second project inherits user defaults, asks only project-specific questions (or zero questions if defaults are acceptable).

Discovery: skills read `config.json` (project) first. If a key is missing, fall back to user defaults file. If that's also missing, use built-in default.

**UX Flow:**
1. First project: `/kata-new-project` asks 10 questions. Writes to both user defaults and project config.
2. Second project: `/kata-new-project` detects user defaults exist. Shows: "Using your defaults: [summary]. Press enter to accept or customize."
3. User presses enter. Zero questions. Project config written from user defaults.
4. Third project: Same as #2 but user customizes one setting. Only that setting differs from defaults.

**Why:** Repeat Kata users shouldn't re-answer the same questions. Model profile, workflow agent preferences, and statusline choice are personal, not project-specific. Separating layers lets users carry preferences across projects while still allowing per-project overrides.

**Scope:** Medium. Create user defaults file location and read/write logic. Modify kata-new-project to check for user defaults. Add cascade resolution to config reading pattern. No changes needed to individual skill config reads (they already read config.json, which contains the merged result).

**Risks:**
- Claude Code plugin architecture may not support writing to user home directory easily.
- User defaults file can become stale if Kata adds new preference keys in updates.
- Adds complexity to the mental model: "where is this preference coming from?"
- First project still has the full onboarding burden, just with the promise that future projects are faster.
