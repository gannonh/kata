# KAT-155 Design: Workspace and Repo Management

## Summary

Add a fast, keyboard-first workspace creation experience on the desktop Workspaces surface:

- show a list of available repos derived from existing workspaces
- one-click quick create from a repo using defaults
- support `cmd+n` to open workspace creation
- add a `Create from...` affordance to create from PR, branch, or issue
- activate and navigate into the new workspace immediately after creation

This design intentionally builds on KAT-154 workspace foundations and reuses existing create/activate flows where possible.

## Context

- Issue: `KAT-155` (status moved to `In Progress` on 2026-03-01).
- Branch: `feature/kat-155-workspace-and-repo-mgmt`.
- Desktop-first scope per project guidance.
- Current implementation already has:
  - `Workspaces` page with Local/Clone/Create-New actions
  - workspace store (`apps/desktop/src/store/workspaces.ts`)
  - Tauri commands for list/create/set-active/archive/delete
  - GitHub repo suggestions via `gh repo list --source` (global discovery)
- Mock screenshots show:
  - compact repo list with numeric shortcuts
  - bottom-row `Create from...` action with `⌘N`
  - tabbed chooser for Pull requests, Branches, Issues
  - repository scoping control in chooser

## Requirements (Issue Source)

- create new workspaces easily from existing repos
- available repos must be derived from existing workspaces (not all GitHub/local repos)
- one click should create workspace with defaults and navigate to main workspace view
- `cmd+n` opens creation modal/surface
- `Create from` should allow workspace creation from branch, PR, or GitHub issue

## Goals

- reduce workspace creation to one-click for common path
- keep advanced create-from flows in one reusable modal
- preserve safety invariants from KAT-154 (isolated worktree, non-main workspace branch)
- provide testable behavior with explicit E2E coverage

## Non-Goals

- no expansion of web app parity work
- no generalized support for non-GitHub providers
- no redesign of entire navigation IA
- no agent-internal worktree visualization

## Approaches Considered

### Option A: Extend Workspaces page inline

Add list and create-from tabs directly into `Workspaces.tsx`.

- Pros: quickest path to ship.
- Cons: shortcut integration and cross-entry-point consistency become brittle.

### Option B: Shared create modal + contextual triggers (recommended)

Introduce a reusable `CreateWorkspaceModal` opened from `cmd+n`, Workspaces CTA, and per-repo `Create from...`.

- Pros: matches mocks; clean one-click path + advanced path in one component; easier to test.
- Cons: slightly more upfront state orchestration.

### Option C: Full-page wizard route

Build `/workspaces/new` route for all creation paths.

- Pros: straightforward state handling.
- Cons: slows quick-create flow and is less keyboard-efficient.

## Decision

Choose **Option B**.

Use a shared modal for advanced creation and keyboard entry, while keeping direct repo-row click as the immediate quick-create path.

## UX Contract

### Quick Create

1. User opens Workspaces.
2. User clicks repo row in known repo list.
3. App creates workspace from defaults.
4. App sets new workspace active and navigates to main workspace view.

### Create From

1. User opens modal from `Create from...` (or `cmd+n`).
2. User selects repo (or uses preselected repo from context).
3. User picks tab: `Pull requests`, `Branches`, or `Issues`.
4. User selects item and clicks create.
5. App creates workspace, activates it, and navigates to main view.

### Keyboard

- `cmd+n` (and `ctrl+n` fallback in non-mac renderer contexts) opens `CreateWorkspaceModal`.
- If modal is already open, shortcut is a no-op.

## Architecture

### Frontend

- `apps/desktop/src/pages/Workspaces.tsx`
  - render known repo quick-create list
  - wire row click to quick-create flow
  - add per-repo `Create from...` affordance
- `apps/desktop/src/components/workspaces/CreateWorkspaceModal.tsx` (new)
  - tabs for PR/Branch/Issue
  - search + selection + create action
- `apps/desktop/src/store/workspaces.ts`
  - add actions/selectors for quick-create and create-from flows
- `apps/desktop/src/services/workspaces/types.ts`
  - add typed options and request payloads for PR/Branch/Issue workflows
- `apps/desktop/src/services/workspaces/tauri-client.ts`
  - add new invoke contracts for known-repo and create-from commands
- `apps/desktop/src/services/workspaces/memory-client.ts`
  - mirror new service methods for deterministic tests

### Tauri / Rust

- `apps/desktop/src-tauri/src/workspaces/store.rs`
  - derive known repos from persisted workspaces
- `apps/desktop/src-tauri/src/workspaces/commands.rs`
  - add commands:
    - list known repos (workspace-derived)
    - list repo pull requests
    - list repo branches
    - list repo issues
    - create workspace from repo default
    - create workspace from selected PR/branch/issue
- `apps/desktop/src-tauri/src/workspaces/git_github.rs`
  - add `gh` queries scoped to selected repo for PR/branch/issue lookup
  - map selected item to branch/base for workspace creation
- `apps/desktop/src-tauri/src/workspaces/model.rs`
  - add DTOs for repo/pr/branch/issue options and create-from inputs
- `apps/desktop/src-tauri/src/main.rs`
  - register new commands in invoke handler

## Data and Behavior Rules

- known repos are derived from existing workspaces only
- dedupe by canonical repo identity (e.g., `owner/repo` for GitHub)
- quick-create defaults:
  - workspace name derived from repo name with uniqueness suffix
  - branch derived by existing workspace branch helper
  - base ref is default branch (or `main` fallback)
- create-from mappings:
  - PR: use PR head branch as source
  - Branch: use selected branch as source
  - Issue: generate feature branch from issue number/title
- all success paths end with:
  - workspace persisted
  - active workspace set
  - navigation to main workspace view

## Error Handling

- load failures in modal tabs show inline retryable errors
- create failures keep modal open and preserve context
- empty-state messaging for:
  - no known repos
  - no PRs/branches/issues for selected repo
- stale repo references are filtered or marked unavailable

## Testing Strategy

### Unit / Component / Store

- helper tests for repo dedupe, sorting, and naming defaults
- modal behavior tests (tab switching, selection, submit states)
- store action tests for quick-create and create-from success/failure
- tauri-client + memory-client tests for new method contracts

### Rust

- command tests for known repo derivation
- mapping tests for PR/branch/issue create inputs
- validation tests for unsupported/invalid repo states

### E2E (Required)

Add blocking E2E coverage for:

1. `cmd+n` opens creation modal
2. repo list derives only from existing workspace repos
3. repo row click performs immediate default create + activation + navigation
4. `Create from...` PR path creates from selected PR branch
5. `Create from...` Branch path creates from selected branch
6. `Create from...` Issue path creates issue-derived branch
7. create failure path preserves modal and shows actionable error

E2E tests are part of completion criteria for KAT-155.

## Acceptance Criteria

- one-click quick-create from known repo is functional
- `cmd+n` opens create modal
- create-from PR/branch/issue workflows are functional
- available repo list is strictly workspace-derived
- new workspace activation + navigation occurs on successful create
- required E2E tests are implemented and passing
