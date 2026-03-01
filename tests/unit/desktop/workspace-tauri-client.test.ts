import { describe, expect, test, vi } from 'vitest';

import { createTauriWorkspaceClient } from '../../../apps/desktop/src/services/workspaces/tauri-client';

describe('tauri workspace client', () => {
  function sampleWorkspace() {
    return {
      id: 'ws_1',
      name: 'KAT-154',
      sourceType: 'local',
      source: '/tmp/repo',
      repoRootPath: '/tmp/repo',
      worktreePath: '/tmp/repo.worktrees/kat-154',
      branch: 'workspace/kat-154-ws1',
      baseRef: null,
      status: 'ready',
      createdAt: '2026-02-28T00:00:00.000Z',
      updatedAt: '2026-02-28T00:00:00.000Z',
      lastOpenedAt: null,
    };
  }

  test('maps list command response', async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValueOnce([sampleWorkspace()])
      .mockResolvedValueOnce([
        {
          id: 'org/repo',
          nameWithOwner: 'org/repo',
          url: 'https://github.com/org/repo',
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'main',
          isDefault: true,
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          number: 26,
          title: 'test',
          headBranch: 'feature/test',
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          number: 155,
          title: 'issue',
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          nameWithOwner: 'org/repo',
          url: 'https://github.com/org/repo',
          isPrivate: true,
          updatedAt: '2026-02-28T00:00:00.000Z',
        },
      ]);

    const client = createTauriWorkspaceClient(mockInvoke);
    const list = await client.list();
    const knownRepos = await client.listKnownRepos('repo');
    const branches = await client.listRepoBranches('org/repo', 'main');
    const pullRequests = await client.listRepoPullRequests('org/repo', '26');
    const issues = await client.listRepoIssues('org/repo', '155');
    const repos = await client.listGitHubRepos('repo');

    expect(mockInvoke).toHaveBeenCalledWith('workspace_list');
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_known_repos', {
      query: 'repo',
    });
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_repo_branches', {
      repoId: 'org/repo',
      query: 'main',
    });
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_repo_pull_requests', {
      repoId: 'org/repo',
      query: '26',
    });
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_repo_issues', {
      repoId: 'org/repo',
      query: '155',
    });
    expect(mockInvoke).toHaveBeenCalledWith('workspace_list_github_repos', {
      query: 'repo',
    });
    expect(list[0]?.name).toBe('KAT-154');
    expect(knownRepos[0]?.nameWithOwner).toBe('org/repo');
    expect(branches[0]?.name).toBe('main');
    expect(pullRequests[0]?.number).toBe(26);
    expect(issues[0]?.number).toBe(155);
    expect(repos[0]?.nameWithOwner).toBe('org/repo');
  });

  test('passes null query for optional filters when omitted', async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = createTauriWorkspaceClient(mockInvoke);

    await client.listKnownRepos();
    await client.listRepoBranches('org/repo');
    await client.listRepoPullRequests('org/repo');
    await client.listRepoIssues('org/repo');
    await client.listGitHubRepos();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'workspace_list_known_repos', { query: null });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'workspace_list_repo_branches', {
      repoId: 'org/repo',
      query: null,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'workspace_list_repo_pull_requests', {
      repoId: 'org/repo',
      query: null,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'workspace_list_repo_issues', {
      repoId: 'org/repo',
      query: null,
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(5, 'workspace_list_github_repos', { query: null });
  });

  test('maps create and lifecycle commands', async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValueOnce(sampleWorkspace())
      .mockResolvedValueOnce(sampleWorkspace())
      .mockResolvedValueOnce(sampleWorkspace())
      .mockResolvedValueOnce(sampleWorkspace())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('ws_1')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const client = createTauriWorkspaceClient(mockInvoke);
    const local = await client.createLocal({
      repoPath: '/tmp/repo',
      workspaceName: 'KAT-154',
    });
    const remote = await client.createGitHub({
      repoUrl: 'https://github.com/org/repo',
      workspaceName: 'KAT-154 GH',
    });
    const created = await client.createNewGitHub({
      repositoryName: 'kat-154-created',
      workspaceName: 'KAT-154 Created',
      cloneRootPath: '/tmp/repos',
    });
    const fromSource = await client.createFromSource({
      repoId: 'org/repo',
      source: { type: 'default' },
    });
    await client.setActive('ws_1');
    const activeId = await client.getActiveId();
    await client.archive('ws_1');
    await client.remove('ws_1', true);

    expect(local.id).toBe('ws_1');
    expect(remote.id).toBe('ws_1');
    expect(created.id).toBe('ws_1');
    expect(fromSource.id).toBe('ws_1');
    expect(activeId).toBe('ws_1');
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'workspace_create_local', {
      input: { repoPath: '/tmp/repo', workspaceName: 'KAT-154' },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'workspace_create_github', {
      input: { repoUrl: 'https://github.com/org/repo', workspaceName: 'KAT-154 GH' },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'workspace_create_new_github', {
      input: {
        repositoryName: 'kat-154-created',
        workspaceName: 'KAT-154 Created',
        cloneRootPath: '/tmp/repos',
      },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, 'workspace_create_from_source', {
      input: {
        repoId: 'org/repo',
        source: { type: 'default' },
      },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(5, 'workspace_set_active', { id: 'ws_1' });
    expect(mockInvoke).toHaveBeenNthCalledWith(6, 'workspace_get_active_id');
    expect(mockInvoke).toHaveBeenNthCalledWith(7, 'workspace_archive', { id: 'ws_1' });
    expect(mockInvoke).toHaveBeenNthCalledWith(8, 'workspace_delete', {
      id: 'ws_1',
      removeFiles: true,
    });
  });

  test('throws on invalid payloads', async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValueOnce([{ name: 'missing required fields' }])
      .mockResolvedValueOnce([{ url: 123 }])
      .mockResolvedValueOnce(123);
    const client = createTauriWorkspaceClient(mockInvoke);

    await expect(client.list()).rejects.toThrow();
    await expect(client.listGitHubRepos()).rejects.toThrow();
    await expect(client.getActiveId()).rejects.toThrow();
  });

  test('can be constructed with default invoke function', () => {
    const client = createTauriWorkspaceClient();
    expect(typeof client.list).toBe('function');
    expect(typeof client.createLocal).toBe('function');
  });
});
