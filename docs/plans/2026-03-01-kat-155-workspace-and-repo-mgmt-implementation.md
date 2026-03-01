# KAT-155 Workspace and Repo Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver one-click workspace quick-create from known repos, `cmd+n` creation modal, and create-from PR/branch/issue flows on desktop, with required E2E coverage.

**Architecture:** Keep desktop layering consistent: UI (Workspaces + modal) -> Zustand store -> typed workspace service client -> Tauri command boundary. Replace global GitHub repo discovery with workspace-derived known repos, then add repo-scoped PR/branch/issue create pathways. Enforce existing workspace safety invariants and preserve immediate activate+navigate behavior after creation.

**Tech Stack:** React 18, React Router 6, Zustand, TypeScript, Tauri 2 (Rust), Vitest + Testing Library, Playwright/Vitest E2E harness, GitHub CLI (`gh`) for repo-scoped metadata.

**Execution Skills:** `@test-driven-development`, `@verification-before-completion`

---

### Task 1: Add Domain Contracts for Known Repo and Create-From Entities

**Files:**
- Modify: `apps/desktop/src/services/workspaces/types.ts`
- Modify: `tests/unit/desktop/workspace-memory-client.test.ts`

**Step 1: Write the failing test**

```ts
import type { WorkspaceKnownRepoOption, WorkspaceCreateFromSource } from '../../../apps/desktop/src/services/workspaces/types';

test('workspace service contracts include known repo and create-from source types', () => {
  const repo: WorkspaceKnownRepoOption = {
    id: 'kata-sh/kata-cloud-agents',
    nameWithOwner: 'kata-sh/kata-cloud-agents',
    url: 'https://github.com/kata-sh/kata-cloud-agents',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
  const source: WorkspaceCreateFromSource = { type: 'branch', value: 'feature/kat-155' };
  expect(repo.id).toContain('/');
  expect(source.type).toBe('branch');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-memory-client.test.ts`
Expected: FAIL with missing exported types.

**Step 3: Write minimal implementation**

```ts
export interface WorkspaceKnownRepoOption {
  id: string;
  nameWithOwner: string;
  url: string;
  updatedAt: string;
}

export type WorkspaceCreateFromSource =
  | { type: 'default'; value?: undefined }
  | { type: 'pull_request'; value: number }
  | { type: 'branch'; value: string }
  | { type: 'issue'; value: number };
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-memory-client.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/services/workspaces/types.ts tests/unit/desktop/workspace-memory-client.test.ts
git commit -m "feat(desktop): add workspace known-repo and create-from contracts"
```

### Task 2: Implement Known Repo Derivation and Create-From API in Memory Client

**Files:**
- Modify: `apps/desktop/src/services/workspaces/memory-client.ts`
- Modify: `tests/unit/desktop/workspace-memory-client.test.ts`

**Step 1: Write the failing test**

```ts
test('listKnownRepos returns deduped repos derived from existing workspaces only', async () => {
  const client = createMemoryWorkspaceClient({
    workspaces: [
      githubWorkspace('https://github.com/kata-sh/kata-cloud-agents', '2026-03-01T10:00:00.000Z'),
      githubWorkspace('https://github.com/kata-sh/kata-cloud-agents', '2026-03-01T09:00:00.000Z'),
    ],
  });
  const repos = await client.listKnownRepos();
  expect(repos).toHaveLength(1);
  expect(repos[0]?.nameWithOwner).toBe('kata-sh/kata-cloud-agents');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-memory-client.test.ts`
Expected: FAIL with `listKnownRepos` missing.

**Step 3: Write minimal implementation**

```ts
listKnownRepos: async () => {
  const map = new Map<string, WorkspaceKnownRepoOption>();
  for (const workspace of state.workspaces) {
    if (workspace.sourceType !== 'github') continue;
    const parsed = new URL(workspace.source);
    const key = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/i, '');
    const existing = map.get(key);
    if (!existing || workspace.updatedAt > existing.updatedAt) {
      map.set(key, {
        id: key,
        nameWithOwner: key,
        url: `https://github.com/${key}`,
        updatedAt: workspace.updatedAt,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
},
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-memory-client.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/services/workspaces/memory-client.ts tests/unit/desktop/workspace-memory-client.test.ts
git commit -m "feat(desktop): derive known repos from workspace history in memory client"
```

### Task 3: Add Store Actions for Quick Create and Create-From

**Files:**
- Modify: `apps/desktop/src/store/workspaces.ts`
- Modify: `tests/unit/desktop/workspaces-store.test.ts`

**Step 1: Write the failing test**

```ts
test('quickCreateFromRepo appends workspace and sets active id', async () => {
  const client = createMemoryWorkspaceClientWithKnownRepo();
  setWorkspaceClient(client);
  resetWorkspacesStore();
  await useWorkspacesStore.getState().quickCreateFromRepo('kata-sh/kata-cloud-agents');
  const state = useWorkspacesStore.getState();
  expect(state.activeWorkspaceId).toBeTruthy();
  expect(state.workspaces.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-store.test.ts`
Expected: FAIL with `quickCreateFromRepo` missing.

**Step 3: Write minimal implementation**

```ts
quickCreateFromRepo: (repoId) =>
  runCreate(() =>
    workspaceClient.createFromSource({
      repoId,
      source: { type: 'default' },
    }),
  ),
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/store/workspaces.ts tests/unit/desktop/workspaces-store.test.ts
git commit -m "feat(desktop): add quick-create and create-from store actions"
```

### Task 4: Add Tauri Client Methods for Known Repos and Create-From

**Files:**
- Modify: `apps/desktop/src/services/workspaces/tauri-client.ts`
- Modify: `tests/unit/desktop/workspace-tauri-client.test.ts`

**Step 1: Write the failing test**

```ts
test('invokes workspace_list_known_repos and workspace_create_from_source', async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === 'workspace_list_known_repos') return [];
    if (command === 'workspace_create_from_source') return sampleWorkspace;
    return null;
  });
  const client = createTauriWorkspaceClient(invoke);
  await client.listKnownRepos();
  await client.createFromSource({ repoId: 'kata-sh/kata-cloud-agents', source: { type: 'default' } });
  expect(invoke).toHaveBeenCalledWith('workspace_list_known_repos', { query: null });
  expect(invoke).toHaveBeenCalledWith('workspace_create_from_source', expect.anything());
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-tauri-client.test.ts`
Expected: FAIL with missing methods/commands.

**Step 3: Write minimal implementation**

```ts
listKnownRepos: async (query?: string) =>
  WorkspaceKnownRepoListSchema.parse(await invokeFn('workspace_list_known_repos', { query: query?.trim() || null })),
createFromSource: async (input) =>
  WorkspaceSchema.parse(await invokeFn('workspace_create_from_source', { input })),
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspace-tauri-client.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/services/workspaces/tauri-client.ts tests/unit/desktop/workspace-tauri-client.test.ts
git commit -m "feat(desktop): add tauri client create-from and known repo methods"
```

### Task 5: Implement Rust Store and Command Support for Known Repos

**Files:**
- Modify: `apps/desktop/src-tauri/src/workspaces/store.rs`
- Modify: `apps/desktop/src-tauri/src/workspaces/model.rs`
- Modify: `apps/desktop/src-tauri/src/workspaces/commands.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn list_known_repos_dedupes_github_sources() {
    let mut store = WorkspaceStore::new(tempdir().unwrap().path());
    store.insert(sample_github_workspace("https://github.com/kata-sh/kata-cloud-agents", "2026-03-01T10:00:00.000Z"));
    store.insert(sample_github_workspace("https://github.com/kata-sh/kata-cloud-agents", "2026-03-01T09:00:00.000Z"));
    let repos = store.list_known_repos(None);
    assert_eq!(repos.len(), 1);
    assert_eq!(repos[0].name_with_owner, "kata-sh/kata-cloud-agents");
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kata/desktop test`
Expected: FAIL with missing known repo model/method.

**Step 3: Write minimal implementation**

```rust
#[tauri::command]
pub fn workspace_list_known_repos(
    query: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<KnownRepoOption>, String> {
    let store = lock_store(&state)?;
    Ok(store.list_known_repos(query.as_deref()))
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kata/desktop test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/workspaces/store.rs apps/desktop/src-tauri/src/workspaces/model.rs apps/desktop/src-tauri/src/workspaces/commands.rs apps/desktop/src-tauri/src/main.rs
git commit -m "feat(desktop): expose workspace-derived known repo commands"
```

### Task 6: Implement Rust Create-From PR/Branch/Issue Command Paths

**Files:**
- Modify: `apps/desktop/src-tauri/src/workspaces/git_github.rs`
- Modify: `apps/desktop/src-tauri/src/workspaces/commands.rs`
- Modify: `apps/desktop/src-tauri/src/workspaces/model.rs`
- Modify: `apps/desktop/src-tauri/src/workspaces/git_github.rs` (tests)

**Step 1: Write the failing test**

```rust
#[test]
fn issue_source_derives_feature_branch_name() {
    let branch = derive_issue_branch_name(155, "Workspace and repo mgmt");
    assert_eq!(branch, "feature/kat-155-workspace-and-repo-mgmt");
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @kata/desktop test`
Expected: FAIL with missing create-from mappers.

**Step 3: Write minimal implementation**

```rust
pub fn create_workspace_from_source(input: CreateWorkspaceFromSourceInput, ...) -> Result<PreparedWorkspace, WorkspaceError> {
    match input.source {
        WorkspaceCreateSource::Default => create_github_workspace(...),
        WorkspaceCreateSource::PullRequest { number } => create_github_workspace(...with_pr_head_branch(number)...),
        WorkspaceCreateSource::Branch { name } => create_github_workspace(...with_branch(name)...),
        WorkspaceCreateSource::Issue { number, title } => create_github_workspace(...with_issue_branch(number, title)...),
    }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @kata/desktop test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/workspaces/git_github.rs apps/desktop/src-tauri/src/workspaces/commands.rs apps/desktop/src-tauri/src/workspaces/model.rs
git commit -m "feat(desktop): add create-from PR branch issue rust workflows"
```

### Task 7: Build CreateWorkspaceModal and Global Hotkey Integration

**Files:**
- Create: `apps/desktop/src/components/workspaces/CreateWorkspaceModal.tsx`
- Create: `apps/desktop/src/hooks/useCreateWorkspaceHotkey.ts`
- Modify: `apps/desktop/src/pages/Workspaces.tsx`
- Create: `tests/unit/desktop/workspaces-create-modal.test.tsx`
- Modify: `tests/unit/desktop/workspaces-page.test.tsx`

**Step 1: Write the failing test**

```tsx
test('cmd+n opens create workspace modal', async () => {
  render(<Workspaces />);
  fireEvent.keyDown(window, { key: 'n', metaKey: true });
  expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-create-modal.test.tsx tests/unit/desktop/workspaces-page.test.tsx`
Expected: FAIL with no modal/hotkey.

**Step 3: Write minimal implementation**

```tsx
useEffect(() => {
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      onOpenCreateModal();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [onOpenCreateModal]);
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-create-modal.test.tsx tests/unit/desktop/workspaces-page.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/components/workspaces/CreateWorkspaceModal.tsx apps/desktop/src/hooks/useCreateWorkspaceHotkey.ts apps/desktop/src/pages/Workspaces.tsx tests/unit/desktop/workspaces-create-modal.test.tsx tests/unit/desktop/workspaces-page.test.tsx
git commit -m "feat(desktop): add create workspace modal and cmd+n hotkey"
```

### Task 8: Implement Quick-Create List and Create-From Tab Workflows in UI

**Files:**
- Modify: `apps/desktop/src/pages/Workspaces.tsx`
- Modify: `tests/unit/desktop/workspaces-page.helpers.test.ts`
- Modify: `tests/unit/desktop/workspaces-page.test.tsx`
- Modify: `tests/unit/desktop/routes.test.ts`

**Step 1: Write the failing test**

```tsx
test('clicking known repo creates workspace immediately and navigates', async () => {
  const navigate = vi.fn();
  render(<Workspaces navigate={navigate} />);
  await user.click(screen.getByRole('button', { name: /kata-sh\/kata-cloud-agents/i }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-page.helpers.test.ts tests/unit/desktop/workspaces-page.test.tsx tests/unit/desktop/routes.test.ts`
Expected: FAIL with missing quick-create list + create-from wiring.

**Step 3: Write minimal implementation**

```tsx
<ul aria-label="Known repositories">
  {knownRepos.map((repo, index) => (
    <li key={repo.id}>
      <button type="button" onClick={() => void onQuickCreate(repo.id)}>
        {repo.nameWithOwner}
      </button>
      <button type="button" onClick={() => onOpenCreateFrom(repo.id)}>
        Create from...
      </button>
      <kbd>{index + 1}</kbd>
    </li>
  ))}
</ul>
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/desktop/workspaces-page.helpers.test.ts tests/unit/desktop/workspaces-page.test.tsx tests/unit/desktop/routes.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src/pages/Workspaces.tsx tests/unit/desktop/workspaces-page.helpers.test.ts tests/unit/desktop/workspaces-page.test.tsx tests/unit/desktop/routes.test.ts
git commit -m "feat(desktop): add repo quick-create and create-from UI workflows"
```

### Task 9: Add Required E2E Coverage for KAT-155

**Files:**
- Create: `tests/e2e/workspaces-create-from-flow.test.ts`
- Modify: `vitest.e2e.config.ts` (only if include pattern changes are needed)

**Step 1: Write the failing E2E tests**

```ts
// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Workspaces } from '../../apps/desktop/src/pages/Workspaces';

describe('KAT-155 workspace creation E2E', () => {
  test('cmd+n opens modal', async () => {
    render(<Workspaces />);
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.e2e.config.ts tests/e2e/workspaces-create-from-flow.test.ts`
Expected: FAIL before implementation is complete.

**Step 3: Complete E2E scenarios**

```ts
test('quick create from known repo activates and navigates', async () => { /* full flow */ });
test('create from PR path works', async () => { /* full flow */ });
test('create from Branch path works', async () => { /* full flow */ });
test('create from Issue path works', async () => { /* full flow */ });
test('create failure keeps modal open and shows error', async () => { /* full flow */ });
```

**Step 4: Run E2E suite to verify it passes**

Run: `pnpm test:e2e`
Expected: PASS for vitest E2E and Playwright suites.

**Step 5: Commit**

```bash
git add tests/e2e/workspaces-create-from-flow.test.ts vitest.e2e.config.ts
git commit -m "test(e2e): add KAT-155 workspace create flow coverage"
```

### Task 10: Final Verification and Evidence

**Files:**
- Modify: `docs/plans/2026-03-01-kat-155-workspace-and-repo-mgmt-design.md` (if acceptance evidence notes are appended)
- Create: `docs/plans/2026-03-01-kat-155-workspace-and-repo-mgmt-evidence.md` (optional, recommended)

**Step 1: Run full verification**

Run: `pnpm ci:checks`
Expected: PASS across lint/typecheck/unit/coverage/ui-drift.

**Step 2: Run targeted desktop and E2E verification**

Run:
```bash
pnpm exec vitest run tests/unit/desktop/workspaces-page.test.tsx tests/unit/desktop/workspaces-store.test.ts tests/unit/desktop/workspace-tauri-client.test.ts
pnpm test:e2e
```
Expected: PASS with KAT-155 flows covered.

**Step 3: Capture acceptance evidence**

```md
- cmd+n opens create modal
- known repos derived from existing workspace history
- repo row one-click create activates workspace and navigates
- create-from PR/branch/issue paths verified
- failure mode verified (modal stays open + actionable error)
```

**Step 4: Commit verification artifacts**

```bash
git add docs/plans/2026-03-01-kat-155-workspace-and-repo-mgmt-evidence.md
git commit -m "docs(kat-155): add verification evidence"
```

**Step 5: Prepare for ticket completion workflow**

Run: `gh pr create --fill` (after implementation commits are ready).
Expected: PR opened with test evidence linked for KAT-155 completion gate.
