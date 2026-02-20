# Design Mocks

Screenshots documenting the Kata Cloud UI across key product flows. Numbered in user journey order.

---

## Onboarding / Create Space

| File | Description |
|------|-------------|
| `01-create-space-modal-empty.png` | "Let's get building!" modal — blank state, team orchestration vs single agent choice |
| `02-create-space-modal-with-spaces.png` | Same modal with existing spaces listed in the right panel |
| `03-coordinator-new-tab-dropdown.png` | Coordinator tab with new tab dropdown: New Agent, New Note, New Terminal, New Browser |

## Coordinator Session — Getting Started

| File | Description |
|------|-------------|
| `04-coordinator-session-initial-state.png` | Coordinator just launched, narrow view, spec generation in progress |
| `05-coordinator-session-pasted-context.png` | Full layout after pasting 205 lines of context; Notes/Spec panel visible |
| `06-coordinator-session-spec-context-reading.png` | Coordinator reading overview doc, spec panel populated |
| `07-coordinator-session-spec-analyzing.png` | Coordinator analyzing notebook context before delegation |
| `08-spec-panel-overview-initial.png` | Spec panel: initial overview doc review, goal and tasks visible |
| `09-spec-panel-goal-and-tasks.png` | Spec panel: goal, tasks, acceptance criteria, assumptions, verification plan |

## Build Session — Planning & Architecture

| File | Description |
|------|-------------|
| `10-build-session-spec-draft-review.png` | "Build Kata Cloud MVP" session — coordinator reviewing draft spec with clarifications |
| `11-build-session-architecture-proposal.png` | Coordinator proposing architecture with Electron + tech stack recommendation |
| `12-build-session-tech-stack-a.png` | Tech stack discussion — coordinator aligning stack with requirements |
| `13-build-session-tech-stack-b.png` | Tech stack discussion continued — same session, incremental state |
| `14-build-session-task-tracking.png` | Task list visible in left panel; coordinator reviewing with full task breakdown |

## Changes & Files View

| File | Description |
|------|-------------|
| `15-changes-tab-view.png` | Changes tab selected in left panel, file list visible |
| `16-changes-tab-unstaged-files.png` | Changes tab — unstaged files expanded |
| `17-changes-tab-staged-files.png` | Changes tab — staged files with commit interface |

## Wave 1 Execution

| File | Description |
|------|-------------|
| `18-wave1-delegation-started.png` | Wave 1 delegation to parallel agents; task blocks dispatched |
| `19-wave1-merge-strategy.png` | Coordinator planning merge strategy across scaffold tasks |
| `20-wave1-architecture-decisions.png` | Architecture finalized — ReactNative/Electron decision, dependency graph |
| `21-wave1-bootstrap-verification.png` | Wave 1 bootstrap complete — verification signal, task status |
| `22-wave1-duplicate-checkpoint.png` | Coordinator handling duplicate checkpoint events from git task |
| `23-wave1-space-git-integration.png` | Space task management — git integration window opening |
| `24-wave1-remediation.png` | Wave 1 remediation spec — updated tasks and verification scope |
| `25-unblock-wave1-terminal-session.png` | "Unblock Wave 1 Verification" session — terminal tab, Wave 1 Coordinator active |

## Orchestrator Completion

| File | Description |
|------|-------------|
| `26-orchestrator-task-completion-a.png` | Orchestrator task mode complete — left panel with agents, PR created |
| `27-orchestrator-task-completion-b.png` | Same completion state, expanded agent items in left panel |
| `28-orchestrator-final-verification.png` | Final verification detail — code review results, test counts, acceptance criteria |

## Supporting UI

| File | Description |
|------|-------------|
| `29-codex-permission-dialog.png` | Codex permission prompt for `git add` with Always / Yes / No options |
