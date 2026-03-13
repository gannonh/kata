---
estimated_steps: 5
estimated_files: 5
---

# T04: Surface PR setup in preferences, status, and onboarding

**Slice:** S05 — Preferences, Onboarding & `/kata pr` Command
**Milestone:** M003

## Description

Make the PR lifecycle adoptable without guesswork. This task exposes the `pr:` preference block in generated docs/templates, shows PR config in status surfaces, and teaches `/kata` onboarding to proactively offer setup when the repo is GitHub-backed but PR lifecycle is not configured.

## Steps

1. Add a documented `pr:` block with default values to both the canonical preferences template and the bootstrap template used by `ensurePreferences()`.
2. Update the preferences reference docs and PR status formatter so `pr.enabled`, `pr.auto_create`, `pr.base_branch`, `pr.review_on_create`, and `pr.linear_link` are visible, with `pr.linear_link` explicitly marked as pending until S06.
3. Extend `guided-flow.ts` so `/kata` detects a GitHub remote and offers a PR setup action when the project is a good fit but PR lifecycle is unset or disabled.
4. Make the setup action modify project preferences directly with sane defaults instead of only instructing the user to go edit a file manually.
5. Re-run the updated status/onboarding tests and confirm the recommendation disappears once PR setup is enabled.

## Must-Haves

- [ ] New and existing projects can discover the `pr:` block from generated preferences and docs.
- [ ] Status output shows the active PR configuration and whether any part is still pending or intentionally inert until S06.
- [ ] `/kata` onboarding offers PR setup only when a GitHub remote is present and the project is not already configured.
- [ ] The setup action writes sane project preferences directly instead of leaving the user with a vague manual next step.

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-command.test.ts' 'src/resources/extensions/kata/tests/prefs-status.test.ts'`
- `npm test -- --test-name-pattern "prefs status|pr-command"`
- `npx tsc --noEmit`

## Observability Impact

- Signals added/changed: deterministic setup-state labels (`configured`, `setup recommended`, `linear-link pending`) become part of command/status output.
- How a future agent inspects this: use `/kata pr status` or `/kata prefs status` to see whether PR lifecycle is configured and whether onboarding would still prompt for setup.
- Failure state exposed: missing GitHub remote, disabled PR lifecycle, and pending `linear_link` support are all surfaced explicitly instead of being inferred from absent behavior.

## Inputs

- `src/resources/extensions/kata/templates/preferences.md` — canonical project preference template
- `src/resources/extensions/kata/gitignore.ts` — bootstrap-time `ensurePreferences()` template source
- `src/resources/extensions/kata/docs/preferences-reference.md` — documented preference contract
- `src/resources/extensions/kata/guided-flow.ts` — `/kata` onboarding and next-action wizard
- `src/resources/extensions/kata/pr-command.ts` — deterministic PR setup/status helper from T02

## Expected Output

- `src/resources/extensions/kata/templates/preferences.md` — includes a documented `pr:` block with defaults
- `src/resources/extensions/kata/gitignore.ts` — bootstrap template now seeds the PR config block too
- `src/resources/extensions/kata/docs/preferences-reference.md` — explains PR lifecycle preferences and pending `linear_link`
- `src/resources/extensions/kata/guided-flow.ts` — onboarding offers PR setup when relevant and can apply the defaults automatically
- `src/resources/extensions/kata/pr-command.ts` — status/setup helper exposes enough state for onboarding to stay deterministic
