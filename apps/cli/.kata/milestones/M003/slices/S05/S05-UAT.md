# S05: Preferences, Onboarding & `/kata pr` Command — UAT

**Status:** Ready for human testing
**Branch:** kata/M003/S05

---

## Test 1: `/kata pr status` shows PR config

**Steps:** Run `/kata pr status` on a project with `pr.enabled: true` in preferences.

**Expected:** Shows `PR lifecycle: enabled`, `branch:`, `base_branch:`, `auto_create:`, and open PR number (or "no open PR"). No LLM turn fires.

---

## Test 2: `/kata pr status` warns when disabled

**Steps:** Run `/kata pr status` on a project with `pr.enabled: false` or missing `pr:` block.

**Expected:** Shows `PR lifecycle: pr.enabled is false (disabled)` with setup guidance. Level is warning.

---

## Test 3: `/kata pr create` dispatches PR creation

**Steps:** On a Kata slice branch with a clean commit, run `/kata pr create`.

**Expected:** Agent calls `kata_create_pr` and returns the PR URL. If `review_on_create: true`, automatically chains into review.

---

## Test 4: `/kata prefs status` shows pr.enabled line

**Steps:** Run `/kata prefs status` on a project with `pr.enabled: true`.

**Expected:** Output includes `pr.enabled: true`, `pr.auto_create: <value>`, `pr.base_branch: <value>`.

---

## Test 5: New project bootstrap includes `pr:` block

**Steps:** Run `/kata` on a fresh directory with no `.kata/` folder.

**Expected:** `.kata/preferences.md` is created and contains a `pr:` block with `enabled: false` and all five fields.

---

## Test 6: `/kata` wizard offers PR setup on GitHub project

**Steps:** Run `/kata` on a project with a GitHub remote and `pr.enabled: false`, with a roadmap ready to execute.

**Expected:** Wizard summary includes PR setup recommendation. "Set up PR lifecycle" action is present. Choosing it writes `pr.enabled: true` to `.kata/preferences.md`.

---

## Test 7: Auto-mode creates PR and pauses after slice completes

**Steps:** With `pr.enabled: true` and `pr.auto_create: true`, run `/kata auto` through a complete-slice unit.

**Expected:** After slice completes, auto-mode calls `kata_create_pr`, notifies the PR URL, and pauses with "review and merge the PR, then run /kata auto to continue." Does NOT squash-merge to main.

---

## Test 8: Auto-mode skips merge and notifies when pr.enabled but no auto_create

**Steps:** With `pr.enabled: true` and `pr.auto_create: false` (or absent), run `/kata auto` through a complete-slice unit.

**Expected:** After slice completes, auto-mode does not squash-merge. Notifies user to run `/kata pr create` manually.

---

## Test 9: Legacy squash-merge preserved when pr disabled

**Steps:** With `pr.enabled: false` (or no `pr:` block), run `/kata auto` through a complete-slice unit.

**Expected:** Auto-mode squash-merges to main exactly as before. No PR-related notifications.
