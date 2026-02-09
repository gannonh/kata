# Template Customization Reference

## Overview

Kata uses 5 templates to generate planning artifacts. Each template has a schema defined by a `kata-template-schema` HTML comment that declares required and optional fields. Override any template by placing a customized copy at `.planning/templates/{template-name}`.

## Template Schemas

### summary-template.md

**Skill:** kata-execute-phase
**Controls:** Phase completion summaries (`{phase}-{plan}-SUMMARY.md`)

| Field Type    | Required                                                                           | Optional                                                                                |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Frontmatter   | phase, plan, subsystem, tags, duration, completed                                  | requires, provides, affects, tech-stack, key-files, key-decisions, patterns-established |
| Body sections | Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made | Deviations from Plan, Issues Encountered, User Setup Required, Next Phase Readiness     |

### plan-template.md

**Skill:** kata-plan-phase
**Controls:** Phase plan structure (`{phase}-{plan}-PLAN.md`)

| Field Type    | Required                                                                             | Optional                              |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| Frontmatter   | phase, plan, type, wave, depends_on, files_modified, autonomous, must_haves          | user_setup, source_issue, gap_closure |
| Body sections | objective, execution_context, context, tasks, verification, success_criteria, output | (none)                                |

### UAT-template.md

**Skill:** kata-verify-work
**Controls:** UAT session format (`{phase}-UAT.md`)

| Field Type    | Required                                | Optional |
| ------------- | --------------------------------------- | -------- |
| Frontmatter   | status, phase, source, started, updated | (none)   |
| Body sections | Current Test, Tests, Summary, Gaps      | (none)   |

### verification-report.md

**Skill:** kata-verify-work
**Controls:** Verification report format (`{phase}-VERIFICATION.md`)

| Field Type    | Required                                                                                              | Optional                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Frontmatter   | phase, verified, status, score                                                                        | re_verification, gaps, human_verification                      |
| Body sections | Goal Achievement, Observable Truths, Required Artifacts, Key Link Verification, Requirements Coverage | Anti-Patterns Found, Human Verification Required, Gaps Summary |

### changelog-entry.md

**Skill:** kata-complete-milestone
**Controls:** Changelog entry format

| Field Type    | Required              | Optional                      |
| ------------- | --------------------- | ----------------------------- |
| Frontmatter   | (none)                | (none)                        |
| Body sections | Added, Fixed, Changed | Deprecated, Removed, Security |

## Schema Format

Templates declare their schema using an HTML comment at the top of the file:

```html
<!-- kata-template-schema
required-fields:
  frontmatter: [field1, field2]
  body: [Section Name 1, Section Name 2]
optional-fields:
  frontmatter: [field3]
  body: [Optional Section]
version: 1
-->
```

**Required fields** must be present in any override. The validation system (`check-template-drift.sh`) checks for:
- Frontmatter fields: `fieldname:` pattern in the YAML frontmatter block
- Body sections: Markdown headings (`## Section Name`) or XML tags (`<section_name>`)

**Optional fields** are recognized by the schema but not enforced during validation.

## How Resolution Works

When a skill needs a template, `resolve-template.sh` checks two locations in order:

1. **Project override:** `.planning/templates/{template-name}` (checked first)
2. **Built-in default:** `skills/kata-*/references/{template-name}` (sibling discovery)

The first match wins. If no file is found at either location, the script exits with an error listing both search paths.

## Validation Architecture

### How Validation Runs

Validation runs as pre-flight checks inside skills, not as SessionStart hooks. Five orchestrator skills run validation before their main process:

| Skill                   | Config check | Template drift check |
| ----------------------- | ------------ | -------------------- |
| kata-execute-phase      | Yes          | Yes                  |
| kata-plan-phase         | Yes          | Yes                  |
| kata-complete-milestone | Yes          | Yes                  |
| kata-add-milestone      | Yes          | No                   |
| kata-verify-work        | Yes          | Yes                  |

`kata-add-milestone` skips template drift checks because it does not resolve templates.

### Validation Scripts

Both scripts live at `skills/kata-doctor/scripts/`:

- **check-config.sh** — Validates `.planning/config.json` against the known key schema (17 keys). Warns on unknown keys and invalid types.
- **check-template-drift.sh** — Scans `.planning/templates/` for overrides, compares each against the `kata-template-schema` comment in the corresponding default template, and reports missing required fields.

Both scripts always exit 0 (warnings only, never blocking).

### On-Demand Validation

- `/kata-customize validate` — Runs template drift check and displays results
- `/kata-doctor` — Full project health check including config validation, template drift, and roadmap format

## Migration from Hooks

**v1.9.0 removed the SessionStart hooks system.** Validation that previously ran at session start now runs inside skills.

### What Changed

| Before (v1.8.0)                                       | After (v1.9.0)                                           |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `hooks/kata-config-validator.js` ran at session start | `check-config.sh` runs as pre-flight in 5 skills         |
| `hooks/kata-template-drift.js` ran at session start   | `check-template-drift.sh` runs as pre-flight in 4 skills |
| Hooks required plugin installation                    | Scripts use sibling discovery, work everywhere           |
| `hooks/hooks.json` registry                           | No registry needed                                       |

### What Was Removed

- `hooks/hooks.json` (hook registry)
- `hooks/kata-template-drift.js` (SessionStart hook)
- `hooks/kata-config-validator.js` (SessionStart hook)
- `scripts/build-hooks.cjs` (hook build script)

### Impact

- **No action required for users.** The same validations run automatically. The only difference is timing: validation runs when a skill starts instead of when a session starts.
- **Skills-only users get validation.** Previously, hooks only worked for plugin installations. The new scripts work for all installation methods.
