# M003: PR Lifecycle — UAT

**Started:** 2026-03-14
**Status:** In progress
**Mode:** mixed (live CLI walkthrough + contract tests)
**Platform:** CLI / Node.js extensions

---

## Gaps Found

| # | Slice | Gap | Severity | Notes |
|---|-------|-----|----------|-------|
| G001 | M002 | No guided migration wizard from file→linear mode | medium | User must manually edit YAML frontmatter, set env var, and know the fields exist. No `/kata` wizard prompt equivalent to the PR "Set up PR lifecycle" action. |
| G002 | M002 | No project-level auth.json override | medium | Only `~/.kata-cli/agent/auth.json` is checked. Need `.kata-cli/auth.json` at project level to override globals — e.g. different Linear workspaces per project. |
| G003 | M002 | `teamKey` not resolved to `teamId` in 4 call sites | **high** | FIXED. `linear-auto.ts`, `commands.ts`, `linear-tools.ts`, `dashboard-overlay.ts` all destructured `config.linear.teamId` without falling back to `teamKey`. |
| G004 | M002 | `ensureLabel` fails when workspace-level labels exist | **high** | FIXED. Team-scoped search missed workspace-level `kata:*` labels, then create failed with "duplicate label name". Now falls back to workspace label search. |
| G005 | M002 | `/kata` smart-entry is blocked in Linear mode | medium | Warning text confirms `/kata` still routes file-backed wizard and hard-stops in Linear mode. This breaks discoverability/onboarding in manual mode; users must know to use `/kata status`/`/kata auto`/`/kata prefs status`. |
| G003 | M002 | `teamKey` not resolved to `teamId` in `resolveLinearKataState` | **high** | Prefs use `teamKey: KAT` but `linear-auto.ts:49` destructures `config.linear.teamId` which is null. `validateLinearProjectConfig` resolves teamKey→UUID via API but `resolveLinearKataState` doesn't. Linear mode is completely broken when configured with `teamKey` instead of `teamId`. |

---

## Slice UAT Results

### S01: PR Creation & Body Composition
- [ ] Pending

### S02: Bundled Reviewer Subagents & Parallel Dispatch
- [ ] Pending

### S03: Address Review Comments
- [ ] Pending

### S04: Merge & Slice Completion
- [ ] Pending

### S05: Preferences, Onboarding & `/kata pr` Command
- [ ] Pending

### S06: Linear Cross-linking
- [ ] Pending

---

## M002: Linear Workflow (included in this UAT pass)

### Linear Mode Setup & Discovery
- [x] Validated with gaps (G001, G002): feature is operable but onboarding/migration UX is insufficient

### Linear Tools & State Derivation
- [x] Pass: `kata_derive_state` now works in Linear mode with `teamKey`, returning `phase: pre-planning` when no milestones exist

---

## Follow-up Actions

- [ ] Address gaps found during UAT (create tasks or new slice)
- [ ] Integrate UAT as a formal milestone phase in the Kata workflow (manual mode: before release PR)
