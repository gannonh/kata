# Requirements: v1.6.0 Skills-Native Subagents

## Overview

Deprecate custom subagent types to make Kata portable across Agent Skills-compatible platforms. Move agent instructions from `agents/` to skill resources. Skills inline instructions into Task prompts and spawn standard subagents.

**Experimental milestone:** Working on `feat/skills-subagents` branch. Merge if successful. If POC fails, abandon milestone.

---

## v1.6.0 Requirements

### POC (Proof of Concept)

- [ ] **POC-01**: Migrate kata-planner instructions to skill resource
  - Move `agents/kata-planner.md` body content to `skills/kata-plan-phase/references/planner-instructions.md`
  - Keep only essential instructions (role, philosophy, task breakdown, execution flow)

- [ ] **POC-02**: Migrate kata-executor instructions to skill resource
  - Move `agents/kata-executor.md` body content to `skills/kata-execute-phase/references/executor-instructions.md`
  - Keep only essential instructions (role, execution protocol, checkpoint handling)

- [ ] **POC-03**: Update kata-plan-phase to inline planner instructions
  - Read `references/planner-instructions.md` content
  - Wrap in `<agent-instructions>` tags
  - Combine with task-specific prompt
  - Change `subagent_type="kata:kata-planner"` to `subagent_type="general-purpose"`

- [ ] **POC-04**: Update kata-execute-phase to inline executor instructions
  - Read `references/executor-instructions.md` content
  - Wrap in `<agent-instructions>` tags
  - Combine with task-specific prompt
  - Change `subagent_type="kata:kata-executor"` to `subagent_type="general-purpose"`

- [ ] **POC-05**: Validate POC behavior matches current behavior
  - Test phase planning with new pattern
  - Test phase execution with new pattern
  - Compare output quality and behavior
  - Document any differences

- [ ] **POC-06**: Go/No-Go decision gate
  - Review POC results
  - User decides: proceed to full conversion or abandon

### Full Conversion (contingent on POC success)

- [ ] **CONV-01**: Migrate remaining agent instructions to skill resources
  - kata-plan-checker → kata-plan-phase/references/
  - kata-verifier → kata-verify-work/references/
  - kata-debugger → kata-verify-work/references/
  - kata-project-researcher → kata-new-project/references/
  - kata-phase-researcher → kata-research-phase/references/
  - kata-research-synthesizer → kata-add-milestone/references/
  - kata-roadmapper → kata-new-project/references/
  - kata-codebase-mapper → kata-track-progress/references/
  - (remaining agents)

- [ ] **CONV-02**: Update all skills to inline instructions
  - kata-plan-phase (plan-checker)
  - kata-verify-work (verifier, debugger)
  - kata-new-project (project-researcher, roadmapper)
  - kata-add-milestone (project-researcher, research-synthesizer, roadmapper)
  - kata-research-phase (phase-researcher)
  - kata-track-progress (debugger, codebase-mapper)

- [ ] **CONV-03**: Update all subagent_type to standard types
  - Replace all `subagent_type="kata:kata-*"` with appropriate standard type
  - Use `general-purpose` for most agents
  - Consider `Explore` for read-only research agents

- [ ] **CONV-04**: Test all converted skills
  - Run each skill through typical workflow
  - Verify behavior matches pre-migration
  - Document any regressions

### Cleanup

- [ ] **CLEAN-01**: Remove agents/ directory
  - Delete all `agents/kata-*.md` files
  - Remove agents/ directory

- [ ] **CLEAN-02**: Update build system
  - Remove agent copying from `scripts/build.js`
  - Remove `.claude-plugin/agents/` output
  - Update build validation

- [ ] **CLEAN-03**: Update documentation
  - Update CLAUDE.md (remove agents section, update architecture)
  - Update KATA-STYLE.md (skill resource patterns)
  - Update README if needed

- [ ] **CLEAN-04**: Final verification
  - Build plugin
  - Install in test project
  - Run full workflow (new-project → plan → execute → verify)
  - Confirm all functionality works

---

## Future Requirements (Out of Scope)

**Deferred:**
- Cross-platform testing (other Agent Skills platforms)
- Performance optimization for inlined prompts
- Progressive disclosure for large instruction files

---

## Traceability

| REQ-ID   | Phase | Status  |
|----------|-------|---------|
| POC-01   | 1     | Pending |
| POC-02   | 1     | Pending |
| POC-03   | 1     | Pending |
| POC-04   | 1     | Pending |
| POC-05   | 1     | Pending |
| POC-06   | 1     | Pending |
| CONV-01  | 2     | Pending |
| CONV-02  | 2     | Pending |
| CONV-03  | 2     | Pending |
| CONV-04  | 2     | Pending |
| CLEAN-01 | 3     | Pending |
| CLEAN-02 | 3     | Pending |
| CLEAN-03 | 3     | Pending |
| CLEAN-04 | 3     | Pending |

---
*Requirements defined: 2026-02-04*
*Traceability updated: 2026-02-05*
