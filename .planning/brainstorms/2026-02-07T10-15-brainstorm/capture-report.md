# Capture & Discovery Patterns: Consolidated Report

Explorer: explorer-capture
Challenger: challenger-capture
Date: 2026-02-07
Rounds: 3

---

## Problem Statement

Kata's onboarding (`/kata-new-project` Phase 5) asks ~11 configuration questions upfront across two rounds. Many of these questions can't be answered meaningfully until the user encounters the relevant workflow. Users need to reach their first executed plan quickly to see Kata's value. The system needs:

1. A way to capture preferences progressively (essentials at onboarding, rest at first encounter)
2. A way for workflows to discover whether a preference has been set and either use the default or prompt

---

## Proposals Evaluated

| # | Proposal | Verdict | Key Issue |
|---|----------|---------|-----------|
| 1 | Check-or-Ask Inline | Adopt (with modification) | Config write fragility requires utility script |
| 2 | Preference Registry | Reject | Over-engineered for 15 keys; "shared function" doesn't fit markdown-prompt architecture |
| 3 | Tiered Onboarding | Adopt (conceptual model only) | Tier formalization adds complexity; key existence suffices for tracking |
| 4 | Silent Defaults | Adopt (for subset) | Good for preferences users must experience to evaluate; bad for cost-impacting preferences without notice |
| 5 | Context-Aware Inference | Defer | Useful as complement for 2-3 signals; full inference shifts cognitive load rather than reducing it |
| 6 | Preference Cascade | Defer to v2 | Doesn't solve first-project problem; architecturally awkward for plugins |

---

## Recommended Approach

**Inline check-or-ask with centralized config write utility, tiered grouping documented but not enforced in code, silent defaults for experience-dependent preferences.**

### Preference Classification

| Preference | Current | Proposed | Rationale |
|---|---|---|---|
| `mode` | Onboarding | Onboarding | Fundamental workflow behavior; affects every skill |
| `depth` | Onboarding | Onboarding | Affects roadmap creation in next command |
| `commit_docs` | Onboarding | Onboarding | Affects every git operation in every skill |
| `pr_workflow` | Onboarding | Onboarding | Hard-to-reverse: branches created on first execute-phase |
| `github.enabled` + `issueMode` | Onboarding | Onboarding | Conditional follow-up; same existing structure |
| `model_profile` | Onboarding (Round 2) | First `/kata-plan-phase`, step 3.5 | User can evaluate quality-vs-cost without prior experience |
| `workflow.research` | Onboarding (Round 2) | Silent default (on) | User must experience the agent to evaluate its value |
| `workflow.plan_check` | Onboarding (Round 2) | Silent default (on) | User must experience the agent to evaluate its value |
| `workflow.verifier` | Onboarding (Round 2) | Silent default (on) | User must experience the agent to evaluate its value |
| `display.statusline` | Onboarding (Round 2) | Silent default (on) | Cosmetic, zero cost impact |
| `parallelization` | Onboarding (Round 1) | DROP from schema | Not read by any skill at runtime; dead config |

**Net result:** 11 questions at onboarding -> 5 at onboarding + 1 at first plan-phase = 6 total across two natural touchpoints.

### Why Workflow Agents Are Silent Defaults (Not Prompted)

The challenger's Round 3 argument: asking "disable any of these agents you've never seen?" provides no value. First-time users will always answer "keep the defaults" because they have no basis for evaluation. This converts three separate yes/no questions into zero questions with one-line notices.

Each notice appears when the agent is about to spawn:

```
Researcher: on (default). Run /kata-configure-settings to change.
```

On the first `/kata-plan-phase` only, the notice is slightly more prominent to ensure visibility:

```
+--------------------------------------------------+
| Agent defaults active: Research, Plan Check,     |
| Verification. Run /kata-configure-settings to    |
| customize agent preferences.                     |
+--------------------------------------------------+
```

Subsequent runs suppress this box (key exists in config.json = already informed).

### Implementation Components

**1. Plugin-level config write utility**

Create `kata/scripts/set-config.sh` (or `set-config.js`):

```
# Usage: set-config.sh <key-path> <value>
# Examples:
#   set-config.sh model_profile balanced
#   set-config.sh workflow.research false
```

Handles: JSON parse, nested key set (dot notation), atomic write (temp file + rename). Follows precedent of `skills/kata-execute-phase/scripts/find-phase.sh` and `skills/kata-plan-phase/scripts/update-issue-plans.py`.

Skills continue reading config via existing grep pattern (tolerant, proven). Only the write path is centralized.

**2. kata-new-project Phase 5 reduced**

Remove Round 2 entirely. Phase 5 asks 5 questions (mode, depth, commit_docs, pr_workflow, github). Config.json is written with these keys plus defaults for all others:

```json
{
  "mode": "yolo",
  "depth": "standard",
  "commit_docs": true,
  "pr_workflow": false,
  "model_profile": "balanced",
  "display": { "statusline": true },
  "workflow": { "research": true, "plan_check": true, "verifier": true },
  "github": { "enabled": false, "issueMode": "never" }
}
```

All keys present from init. The deferred preferences use defaults. The check-or-ask pattern detects "first run" via a sentinel (e.g., absence of a `_preferences_prompted.model_profile` key or a dedicated `_prompted` object) rather than key existence, since all keys are pre-populated with defaults.

Alternative: only write keys that were explicitly asked. Deferred preferences are absent from config.json until prompted. Skills fall back to built-in defaults via the `|| echo "balanced"` pattern. This is simpler and uses key absence as the "not yet asked" signal.

**Decision needed at implementation time:** sentinel vs. key-absence approach. Key-absence is simpler but requires config.json to omit keys for deferred preferences. Sentinel is more explicit but adds schema complexity.

**3. kata-plan-phase gains step 3.5**

Between "validate phase" (step 3) and "ensure phase dir" (step 4):

```
Step 3.5: Check-or-ask preferences

Check if model_profile key exists in config.json.
If missing:
  Display: "Before we start, one preference for how planning agents work:"
  AskUserQuestion for model_profile (Quality / Balanced / Budget)
  Write to config.json via set-config.sh

  Display agent defaults notice box (first run only)

Re-resolve model profile for agent spawning (overrides step 1 default).
```

On subsequent runs: key exists, step 3.5 is a no-op.

**4. Workflow agents: one-line notices**

In kata-plan-phase step 5 (research), step 10 (plan-check), and kata-execute-phase step 7 (verifier):

```
Using default: {agent} enabled. /kata-configure-settings to change.
```

First plan-phase only: show the prominent box (component 3 above). Subsequent runs: suppress box, show inline notice only if user hasn't run /kata-configure-settings.

**5. parallelization key removed**

Drop `parallelization` from:
- kata-new-project Phase 5 questions
- kata-configure-settings schema
- config.json template
- planning-config.md reference

If parallelization control is needed later, implement the runtime read first, then add the preference.

**6. Tier documentation**

Create a reference file (e.g., `kata/references/preference-tiers.md`) documenting which preferences are asked when and why. This serves as:
- Documentation for skill authors adding new preferences
- Input for kata-configure-settings to enumerate all settings
- Decision record for tier assignments

Not enforced in code. No _meta tracking. No tier runtime checks.

---

## Debate Record

### Round 1: Initial Proposals
Explorer proposed 6 approaches. Challenger reviewed all 6, endorsed check-or-ask concept (P1) and tiered model (P3) while identifying config write fragility as a blocking concern.

### Round 2: Three Concerns Addressed
- **Config writes:** Resolved via utility script (accepted by both sides)
- **Insertion point:** Step 3.5 in kata-plan-phase, after validation but before mutations/spawns (accepted with modification)
- **Concrete classification:** Explorer provided full preference-by-preference breakdown

### Round 3: Two Corrections Incorporated
- **Challenger correction 1:** Workflow agent toggles should be silent defaults, not prompted at step 3.5. Users can't evaluate agents they haven't seen. Reduces first plan-phase from 2 questions to 1. Accepted.
- **Challenger correction 2:** `parallelization` is dead config. No skill reads it at runtime. Drop from schema. Verified via codebase search. Accepted.
- **Challenger observation:** `mode` (yolo/interactive) could also silent-default to yolo. Explorer keeps it in onboarding as a natural opening question. Acknowledged as judgment call.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Silent-default agents burn tokens before user can react | Medium | Prominent notice box on first plan-phase; one-line notices on spawns |
| Config write utility introduces new dependency | Low | Small script, follows existing precedent, testable in isolation |
| Key-absence vs. sentinel debate delays implementation | Low | Decide at implementation time; both approaches work |
| Users miss one-line default notices in output | Medium | First-run box is hard to miss; /kata-configure-settings always available |
| New preferences added without tier documentation | Low | Reference file serves as checklist for skill authors |

---

## Scope Estimate

Small-medium (2-3 plans):
- Plan 1: Create set-config utility, reduce kata-new-project Phase 5, remove parallelization
- Plan 2: Add step 3.5 to kata-plan-phase, add default notices to plan-phase and execute-phase
- Plan 3 (optional): Create preference-tiers reference, update kata-configure-settings to reflect new schema
