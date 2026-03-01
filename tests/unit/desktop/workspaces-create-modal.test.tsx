// biome-ignore lint/correctness/noUnusedImports: Required for JSX runtime in this test file.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { CreateWorkspaceModal } from '../../../apps/desktop/src/components/workspaces/CreateWorkspaceModal';

function makeRepo(id: string) {
  return {
    id,
    nameWithOwner: id,
    url: `https://github.com/${id}`,
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
}

describe('CreateWorkspaceModal', () => {
  test('defaults to branches tab before pull requests', async () => {
    render(
      <CreateWorkspaceModal
        isOpen
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [{ name: 'main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    expect(await screen.findByRole('button', { name: /main \(default\)/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by branch name/i)).toBeInTheDocument();
  });

  test('creates from pull request and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreate = vi.fn(async () => {});
    const loadPullRequests = vi.fn(async () => [
      {
        number: 26,
        title: 'feat: test',
        headBranch: 'feature/test',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        number: 27,
        title: 'fix: another',
        headBranch: 'fix/another',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ]);

    render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={onCreate}
        loadPullRequests={loadPullRequests}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await user.click(screen.getByRole('button', { name: /pull requests/i }));
    expect(await screen.findByRole('button', { name: /#26 feat: test/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /#27 fix: another/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        repoId: 'kata-sh/kata-cloud-agents',
        source: { type: 'pull_request', value: 27 },
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(loadPullRequests).toHaveBeenCalledWith('kata-sh/kata-cloud-agents', '');
  });

  test('supports branch and issue flows when issues tab is enabled', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {});
    const onClose = vi.fn();
    const loadBranches = vi.fn(async (repoId: string) =>
      repoId.endsWith('repo-b')
        ? []
        : [
            {
              name: `${repoId}-main`,
              isDefault: true,
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
            {
              name: `${repoId}-feature`,
              isDefault: false,
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
          ],
    );
    const loadIssues = vi.fn(async (_repoId: string, query?: string) => {
      if (!query?.trim()) {
        return [];
      }
      return [
        { number: 155, title: 'Workspace and repo mgmt', updatedAt: '2026-03-01T00:00:00.000Z' },
        { number: 156, title: 'Follow-up task', updatedAt: '2026-03-01T00:00:00.000Z' },
      ];
    });

    render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        initialRepoId="kata-sh/repo-b"
        repos={[makeRepo('kata-sh/repo-a'), makeRepo('kata-sh/repo-b')]}
        onClose={onClose}
        onCreate={onCreate}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={loadBranches}
        loadIssues={loadIssues}
      />,
    );

    const repoSelect = screen.getByRole('combobox');
    expect(repoSelect).toHaveValue('kata-sh/repo-b');
    await user.click(screen.getByRole('button', { name: /branches/i }));
    expect(await screen.findByText(/no branches found/i)).toBeInTheDocument();
    await user.selectOptions(repoSelect, 'kata-sh/repo-a');
    expect(await screen.findByRole('button', { name: /kata-sh\/repo-a-main/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /kata-sh\/repo-a-feature/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        repoId: 'kata-sh/repo-a',
        source: { type: 'branch', value: 'kata-sh/repo-a-feature' },
      });
    });

    await user.click(screen.getByRole('button', { name: /issues/i }));
    expect(await screen.findByText(/no issues found/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/search by issue number, title/i), '155');
    expect(
      await screen.findByRole('button', { name: /#155 Workspace and repo mgmt/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /#155 Workspace and repo mgmt/i }));
    await user.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        repoId: 'kata-sh/repo-a',
        source: { type: 'issue', value: 155 },
      });
    });

    await user.click(screen.getByRole('button', { name: /pull requests/i }));
    expect(screen.getByPlaceholderText(/search by title, number/i)).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  test('renders load and create errors', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { rerender } = render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => {
          throw 'load failed';
        })}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await user.click(screen.getByRole('button', { name: /pull requests/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load options');

    rerender(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={vi.fn(async () => {
          throw new Error('create failed');
        })}
        loadPullRequests={vi.fn(async () => [
          {
            number: 1,
            title: 'test',
            headBranch: 'feature/test',
            updatedAt: '2026-03-01T00:00:00.000Z',
          },
        ])}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await user.click(screen.getByRole('button', { name: /pull requests/i }));
    expect(await screen.findByRole('button', { name: /#1 test/i })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /create workspace/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('create failed');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('returns null when closed and disables create with no repositories', async () => {
    const onCreate = vi.fn(async () => {});
    const onClose = vi.fn();
    const { rerender } = render(
      <CreateWorkspaceModal
        isOpen={false}
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={onCreate}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );
    expect(screen.queryByRole('dialog', { name: /create workspace/i })).not.toBeInTheDocument();

    rerender(
      <CreateWorkspaceModal
        isOpen
        repos={[]}
        onClose={onClose}
        onCreate={onCreate}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    expect(await screen.findByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    const createButton = screen.getByRole('button', { name: /create workspace/i });
    const issuesButton = screen.getByRole('button', { name: /issues/i });
    expect(issuesButton).toBeDisabled();
    expect(createButton).toBeDisabled();
    expect(screen.getByPlaceholderText(/search by branch name/i)).toBeInTheDocument();
    createButton.removeAttribute('disabled');
    await userEvent.setup().click(createButton);
    expect(onCreate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('disables create while source options are loading for a new repo selection', async () => {
    const user = userEvent.setup();
    let resolveSecondLoad: ((value: { name: string; isDefault: boolean; updatedAt: string }[]) => void) | null =
      null;
    const loadBranches = vi.fn(async (repoId: string) => {
      if (repoId === 'kata-sh/repo-a') {
        return [{ name: 'repo-a-main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }];
      }
      return new Promise<{ name: string; isDefault: boolean; updatedAt: string }[]>((resolve) => {
        resolveSecondLoad = resolve;
      });
    });

    render(
      <CreateWorkspaceModal
        isOpen
        repos={[makeRepo('kata-sh/repo-a'), makeRepo('kata-sh/repo-b')]}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={loadBranches}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await screen.findByRole('button', { name: /repo-a-main/i });
    const createButton = screen.getByRole('button', { name: /create workspace/i });
    expect(createButton).toBeEnabled();

    await user.selectOptions(screen.getByRole('combobox'), 'kata-sh/repo-b');
    await waitFor(() => {
      expect(createButton).toBeDisabled();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    resolveSecondLoad?.([{ name: 'repo-b-main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }]);
    await screen.findByRole('button', { name: /repo-b-main/i });
    expect(createButton).toBeEnabled();
  });

  test('resets to branches tab when issues tab is disabled while on issues', async () => {
    const user = userEvent.setup();
    const loadBranches = vi.fn(async () => [
      { name: 'main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' },
    ]);

    const { rerender } = render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={loadBranches}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await user.click(screen.getByRole('button', { name: /issues/i }));
    expect(screen.getByPlaceholderText(/search by issue number, title/i)).toBeInTheDocument();

    rerender(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab={false}
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={vi.fn()}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={loadBranches}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by branch name/i)).toBeInTheDocument();
    });
  });

  test('closes on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <CreateWorkspaceModal
        isOpen
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [{ name: 'main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    expect(screen.getByRole('dialog', { name: /create workspace/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not close when no source tab condition matches', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreate = vi.fn(async () => {});

    render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab={false}
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={onCreate}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no branches found/i)).toBeInTheDocument();
    });

    const createButton = screen.getByRole('button', { name: /create workspace/i });
    createButton.removeAttribute('disabled');
    await user.click(createButton);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('closes on backdrop click but not on dialog body click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <CreateWorkspaceModal
        isOpen
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={vi.fn(async () => [{ name: 'main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }])}
        loadIssues={vi.fn(async () => [])}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /create workspace/i });
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = dialog.parentElement!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('cancels stale branch and issue loads when switching tabs/unmounting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveBranches: ((value: { name: string; isDefault: boolean; updatedAt: string }[]) => void) | null =
      null;
    let resolveIssues: ((value: { number: number; title: string; updatedAt: string }[]) => void) | null = null;
    const loadBranches = vi.fn(
      () =>
        new Promise<{ name: string; isDefault: boolean; updatedAt: string }[]>((resolve) => {
          resolveBranches = resolve;
        }),
    );
    const loadIssues = vi.fn(
      () =>
        new Promise<{ number: number; title: string; updatedAt: string }[]>((resolve) => {
          resolveIssues = resolve;
        }),
    );

    const { unmount } = render(
      <CreateWorkspaceModal
        isOpen
        enableIssuesTab
        repos={[makeRepo('kata-sh/kata-cloud-agents')]}
        onClose={onClose}
        onCreate={vi.fn(async () => {})}
        loadPullRequests={vi.fn(async () => [])}
        loadBranches={loadBranches}
        loadIssues={loadIssues}
      />,
    );

    await user.click(screen.getByRole('button', { name: /branches/i }));
    await user.click(screen.getByRole('button', { name: /issues/i }));
    resolveBranches?.([{ name: 'main', isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z' }]);

    unmount();
    resolveIssues?.([{ number: 155, title: 'issue', updatedAt: '2026-03-01T00:00:00.000Z' }]);
    await waitFor(() => {
      expect(loadBranches).toHaveBeenCalled();
      expect(loadIssues).toHaveBeenCalled();
    });
  });
});
