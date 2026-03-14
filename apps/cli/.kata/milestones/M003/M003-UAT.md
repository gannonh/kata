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
- [ ] Pending

### Linear Tools & State Derivation
- [ ] Pending

---

## Follow-up Actions

- [ ] Address gaps found during UAT (create tasks or new slice)
- [ ] Integrate UAT as a formal milestone phase in the Kata workflow (manual mode: before release PR)
