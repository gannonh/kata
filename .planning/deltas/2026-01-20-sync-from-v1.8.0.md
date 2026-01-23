# GSD → Kata Feature Integration Plan

**Generated**: 2026-01-20
**Upstream**: GSD @ v1.8.0
**Fork**: Kata @ v0.1.4
**Fork Point**: GSD v1.5.21

---

## Executive Summary

| Metric                        | Count |
| ----------------------------- | ----- |
| Total Features to Integrate   | 14    |
| Low Complexity                | 8     |
| Medium Complexity             | 4     |
| High Complexity               | 1     |
| Skipped (N/A or Already Done) | 5     |
| Breaking Changes to Handle    | 5     |

**Estimated Integration Scope**: 3-4 integration phases covering core features, workflow consolidation, and bug fixes.

---

## Priority Backlog

### P0: Critical / High Value

| Feature                           | Source Version | Complexity | Dependencies | Notes                            |
| --------------------------------- | -------------- | ---------- | ------------ | -------------------------------- |
| Quick Mode (`/kata:task-execute`) | v1.7.0         | Medium     | None         | High-value lightweight execution |
| Uncommitted Planning Mode         | v1.8.0         | Low        | None         | Essential for OSS workflows      |
| Windows Node.js Hooks             | v1.5.29        | Medium     | None         | Critical for Windows users       |
| WSL2/non-TTY Installation         | v1.6.4         | Medium     | None         | Linux/WSL users                  |

### P1: Important

| Feature                    | Source Version | Complexity | Dependencies     | Notes                        |
| -------------------------- | -------------- | ---------- | ---------------- | ---------------------------- |
| Unified milestone-new Flow | v1.6.0         | High       | None             | Major workflow consolidation |
| `--gaps-only` Flag         | v1.6.3         | Low        | None             | Execution optimization       |
| Git Tracking Setup         | v1.8.0         | Low        | Uncommitted Mode | Onboarding UX                |
| Progress Bar Clamping      | v1.7.0         | Low        | None             | Statusline fix               |
| Console Window Flash Fix   | v1.7.0         | Low        | Node.js Hooks    | Windows UX                   |

### P2: Nice to Have

| Feature                        | Source Version | Complexity | Dependencies | Notes                 |
| ------------------------------ | -------------- | ---------- | ------------ | --------------------- |
| phase-verify Next-Step Routing | v1.6.0         | Low        | None         | UX polish             |
| Quick Task Numbered Prefixes   | v1.7.1         | Low        | Quick Mode   | Consistency           |
| Clean Install Behavior         | v1.6.1         | Low        | None         | Installer improvement |
| Update Command Changelog UX    | v1.6.1         | Low        | None         | Already partial       |

### P3: Bug Fixes to Port

| Fix                                | Source Version | Complexity | Notes                |
| ---------------------------------- | -------------- | ---------- | -------------------- |
| Phase directory matching           | v1.5.28        | Low        | Zero-padded/unpadded |
| Orchestrator corrections committed | v1.5.27        | Low        | Git workflow         |
| Revised plans committed            | v1.5.26        | Low        | Git workflow         |
| Planner loads CONTEXT.md           | v1.5.24        | Low        | Agent reliability    |
| Researcher loads CONTEXT.md        | v1.5.25        | Low        | Agent reliability    |
| Empty config-dir validation        | v1.7.0         | Low        | Edge case            |

### Skipped

| Feature                      | Reason                      |
| ---------------------------- | --------------------------- |
| Statusline update indicator  | Already implemented in Kata |
| README documentation changes | Kata has own documentation  |
| gsd-notify.sh cleanup        | Kata never had this         |
| Housekeeping (package.json)  | Already done differently    |
| Hardcoded year fixes         | Clean in Kata               |

---

## Breaking Changes Analysis

| Change                             | Upstream Version | Impact                    | Migration Strategy                            |
| ---------------------------------- | ---------------- | ------------------------- | --------------------------------------------- |
| Unified `/gsd:milestone-new`       | v1.6.0           | High — removes 4 commands | Port unified workflow, deprecate old commands |
| Removed `/gsd:execute-plan`        | v1.5.28          | Medium — command removal  | Update all references to use phase-execute    |
| Removed `/gsd:discuss-milestone`   | v1.6.0           | Medium — workflow change  | Fold into milestone-new                       |
| Removed `/gsd:create-roadmap`      | v1.6.0           | Medium — workflow change  | Fold into project/milestone flows             |
| Removed `/gsd:define-requirements` | v1.6.0           | Medium — workflow change  | Fold into project/milestone flows             |

---

## Risk Assessment

### High Risk Items

| Feature               | Risk                           | Mitigation                                |
| --------------------- | ------------------------------ | ----------------------------------------- |
| Unified milestone-new | Breaks existing user workflows | Gradual deprecation, clear migration docs |
| Quick Mode            | New subsystem to maintain      | Thorough testing, isolated implementation |

### Conflicts with Kata Divergence

| Area         | Kata Approach       | GSD Approach        | Resolution                            |
| ------------ | ------------------- | ------------------- | ------------------------------------- |
| Branding     | `kata:*`, `kata-*`  | `gsd:*`, `gsd-*`    | Consistent renaming required          |
| Installation | Own detection logic | Different detection | Keep Kata's approach, port fixes only |
| Statusline   | Already customized  | GSD-specific        | Keep Kata's, port calculation fix     |

---

## Implementation Phases

### Phase 1: Foundation & Quick Wins
**Goal**: Establish prerequisite fixes and low-hanging fruit

- [ ] Port progress bar clamping fix (v1.7.0)
- [ ] Port phase directory matching fix (v1.5.28)
- [ ] Port Planner/Researcher context loading fixes (v1.5.24, v1.5.25)
- [ ] Port git workflow fixes (v1.5.26, v1.5.27)
- [ ] Port empty config-dir validation (v1.7.0)

**Kata Adaptation**: Minimal — mostly direct ports with `gsd→kata` naming

### Phase 2: Platform Support
**Goal**: Windows and WSL compatibility

- [ ] Port Windows Node.js hooks conversion (v1.5.29)
- [ ] Port console window flash fix (v1.7.0)
- [ ] Port WSL2/non-TTY installation fix (v1.6.4)
- [ ] Port clean install behavior (v1.6.1)

**Kata Adaptation**: Verify Kata's hook system matches, update paths

### Phase 3: Quick Mode
**Goal**: Add lightweight task execution

- [ ] Port Quick Mode (`/kata:task-execute`) (v1.7.0)
- [ ] Port Quick Task numbered prefixes (v1.7.1)
- [ ] Create `.planning/quick/` structure
- [ ] Update STATE.md to track quick tasks

**Kata Adaptation**: Full rename `gsd:quick` → `kata:task-execute`, update all references

### Phase 4: Uncommitted Planning & Workflow Consolidation
**Goal**: Privacy features and milestone simplification

- [ ] Port uncommitted planning mode (v1.8.0)
- [ ] Port git tracking setup in project-new (v1.8.0)
- [ ] Port `--gaps-only` flag (v1.6.3)
- [ ] Evaluate unified milestone-new (v1.6.0) — may defer

**Kata Adaptation**:
- Config.json schema update for `planning.commit_docs`
- Command prompts update for git tracking question
- Consider whether to unify milestone flow or keep modular

---

## Testing Strategy

- [ ] Unit tests for each ported feature
- [ ] Integration tests for Quick Mode workflow
- [ ] Windows/WSL testing for platform fixes
- [ ] Regression tests for existing Kata functionality
- [ ] E2E validation of milestone workflows

---

## GSD → Kata Translation Reference

| GSD                     | Kata                      |
| ----------------------- | ------------------------- |
| `/gsd:quick`            | `/kata:task-execute`      |
| `/gsd:project-new`      | `/kata:project-new`       |
| `/gsd:milestone-new`    | `/kata:milestone-new`     |
| `/gsd:phase-execute`    | `/kata:phase-execute`     |
| `gsd-executor`          | `kata-executor`           |
| `gsd-planner`           | `kata-planner`            |
| `get-shit-done` package | `kata` package            |
| `.planning/quick/`      | `.planning/quick/` (same) |

---

## Notes

### Deferred Decisions

1. **Unified milestone-new flow**: GSD removed 4 commands and consolidated into one. Kata could:
   - Port the unified approach (breaking change for users)
   - Keep modular commands (diverge from GSD)
   - Deprecate gradually with warnings

2. **Notification hooks**: Kata may have different notification approach — verify before porting.

### Next Steps

1. Start with Phase 1 (Foundation & Quick Wins)
2. Test on Windows/WSL before Phase 2
3. Quick Mode is self-contained — can be done independently
4. Uncommitted planning is high-value, low-risk

---

*This plan was generated by the `planning-kata-fork-feature-integration` skill.*
*See DELTA-ANALYSIS.md for detailed feature-by-feature breakdown.*
