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

- [ ] **TMPL-01**: resolve-template.sh uses relative sibling discovery (all skills are siblings)
- [ ] **TMPL-02**: Template resolution works for all installation locations (no absolute paths)
- [ ] **TMPL-03**: Clear error messages when template not found in siblings

### Validation Migration

- [ ] **VAL-01**: Template drift detection runs in skills (not SessionStart hooks)
- [ ] **VAL-02**: Config validation runs in skills (not SessionStart hooks)
- [ ] **VAL-03**: Validation works universally for plugin + skills-only users
- [ ] **VAL-04**: SessionStart hooks removed after validation migration complete

### User Interface

- [ ] **UI-01**: `/kata-customize-template` skill created for template management
- [ ] **UI-02**: User can list available templates with descriptions of what each controls
- [ ] **UI-03**: User can copy plugin default to project override location
- [ ] **UI-04**: User can edit template override with validation after save
- [ ] **UI-05**: Template validation checks against schema and reports missing required fields

### Documentation

- [ ] **DOCS-01**: README includes template customization section
- [ ] **DOCS-02**: List of customizable templates with descriptions
- [ ] **DOCS-03**: Example workflow for customizing templates
- [ ] **DOCS-04**: Template schema documentation (required/optional fields per template)
- [ ] **DOCS-05**: Migration guide from hooks to skills-based validation

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
|-------------|-------|--------|
| TMPL-01     | TBD   | ○      |
| TMPL-02     | TBD   | ○      |
| TMPL-03     | TBD   | ○      |
| VAL-01      | TBD   | ○      |
| VAL-02      | TBD   | ○      |
| VAL-03      | TBD   | ○      |
| VAL-04      | TBD   | ○      |
| UI-01       | TBD   | ○      |
| UI-02       | TBD   | ○      |
| UI-03       | TBD   | ○      |
| UI-04       | TBD   | ○      |
| UI-05       | TBD   | ○      |
| DOCS-01     | TBD   | ○      |
| DOCS-02     | TBD   | ○      |
| DOCS-03     | TBD   | ○      |
| DOCS-04     | TBD   | ○      |
| DOCS-05     | TBD   | ○      |

---

*Requirements defined: 2026-02-08*
