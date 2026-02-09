# Requirements: v1.9.0 Template Overrides (Universal)

**Milestone:** v1.9.0
**Created:** 2026-02-08
**Status:** Active

---

## Overview

Fix template override infrastructure to work universally for all users (plugin + skills-only). Move validation from SessionStart hooks into skills, create UI for template customization, and document the feature properly.

---

## v1 Requirements

### Template Resolution

- [x] **TMPL-01**: resolve-template.sh uses relative sibling discovery (all skills are siblings)
- [x] **TMPL-02**: Template resolution works for all installation locations (no absolute paths)
- [x] **TMPL-03**: Clear error messages when template not found in siblings

### Validation Migration

- [ ] **VAL-01**: Template drift detection runs in skills (not SessionStart hooks)
- [ ] **VAL-02**: Config validation runs in skills (not SessionStart hooks)
- [ ] **VAL-03**: Validation works universally for plugin + skills-only users
- [ ] **VAL-04**: SessionStart hooks removed after validation migration complete

### User Interface

- [x] **UI-01**: `/kata-customize` skill created for template management
- [x] **UI-02**: User can list available templates with descriptions of what each controls
- [x] **UI-03**: User can copy plugin default to project override location
- [x] **UI-04**: User can edit template override with validation after save
- [x] **UI-05**: Template validation checks against schema and reports missing required fields

### Documentation

- [x] **DOCS-01**: README includes template customization section
- [x] **DOCS-02**: List of customizable templates with descriptions
- [x] **DOCS-03**: Example workflow for customizing templates
- [x] **DOCS-04**: Template schema documentation (required/optional fields per template)
- [x] **DOCS-05**: Migration guide from hooks to skills-based validation

---

## Future Requirements

(Requirements deferred to later milestones)

- Template versioning and migration system
- Template inheritance/composition
- Project-specific template validation rules
- Template diff/merge tools

---

## Out of Scope

(Explicit exclusions with reasoning)

- **Template marketplace/sharing** — Focus on local customization first, sharing can come later
- **Visual template editor** — CLI-based workflow sufficient for developer audience
- **Automatic template generation** — Users customize existing templates, not generate from scratch
- **Template preprocessing/macros** — Keep templates simple, avoid complexity

---

## Traceability

Requirement → Phase mapping (filled by roadmapper):

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| TMPL-01     | 40    | ○      |
| TMPL-02     | 40    | ○      |
| TMPL-03     | 40    | ○      |
| VAL-01      | 41    | ○      |
| VAL-02      | 41    | ○      |
| VAL-03      | 41    | ○      |
| VAL-04      | 41    | ○      |
| UI-01       | 42    | ○      |
| UI-02       | 42    | ○      |
| UI-03       | 42    | ○      |
| UI-04       | 42    | ○      |
| UI-05       | 42    | ○      |
| DOCS-01     | 43    | ✓      |
| DOCS-02     | 43    | ✓      |
| DOCS-03     | 43    | ✓      |
| DOCS-04     | 43    | ✓      |
| DOCS-05     | 43    | ✓      |

---

*Requirements defined: 2026-02-08*
