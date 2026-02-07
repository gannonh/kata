# Requirements: v1.8.0 Adaptive Workflows

## Preferences Infrastructure

- [x] **PREF-01**: Preferences stored in `.planning/preferences.json` with flat dot-notation keys (`release.changelog_format`, `docs.readme_on_milestone`)
- [x] **PREF-02**: Accessor script (`read-pref.sh`) centralizes parsing with resolution chain: preferences.json -> config.json -> built-in defaults
- [x] **PREF-03**: Discovery script (`has-pref.sh`) returns whether a user has expressed a preference for a given key
- [x] **PREF-04**: `kata-new-project` scaffolds empty `preferences.json` alongside `config.json`
- [x] **PREF-05**: Built-in defaults table covers all known preference keys (release, docs, conventions domains)

## Progressive Capture

- [x] **CAP-01**: `kata-new-project` onboarding reduced to 5 essential questions: mode, depth, commit_docs, pr_workflow, github
- [x] **CAP-02**: `model_profile` deferred to first `/kata-plan-phase` via check-or-ask pattern (step 3.5)
- [x] **CAP-03**: Workflow agent toggles (research, plan_check, verifier) silent-default to `true` with prominent first-run notice
- [x] **CAP-04**: Config write utility (`set-config.sh`) handles JSON parse, nested key set, and atomic write
- [x] **CAP-05**: Dead `parallelization` key removed from onboarding, config schema, and settings skill

## Template Overrides

- [ ] **TMPL-01**: Five templates extracted from inline skill references into standalone files within skills
- [ ] **TMPL-02**: Template resolution logic checks `.planning/templates/{name}.md` first, falls back to plugin default
- [ ] **TMPL-03**: Each extractable template includes schema comment listing required fields
- [ ] **TMPL-04**: Session-start hook detects drift between project templates and current plugin schema, emits warning for missing required fields

## Config Workflow Variants

- [ ] **WKFL-01**: `config.json` gains `workflows` section with per-skill keys for project-specific commands and format strings
- [ ] **WKFL-02**: `kata-execute-phase` reads `workflows.execute-phase` config (post_task_command, commit_style, commit_scope_format)
- [ ] **WKFL-03**: `kata-verify-work` reads `workflows.verify-work` config (extra_verification_commands)
- [ ] **WKFL-04**: `kata-complete-milestone` reads `workflows.complete-milestone` config (version_files, pre_release_commands)
- [ ] **WKFL-05**: Schema validation on session start warns on unknown keys, errors on invalid value types
- [ ] **WKFL-06**: `/kata-configure-settings` updated to manage preferences.json (project-lifetime settings), workflow variants, and uses accessor/write utilities; drops dead `parallelization` key

## Future Requirements (deferred)

- Hook points (`.planning/hooks/{skill-name}/{hook-name}.md`) for prompt fragment injection at named skill points
- Project profiles/presets composing templates + config + hooks into archetypes (api-service, mobile-app, library)
- Preference cascade across projects (cross-project defaults)
- Migrate existing ~90 config.json grep patterns to accessor script

## Out of Scope

- Skill shadowing (project skills override plugin skills) — Claude Code doesn't support clean precedence
- Composable skill fragments — requires refactoring all 30 skills, scope explosion
- Full preference registry with shared function library — over-engineered for current key count
- Context-aware inference of preferences — shifts cognitive load rather than reducing it

## Traceability

| Requirement | Phase | Plan |
|-------------|-------|------|
| PREF-01 | 37 | 02 |
| PREF-02 | 37 | 01 |
| PREF-03 | 37 | 01 |
| PREF-04 | 37 | 02 |
| PREF-05 | 37 | 01 |
| CAP-01 | 37 | 02 |
| CAP-02 | 37 | 02 |
| CAP-03 | 37 | 02 |
| CAP-04 | 37 | 01 |
| CAP-05 | 37 | 02 |
| TMPL-01 | 38 | — |
| TMPL-02 | 38 | — |
| TMPL-03 | 38 | — |
| TMPL-04 | 38 | — |
| WKFL-01 | 39 | — |
| WKFL-02 | 39 | — |
| WKFL-03 | 39 | — |
| WKFL-04 | 39 | — |
| WKFL-05 | 39 | — |
| WKFL-06 | 39 | — |

*20 requirements across 4 categories, mapped to 3 phases*

## Source

- Brainstorm: `.planning/brainstorms/2026-02-07T10-15-brainstorm/SUMMARY.md`
- Issue: `.planning/issues/open/2026-02-06-user-workflow-preferences-override-mechanism.md` (GitHub #104)
