// @vitest-environment jsdom
// biome-ignore lint/correctness/noUnusedImports: Required for JSX runtime in this test file.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { Workspaces } from '../../apps/desktop/src/pages/Workspaces';
import { createMemoryWorkspaceClient } from '../../apps/desktop/src/services/workspaces/memory-client';
import type { WorkspaceClient } from '../../apps/desktop/src/services/workspaces/types';
import { resetWorkspacesStore, setWorkspaceClient } from '../../apps/desktop/src/store/workspaces';

function githubWorkspace() {
  return {
    id: 'ws_seed',
    name: 'kata-cloud-agents',
    sourceType: 'github' as const,
    source: 'https://github.com/kata-sh/kata-cloud-agents',
    repoRootPath: '/tmp/repo',
    worktreePath: '/tmp/repo.worktrees/ws_seed',
    branch: 'workspace/kata-cloud-agents-seed',
    status: 'ready' as const,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
}

function renderWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/workspaces']}>
      <Routes>
        <Route path="/workspaces" element={<Workspaces />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('KAT-155 workspace create flows (E2E)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    setWorkspaceClient(
      createMemoryWorkspaceClient({
        workspaces: [githubWorkspace()],
      }),
    );
    resetWorkspacesStore();
  });

  test('cmd+n opens create workspace modal', async () => {
    renderWithRoutes();
    await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i });

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeTruthy();
  });

  test('clicking repo quick-creates workspace without auto-navigation', async () => {
    const user = userEvent.setup();
    renderWithRoutes();

    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(1);
    await user.click(await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i }));
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(2);
  });

  test('create from pull request creates workspace without auto-navigation', async () => {
    const user = userEvent.setup();
    renderWithRoutes();

    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(1);
    await user.click((await screen.findAllByRole('button', { name: /^create from\.\.\./i }))[0]!);
    await user.click(screen.getByRole('button', { name: /pull requests/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(2);
  });

  test('create from branch creates workspace without auto-navigation', async () => {
    const user = userEvent.setup();
    renderWithRoutes();

    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(1);
    await user.click((await screen.findAllByRole('button', { name: /^create from\.\.\./i }))[0]!);
    await user.click(screen.getByRole('button', { name: /branches/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
    expect((await screen.findAllByRole('button', { name: /archive/i })).length).toBe(2);
  });

  test('issues tab is visible but disabled', async () => {
    const user = userEvent.setup();
    renderWithRoutes();

    await user.click((await screen.findAllByRole('button', { name: /^create from\.\.\./i }))[0]!);
    const issuesButton = screen.getByRole('button', { name: /issues/i }) as HTMLButtonElement;
    expect(issuesButton.disabled).toBe(true);
    await user.click(issuesButton);
    expect(screen.queryByText(/no issues found/i)).toBeNull();
  });

  test('create failure keeps modal open and shows error', async () => {
    const createFromSource = vi.fn(async () => {
      throw new Error('create failed');
    });
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient({
        workspaces: [githubWorkspace()],
      }),
      createFromSource,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWithRoutes();

    await user.click((await screen.findAllByRole('button', { name: /^create from\.\.\./i }))[0]!);
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => {
      expect(createFromSource).toHaveBeenCalled();
    });
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((entry) => entry.textContent?.includes('create failed'))).toBe(true);
    expect(screen.getByRole('dialog', { name: /create workspace/i })).toBeTruthy();
  });

  test('workspace list rows are clickable and navigate to dashboard', async () => {
    const user = userEvent.setup();
    renderWithRoutes();

    await user.click(await screen.findByRole('button', { name: /open workspace kata-cloud-agents/i }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });
});
