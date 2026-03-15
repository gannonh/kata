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
| G006 | M002 | Linear empty-state guidance points to blocked `/kata` entrypoint | medium | `/kata status` and `kata_derive_state` can report "Run /kata to start" even though `/kata` is blocked in Linear mode, creating a dead-end instruction path. |
| G007 | M002 | Linear dashboard selected active slice/task from unsorted API order | medium | FIXED. `deriveLinearState` now sorts slices/tasks by Kata ID (`S01`, `T01`) before picking active entries, and dashboard uses `progress.slices` totals instead of milestone registry length.
| G008 | M002 | Linear extension undocumented in AGENTS.md and README | medium | FIXED. 40 native tools shipped but agent had no self-awareness. Added tool inventory, setup, and config docs to both files.
| G009 | M002 | Agent overwrites preferences.md when configuring Linear | **high** | FIXED (partial). Agent used `write` instead of `edit`, destroying all existing settings. Added warning to template and AGENTS.md. Agent behavior — may recur.
| G010 | M002 | Preferences template duplicated as hardcoded string | medium | FIXED. `ensurePreferences` in `gitignore.ts` had a stale copy. Now reads from `templates/preferences.md` at runtime.
| G011 | M002 | Models example and skill-routing examples deleted from preferences-reference.md | medium | FIXED. Restored — were blown away in `112f0ad` when Linear fields were added.
| G012 | M002 | No project name/slug resolution for `linear.projectId` | medium | Config requires UUID. No equivalent of `teamKey→teamId` for projects. Agent can call `linear_list_projects` as workaround.
| G013 | M002 | "What's the vision?" prompt doesn't elicit config options | medium | Discuss prompt skips workflow configuration (Linear vs file, models, PR lifecycle). New users have no natural path to discover these options.
| G014 | M002 | Auto mode behavior in Linear mode untested | unknown | Deferred — UAT step mode first, then auto mode.
| G015 | M002 | `kata_derive_state` doesn't return `projectId` | medium | Agent called `kata_read_document` 4x with no `projectId` → all null. Had to read `.kata/preferences.md` manually to find the UUID, then re-query. State should include `projectId` so doc reads work immediately.
| G016 | M002 | Agent needs too much ceremony to find slice UUIDs | low | Had to call `linear_get_team` → `kata_ensure_labels` → `kata_list_slices` just to get the Linear UUID for S01. Could be simplified.
| G017 | M002 | Task docs written to project scope instead of issue scope | **high** | FIXED. Prompts said `kata_write_document("T01-PLAN")` with no scope, agent defaulted to `{ projectId }`. T01-PLAN from different slices would collide. Now explicitly uses `{ issueId: sliceUUID }` for all task-level docs.

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
