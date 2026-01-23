# GSD → Kata Feature Delta Analysis

**Generated**: 2026-01-20
**GSD Version Range**: v1.5.22 → v1.8.0
**Kata Fork Point**: ~v1.5.21 (2026-01-16)
**Kata Current**: v0.1.4

---

## Summary

| Category                   | Count |
| -------------------------- | ----- |
| New Features               | 8     |
| Workflow Changes           | 6     |
| Breaking Changes           | 5     |
| Bug Fixes                  | 18    |
| Documentation/Housekeeping | 7     |

---

## New Features (Added)

### 1. Quick Mode (`/gsd:quick`) — v1.7.0
**Complexity**: Medium
**Description**: Execute small, ad-hoc tasks with GSD guarantees but skip optional agents (researcher, checker, verifier). Quick tasks live in `.planning/quick/` with their own tracking in STATE.md.
**Kata Adaptation**: Rename to `/kata:task-execute`, update paths and branding
**Value**: High — enables lightweight task execution without full phase overhead

### 2. Uncommitted Planning Mode — v1.8.0
**Complexity**: Low
**Description**: Keep `.planning/` local-only (not committed to git) via `planning.commit_docs: false` in config.json. Useful for OSS contributions, client work, or privacy preferences.
**Kata Adaptation**: Direct port, update config.json schema
**Value**: High — essential for OSS contribution workflows

### 3. Git Tracking Setup in project-new — v1.8.0
**Complexity**: Low
**Description**: `/gsd:project-new` now asks about git tracking during initial setup, letting you opt out of committing planning docs from the start.
**Kata Adaptation**: Rename command, update prompts
**Value**: Medium — improves onboarding UX

### 4. `--gaps-only` Flag — v1.6.3
**Complexity**: Low
**Description**: `--gaps-only` flag for `/gsd:phase-execute` — executes only gap closure plans after phase-verify finds issues, eliminating redundant state discovery.
**Kata Adaptation**: Direct port with command rename
**Value**: Medium — workflow optimization

### 5. Cross-platform Notification Hook — v1.5.23
**Complexity**: Medium
**Description**: Mac/Linux/Windows alerts when Claude stops. Completion notification hook.
**Kata Adaptation**: Already partially in Kata (needs verification)
**Value**: Medium — UX improvement

### 6. Statusline Update Indicator — v1.5.22
**Complexity**: Low
**Description**: Shows `⬆ /gsd:update` when a new version is available.
**Kata Adaptation**: Already in Kata (shows `/kata:update`)
**Value**: Already integrated — Skip

### 7. phase-verify Next-Step Routing — v1.6.0
**Complexity**: Low
**Description**: `/gsd:phase-verify` now includes next-step routing after verification completes.
**Kata Adaptation**: Update command references
**Value**: Low — UX polish

### 8. Quick Task Numbered Prefixes — v1.7.1
**Complexity**: Low
**Description**: Quick task PLAN and SUMMARY files now use numbered prefix (`001-PLAN.md`, `001-SUMMARY.md`).
**Kata Adaptation**: Direct port (depends on Quick Mode)
**Value**: Low — consistency fix

---

## Breaking Changes

### 1. Unified `/gsd:milestone-new` Flow — v1.6.0
**Complexity**: High
**Description**: Now mirrors `/gsd:project-new` with questioning → research → requirements → roadmap in a single command.
**Impact**: Removes 4 commands, consolidates workflow
**Kata Adaptation**: Major refactor of milestone commands
**Removed Commands**:
- `/gsd:discuss-milestone`
- `/gsd:create-roadmap`
- `/gsd:define-requirements`
- `/gsd:research-project`

### 2. Removed `/gsd:execute-plan` — v1.5.28
**Complexity**: Medium
**Description**: Use `/gsd:phase-execute` instead.
**Impact**: Command removal, update all references
**Kata Adaptation**: Remove command, update docs

### 3. Consolidated Milestone Workflow — v1.5.28
**Complexity**: Medium
**Description**: Merged domain expertise skills into agent configurations.
**Kata Adaptation**: Update agent configs

### 4. Roadmapper Template References — v1.6.0
**Complexity**: Low
**Description**: Roadmapper agent now references templates instead of inline structures.
**Kata Adaptation**: Update agent to use templates

### 5. Phase Directory Creation Timing — v1.6.2
**Complexity**: Low
**Description**: Phase directories now created at discuss/phase-plan instead of during roadmap creation.
**Kata Adaptation**: Update workflow timing

---

## Workflow/Behavioral Changes

### 1. Domain-Aware Questioning in phase-discuss — v1.5.29
**Complexity**: Medium
**Description**: phase-discuss now uses domain-aware questioning with deeper probing for gray areas.
**Kata Adaptation**: Port questioning logic updates

### 2. Clean Install Behavior — v1.6.1
**Complexity**: Low
**Description**: Installer performs clean install, removing orphaned files from previous versions.
**Kata Adaptation**: Update installer script

### 3. Update Command UX — v1.6.1
**Complexity**: Low
**Description**: `/gsd:update` shows changelog and asks for confirmation before updating.
**Kata Adaptation**: Already partially implemented

### 4. Progress Bar Calculation — v1.7.0
**Complexity**: Low
**Description**: Improved progress bar calculation to clamp values within 0-100 range.
**Kata Adaptation**: Direct port to statusline

### 5. README 6-Step Workflow — v1.6.2
**Complexity**: Skip
**Description**: Documentation restructuring.
**Kata Adaptation**: Kata has own docs

### 6. Thin Orchestrator Pattern Documentation — v1.6.2
**Complexity**: Skip
**Description**: Multi-Agent Orchestration docs explaining 30-40% context efficiency.
**Kata Adaptation**: Kata has own docs

---

## Bug Fixes (Potentially Applicable)

### High Priority (Likely affects Kata)

| Fix                                    | Version | Complexity | Notes                      |
| -------------------------------------- | ------- | ---------- | -------------------------- |
| Windows hooks via Node.js              | v1.5.29 | Medium     | Critical for Windows users |
| Console window flash on Windows        | v1.7.0  | Low        | Windows UX                 |
| Phase directory matching (zero-padded) | v1.5.28 | Low        | Likely same issue          |
| Orchestrator corrections committed     | v1.5.27 | Low        | Git workflow fix           |
| Revised plans committed after checker  | v1.5.26 | Low        | Git workflow fix           |
| Planner loads CONTEXT.md/RESEARCH.md   | v1.5.24 | Low        | Agent reliability          |
| Researcher loads CONTEXT.md            | v1.5.25 | Low        | Agent reliability          |
| WSL2/non-TTY installation              | v1.6.4  | Medium     | Linux/WSL users            |
| Empty `--config-dir` validation        | v1.7.0  | Low        | Edge case                  |

### Lower Priority (May already be different in Kata)

| Fix                                  | Version          | Notes               |
| ------------------------------------ | ---------------- | ------------------- |
| Stop notification hook improvements  | v1.5.24, v1.5.25 | Notification system |
| Blocking notification popups removed | v1.5.29          | May not apply       |
| Orphaned gsd-notify.sh cleanup       | v1.6.4           | GSD-specific        |
| Output templates render markdown     | v1.5.30          | Template fix        |
| Next-step suggestions consistency    | v1.5.30          | Routing fix         |
| File copy verification in install    | v1.6.4           | Installer           |
| allowed-tools YAML format            | v1.7.0           | Agent config        |
| Agent name in phase-research heading | v1.7.0           | Typo fix            |

---

## Already in Kata / Skip

| Feature                            | Reason                          |
| ---------------------------------- | ------------------------------- |
| Statusline update indicator        | Already implemented differently |
| Installation detection             | Kata has own implementation     |
| README/documentation changes       | Kata has own docs               |
| Housekeeping (package.json fields) | Not applicable                  |

---

## Dependency Graph

```
Quick Mode (v1.7.0)
└── Quick Task Numbered Prefixes (v1.7.1)

Uncommitted Planning Mode (v1.8.0)
└── Git Tracking Setup (v1.8.0)

Unified milestone-new (v1.6.0)
├── Removed discuss-milestone
├── Removed create-roadmap
├── Removed define-requirements
└── Removed research-project

Windows Fixes
├── Node.js hooks (v1.5.29)
└── Console flash fix (v1.7.0)

Agent Reliability Fixes
├── Planner loads context (v1.5.24)
├── Researcher loads context (v1.5.25)
└── Phase directory matching (v1.5.28)
```

---

## Not Applicable to Kata

- GSD-specific branding references
- gsd-notify.sh (Kata doesn't have this)
- Hardcoded year fixes (already clean in Kata)
- Dead gsd-researcher references (Kata uses kata-* naming)
