# Requirements: v1.6.0 Skills-Native Subagents

## Overview

Deprecate custom subagent types to make Kata portable across Agent Skills-compatible platforms. Move agent instructions from `agents/` to skill resources. Skills inline instructions into Task prompts and spawn standard subagents.

**Experimental milestone:** Working on `feat/skills-subagents` branch. Merge if successful. If POC fails, abandon milestone.

---

## v1.6.0 Requirements

### POC (Proof of Concept)

- [x] **POC-01**: Migrate kata-planner instructions to skill resource
  - Move `agents/kata-planner.md` body content to `skills/kata-plan-phase/references/planner-instructions.md`
  - Keep only essential instructions (role, philosophy, task breakdown, execution flow)

- [x] **POC-02**: Migrate kata-executor instructions to skill resource
  - Move `agents/kata-executor.md` body content to `skills/kata-execute-phase/references/executor-instructions.md`
  - Keep only essential instructions (role, execution protocol, checkpoint handling)

- [x] **POC-03**: Update kata-plan-phase to inline planner instructions
  - Read `references/planner-instructions.md` content
  - Wrap in `<agent-instructions>` tags
  - Combine with task-specific prompt
  - Change `subagent_type="kata:kata-planner"` to `subagent_type="general-purpose"`

- [x] **POC-04**: Update kata-execute-phase to inline executor instructions
  - Read `references/executor-instructions.md` content
  - Wrap in `<agent-instructions>` tags
  - Combine with task-specific prompt
  - Change `subagent_type="kata:kata-executor"` to `subagent_type="general-purpose"`

- [x] **POC-05**: Validate POC behavior matches current behavior
  - Test phase planning with new pattern
  - Test phase execution with new pattern
  - Compare output quality and behavior
  - Document any differences

- [x] **POC-06**: Go/No-Go decision gate
  - Review POC results
  - User decides: proceed to full conversion or abandon

### Full Conversion (contingent on POC success)

- [x] **CONV-01**: Migrate remaining agent instructions to skill resources
  - kata-plan-checker → kata-plan-phase/references/
  - kata-phase-researcher → kata-plan-phase/references/ (also copied to kata-research-phase)
  - kata-verifier → kata-verify-work/references/ (also copied to kata-execute-phase)
  - kata-debugger → kata-debug/references/
  - kata-project-researcher → kata-add-milestone/references/
  - kata-research-synthesizer → kata-add-milestone/references/
  - kata-roadmapper → kata-add-milestone/references/
  - kata-codebase-mapper → kata-track-progress/references/ (also copied to kata-map-codebase)
  - kata-integration-checker → kata-audit-milestone/references/
  - kata-code-reviewer → kata-review-pull-requests/references/
  - kata-code-simplifier → kata-review-pull-requests/references/
  - kata-comment-analyzer → kata-review-pull-requests/references/
  - kata-pr-test-analyzer → kata-review-pull-requests/references/
  - kata-type-design-analyzer → kata-review-pull-requests/references/
  - kata-failure-finder → kata-review-pull-requests/references/
  - kata-silent-failure-hunter → kata-review-pull-requests/references/ (unused)
  - kata-entity-generator → kata-review-pull-requests/references/ (unused)

- [x] **CONV-02**: Update all skills to inline instructions
  - kata-plan-phase (plan-checker)
  - kata-verify-work (verifier, debugger)
  - kata-new-project (project-researcher, roadmapper)
  - kata-add-milestone (project-researcher, research-synthesizer, roadmapper)
  - kata-research-phase (phase-researcher)
  - kata-track-progress (debugger, codebase-mapper)

- [x] **CONV-03**: Update all subagent_type to standard types
  - Replace all `subagent_type="kata:kata-*"` with appropriate standard type
  - Use `general-purpose` for most agents
  - Consider `Explore` for read-only research agents

- [x] **CONV-04**: Automated migration validation test
  - For each agent in `agents/`, verify corresponding instruction file exists in skill `references/`
  - Verify instruction file body matches agent body (no frontmatter, byte-for-byte)
  - Verify referencing skill reads instruction file before Task() calls
  - Verify Task() calls use `subagent_type="general-purpose"` with `<agent-instructions>` wrapper
  - Assert zero remaining `subagent_type="kata:kata-*"` patterns in skills
  - Runs as part of `npm test`

- [x] **CONV-05**: Execute-phase runs test suite before verification
  - After all waves complete (step 6), run project test suite (`npm test` or detected runner)
  - Fail fast before spawning verifier if tests fail
  - Ensures UAT always includes automated test validation

### Agent Teams Migration (contingent on Full Conversion)

- [ ] **TEAM-01**: Evaluate subagent-to-team migration candidates
  - Audit all skills that spawn multiple subagents
  - Classify each as "team candidate" (inter-agent coordination benefits) or "keep subagent" (fire-and-forget)
  - Document decision rationale for each skill

- [ ] **TEAM-02**: Migrate kata-plan-phase to agent teams
  - Researcher + planner + checker as teammates with shared task list
  - Planner ↔ checker revision loop via direct messaging (SendMessage) instead of orchestrator-managed iteration
  - Team lead (skill) creates tasks, teammates self-coordinate
  - Graceful shutdown and cleanup after planning completes

- [ ] **TEAM-03**: Migrate kata-execute-phase to agent teams
  - Parallel executors as teammates with wave-based task dependencies
  - Shared task list replaces manual wave orchestration
  - Task dependency tracking (wave N+1 tasks blocked by wave N)
  - Verifier as teammate that activates after all execution tasks complete

- [ ] **TEAM-04**: Migrate kata-verify-work to agent teams
  - Parallel debuggers as teammates that share findings via messaging
  - Planner/checker teammates coordinate fix plans through direct communication
  - Debuggers can challenge each other's root cause hypotheses

- [ ] **TEAM-05**: Migrate kata-add-milestone to agent teams
  - 4 parallel researcher teammates (Stack, Features, Architecture, Pitfalls)
  - Synthesizer teammate collects and integrates research via messaging
  - Roadmapper teammate receives synthesis and produces phase breakdown
  - Research → synthesis → roadmap pipeline via task dependencies

- [ ] **TEAM-06**: Validation and regression testing
  - Each migrated skill produces equivalent output to pre-migration baseline
  - Agent teams cleanup (shutdown requests + Teammate cleanup) at end of each invocation
  - No orphaned team resources after skill completion
  - Token usage comparison: document cost delta vs subagent pattern

### Cleanup (contingent on Agent Teams Migration)

- [x] **CLEAN-01**: Remove agents/ directory
  - Delete all `agents/kata-*.md` files
  - Remove agents/ directory

- [x] **CLEAN-02**: Update build system
  - Remove agent copying from `scripts/build.js`
  - Remove `.claude-plugin/agents/` output
  - Update build validation

- [x] **CLEAN-03**: Update documentation
  - Update CLAUDE.md (remove agents section, update architecture)
  - Update KATA-STYLE.md (skill resource patterns)
  - Update README if needed

- [x] **CLEAN-04**: Final verification
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

| REQ-ID   | Phase | Status   |
|----------|-------|----------|
| POC-01   | 1     | Complete |
| POC-02   | 1     | Complete |
| POC-03   | 1     | Complete |
| POC-04   | 1     | Complete |
| POC-05   | 1     | Complete |
| POC-06   | 1     | Complete |
| CONV-01  | 2     | Complete |
| CONV-02  | 2     | Complete |
| CONV-03  | 2     | Complete |
| CONV-04  | 2     | Complete |
| CONV-05  | 2     | Complete |
| TEAM-01  | 3     | Pending  |
| TEAM-02  | 3     | Pending  |
| TEAM-03  | 3     | Pending  |
| TEAM-04  | 3     | Pending  |
| TEAM-05  | 3     | Pending  |
| TEAM-06  | 3     | Pending  |
| CLEAN-01 | 4     | Complete |
| CLEAN-02 | 4     | Complete |
| CLEAN-03 | 4     | Complete |
| CLEAN-04 | 4     | Complete |

---
*Requirements defined: 2026-02-04*
*Traceability updated: 2026-02-06*
