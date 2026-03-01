// biome-ignore lint/correctness/noUnusedImports: Required for JSX runtime in this test file.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { Workspaces } from '../../../apps/desktop/src/pages/Workspaces';
import { createMemoryWorkspaceClient } from '../../../apps/desktop/src/services/workspaces/memory-client';
import { pickDirectory } from '../../../apps/desktop/src/services/system/dialog';
import {
  resetWorkspacesStore,
  setWorkspaceClient,
  useWorkspacesStore,
} from '../../../apps/desktop/src/store/workspaces';
import type {
  GitHubRepoOption,
  WorkspaceClient,
} from '../../../apps/desktop/src/services/workspaces/types';

vi.mock('../../../apps/desktop/src/services/system/dialog', () => ({
  pickDirectory: vi.fn(),
}));

const pickDirectoryMock = vi.mocked(pickDirectory);

describe('Workspaces page', () => {
  function seededGithubWorkspace() {
    return {
      id: 'ws_seed',
      name: 'Seed Workspace',
      sourceType: 'github' as const,
      source: 'https://github.com/kata-sh/kata-cloud-agents',
      repoRootPath: '/tmp/repo',
      worktreePath: '/tmp/repo.worktrees/ws_seed',
      branch: 'workspace/seed',
      status: 'ready' as const,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
  }

  function renderWorkspaces() {
    return render(
      <MemoryRouter>
        <Workspaces />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    pickDirectoryMock.mockReset();
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    setWorkspaceClient(createMemoryWorkspaceClient());
    resetWorkspacesStore();
  });

  test('renders three add repository actions', async () => {
    renderWorkspaces();

    expect(screen.getByRole('button', { name: /local repo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clone remote/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new/i })).toBeInTheDocument();
    expect(await screen.findByText(/no workspaces yet/i)).toBeInTheDocument();
  });

  test('supports local repo creation from local action', async () => {
    const user = userEvent.setup();
    pickDirectoryMock.mockResolvedValueOnce('/tmp/repo');
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /local repo/i }));

    expect(await screen.findByText(/^repo$/i)).toBeInTheDocument();
  });

  test('handles local repo picker cancel and error', async () => {
    const user = userEvent.setup();
    pickDirectoryMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('picker failed'));
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /local repo/i }));
    expect(screen.getByText(/no workspaces yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /local repo/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('picker failed');
  });

  test('supports remote clone action', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await user.type(
      screen.getByLabelText(/github repository url/i),
      'https://github.com/org/repo',
    );
    const cloneUrlInput = screen.getByLabelText(/github repository url/i);
    const cloneForm = cloneUrlInput.closest('form');
    if (!cloneForm) {
      throw new Error('clone form not found');
    }
    await user.clear(screen.getByLabelText(/repo location/i));
    await user.type(screen.getByLabelText(/repo location/i), '/tmp/repos');
    await user.click(within(cloneForm).getByRole('button', { name: /add cloned repo/i }));

    expect(await screen.findByText(/^repo$/i)).toBeInTheDocument();
  });

  test('validates clone action required fields', async () => {
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      listGitHubRepos: async () => [],
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    const cloneUrlInput = screen.getByLabelText(/github repository url/i);
    const cloneForm = cloneUrlInput.closest('form');
    if (!cloneForm) {
      throw new Error('clone form not found');
    }

    fireEvent.submit(cloneForm);
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub repository URL is required.');
  });

  test('validates clone action github url', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await user.type(
      screen.getByLabelText(/github repository url/i),
      'https://gitlab.com/org/repo',
    );
    const cloneUrlInput = screen.getByLabelText(/github repository url/i);
    const cloneForm = cloneUrlInput.closest('form');
    if (!cloneForm) {
      throw new Error('clone form not found');
    }
    await user.click(within(cloneForm).getByRole('button', { name: /add cloned repo/i }));

    expect(
      await screen.findByText(/github.com repositories are supported/i),
    ).toBeInTheDocument();
  });

  test('supports create new repository action', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /create new/i }));
    await user.type(screen.getByLabelText(/repository name/i), 'kat-154-created');
    await user.clear(screen.getByLabelText(/repo location/i));
    await user.type(screen.getByLabelText(/repo location/i), '/tmp/repos');
    await user.click(screen.getByRole('button', { name: /create new repo/i }));

    expect(await screen.findByText(/^kat-154-created$/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /view repository/i })).toHaveAttribute(
      'href',
      'https://github.com/me/kat-154-created',
    );
  });

  test('validates create new repository required fields and failure path', async () => {
    const createNewGitHub = vi.fn(async () => {
      throw new Error('failed to create repository');
    });
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      createNewGitHub,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /create new/i }));
    await user.click(screen.getByRole('button', { name: /create new repo/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Repository name is required.');

    await user.type(screen.getByLabelText(/repository name/i), 'kat-154-created');
    await user.clear(screen.getByLabelText(/repo location/i));
    await user.type(screen.getByLabelText(/repo location/i), '/tmp/repos');

    await user.click(screen.getByRole('button', { name: /create new repo/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('failed to create repository');
    expect(createNewGitHub).toHaveBeenCalledTimes(1);
  });

  test('supports archive and remove on existing list', async () => {
    const user = userEvent.setup();
    pickDirectoryMock.mockResolvedValueOnce('/tmp/kat-154-actions');
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /local repo/i }));
    expect(await screen.findByText(/^kat-154-actions$/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /archive/i }));
    expect(await screen.findByText(/archived/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByText(/^kat-154-actions$/i)).not.toBeInTheDocument();
  });

  test('shows progress indicator in github url field while loading repos', async () => {
    let resolveRepos: ((value: unknown) => void) | null = null;
    const listGitHubRepos = vi.fn(
      async () =>
        new Promise((resolve) => {
          resolveRepos = resolve;
        }),
    );
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      listGitHubRepos,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();
    await user.click(screen.getByRole('button', { name: /clone remote/i }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    resolveRepos?.([
      {
        nameWithOwner: 'org/repo',
        url: 'https://github.com/org/repo',
        isPrivate: true,
        updatedAt: '2026-02-28T00:00:00.000Z',
      },
    ]);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  test('shows github repo loading error', async () => {
    const listGitHubRepos = vi.fn(async () => {
      throw new Error('gh auth required');
    });
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      listGitHubRepos,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();
    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    expect(await screen.findByText(/gh auth required/i)).toBeInTheDocument();
  });

  test('handles async cancellation when unmounting during github repo load', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      let resolveRepos: ((value: GitHubRepoOption[]) => void) | null = null;
      const listGitHubRepos = vi.fn(
        async () =>
          new Promise<GitHubRepoOption[]>((resolve) => {
            resolveRepos = resolve;
          }),
      );
      const client: WorkspaceClient = {
        ...createMemoryWorkspaceClient(),
        listGitHubRepos,
      };
      setWorkspaceClient(client);
      resetWorkspacesStore();

      const user = userEvent.setup();
      const { unmount } = renderWorkspaces();
      await user.click(screen.getByRole('button', { name: /clone remote/i }));
      await waitFor(() => {
        expect(listGitHubRepos).toHaveBeenCalledTimes(1);
      });
      unmount();
      resolveRepos?.([]);
      await waitFor(() => {
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('loads github repos once and uses local debounced filtering', async () => {
    const listGitHubRepos = vi.fn(async () => [
      {
        nameWithOwner: 'org/repo-one',
        url: 'https://github.com/org/repo-one',
        isPrivate: true,
        updatedAt: '2026-02-28T00:00:00.000Z',
      },
      {
        nameWithOwner: 'org/repo-two',
        url: 'https://github.com/org/repo-two',
        isPrivate: false,
        updatedAt: '2026-02-27T00:00:00.000Z',
      },
    ]);
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      listGitHubRepos,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();
    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await waitFor(() => {
      expect(listGitHubRepos).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: /org\/repo-one/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /org\/repo-two/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/github repository url/i), 'repo-two');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /org\/repo-two/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /org\/repo-one/i })).not.toBeInTheDocument();
    });
    expect(listGitHubRepos).toHaveBeenCalledTimes(1);
  });

  test('supports selecting a suggested repository URL', async () => {
    const listGitHubRepos = vi.fn(async () => [
      {
        nameWithOwner: 'org/repo-two',
        url: 'https://github.com/org/repo-two',
        isPrivate: false,
        updatedAt: '2026-02-27T00:00:00.000Z',
      },
    ]);
    const client: WorkspaceClient = {
      ...createMemoryWorkspaceClient(),
      listGitHubRepos,
    };
    setWorkspaceClient(client);
    resetWorkspacesStore();

    const user = userEvent.setup();
    renderWorkspaces();
    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /org\/repo-two/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /org\/repo-two/i }));
    expect(screen.getByLabelText(/github repository url/i)).toHaveValue(
      'https://github.com/org/repo-two',
    );
  });

  test('supports clone location browse in clone and create flows', async () => {
    const user = userEvent.setup();
    pickDirectoryMock
      .mockResolvedValueOnce('/tmp/clone-picked')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('browse failed'))
      .mockResolvedValueOnce('/tmp/create-picked');
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await user.click(screen.getByRole('button', { name: /^browse$/i }));
    expect(screen.getByLabelText(/repo location/i)).toHaveValue('/tmp/clone-picked');

    await user.click(screen.getByRole('button', { name: /^browse$/i }));
    expect(screen.getByLabelText(/repo location/i)).toHaveValue('/tmp/clone-picked');

    await user.click(screen.getByRole('button', { name: /^browse$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('browse failed');

    await user.click(screen.getByRole('button', { name: /create new/i }));
    await user.click(screen.getByRole('button', { name: /^browse$/i }));
    expect(screen.getByLabelText(/repo location/i)).toHaveValue('/tmp/create-picked');
  });

  test('catches unexpected errors from clone store action', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    useWorkspacesStore.setState({
      createGitHub: async () => {
        throw new Error('unexpected clone error');
      },
    });

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await user.type(
      screen.getByLabelText(/github repository url/i),
      'https://github.com/org/repo',
    );
    await user.clear(screen.getByLabelText(/repo location/i));
    await user.type(screen.getByLabelText(/repo location/i), '/tmp/repos');
    const cloneUrlInput = screen.getByLabelText(/github repository url/i);
    const cloneForm = cloneUrlInput.closest('form');
    if (!cloneForm) {
      throw new Error('clone form not found');
    }
    await user.click(within(cloneForm).getByRole('button', { name: /add cloned repo/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected clone error');
  });

  test('catches unexpected errors from create-new store action', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    useWorkspacesStore.setState({
      createNewGitHub: async () => {
        throw new Error('unexpected create error');
      },
    });

    await user.click(screen.getByRole('button', { name: /create new/i }));
    await user.type(screen.getByLabelText(/repository name/i), 'kat-154-created');
    await user.clear(screen.getByLabelText(/repo location/i));
    await user.type(screen.getByLabelText(/repo location/i), '/tmp/repos');
    await user.click(screen.getByRole('button', { name: /create new repo/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('unexpected create error');
  });

  test('uses a default clone location derived from home directory', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    await waitFor(() => {
      const value = screen.getByLabelText(/repo location/i).getAttribute('value') ?? '';
      expect(value).toMatch(/\/kata\/repos$/);
      expect(value.length).toBeGreaterThan('/kata/repos'.length);
    });
  });

  test('clears form error when switching actions', async () => {
    const user = userEvent.setup();
    renderWorkspaces();

    await user.click(screen.getByRole('button', { name: /clone remote/i }));
    const cloneUrlInput = screen.getByLabelText(/github repository url/i);
    const cloneForm = cloneUrlInput.closest('form');
    if (!cloneForm) {
      throw new Error('clone form not found');
    }
    fireEvent.submit(cloneForm);
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub repository URL is required.');

    await user.click(screen.getByRole('button', { name: /create new/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('quick create from known repo creates workspace and handles failure', async () => {
    const user = userEvent.setup();
    const successClient = createMemoryWorkspaceClient({
      workspaces: [seededGithubWorkspace()],
    });
    setWorkspaceClient(successClient);
    resetWorkspacesStore();

    const first = renderWorkspaces();
    const repoButton = await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i });
    await user.click(repoButton);
    expect(await screen.findByText(/^kata-cloud-agents$/i)).toBeInTheDocument();
    first.unmount();

    const failureClient: WorkspaceClient = {
      ...createMemoryWorkspaceClient({ workspaces: [seededGithubWorkspace()] }),
      createFromSource: async () => {
        throw new Error('quick create failed');
      },
    };
    setWorkspaceClient(failureClient);
    resetWorkspacesStore();

    renderWorkspaces();
    await user.click(await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('quick create failed');
  });

  test('create from known repo row opens modal and creates from selected source', async () => {
    const user = userEvent.setup();
    setWorkspaceClient(
      createMemoryWorkspaceClient({
        workspaces: [seededGithubWorkspace()],
      }),
    );
    resetWorkspacesStore();
    renderWorkspaces();

    const repoButton = await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i });
    const repoRow = repoButton.closest('li');
    if (!repoRow) {
      throw new Error('expected known repo row');
    }
    await user.click(within(repoRow).getByRole('button', { name: /^create from\.\.\./i }));

    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /branches/i }));
    await user.click(await screen.findByRole('button', { name: /feature\/kata-cloud-agents-next/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    expect(await screen.findByText(/^kata-cloud-agents$/i)).toBeInTheDocument();
  });

  test('create from modal shows error and stays open on failure', async () => {
    const user = userEvent.setup();
    const failureClient: WorkspaceClient = {
      ...createMemoryWorkspaceClient({ workspaces: [seededGithubWorkspace()] }),
      createFromSource: async () => {
        throw new Error('create from failed');
      },
    };
    setWorkspaceClient(failureClient);
    resetWorkspacesStore();
    renderWorkspaces();

    const repoButton = await screen.findByRole('button', { name: /kata-sh\/kata-cloud-agents/i });
    const repoRow = repoButton.closest('li');
    if (!repoRow) {
      throw new Error('expected known repo row');
    }
    await user.click(within(repoRow).getByRole('button', { name: /^create from\.\.\./i }));

    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /branches/i }));
    await user.click(await screen.findByRole('button', { name: /feature\/kata-cloud-agents-next/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.includes('create from failed'))).toBe(true);
    expect(screen.getByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
  });

  test('opens create-from modal from top affordance and cmd/ctrl+n hotkey', async () => {
    const user = userEvent.setup();
    setWorkspaceClient(
      createMemoryWorkspaceClient({
        workspaces: [seededGithubWorkspace()],
      }),
    );
    resetWorkspacesStore();
    renderWorkspaces();

    await user.click(await screen.findByRole('button', { name: /create from\.\.\./i }));
    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog', { name: /create workspace/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'x', metaKey: true });
    expect(screen.queryByRole('dialog', { name: /create workspace/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
  });

  test('workspace list row activates workspace when clicked', async () => {
    const user = userEvent.setup();
    setWorkspaceClient(
      createMemoryWorkspaceClient({
        workspaces: [seededGithubWorkspace()],
      }),
    );
    resetWorkspacesStore();
    renderWorkspaces();

    await user.click(await screen.findByRole('button', { name: /open workspace seed workspace/i }));
    await waitFor(() => {
      expect(useWorkspacesStore.getState().activeWorkspaceId).toBe('ws_seed');
    });
  });
});
