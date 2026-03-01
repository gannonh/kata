import { invoke as defaultInvoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { WorkspaceSchema } from '../../types/workspace';
import type {
  CreateWorkspaceFromSourceInput,
  CreateGitHubWorkspaceInput,
  CreateLocalWorkspaceInput,
  CreateNewGitHubWorkspaceInput,
  GitHubRepoOption,
  WorkspaceBranchOption,
  WorkspaceClient,
  WorkspaceIssueOption,
  WorkspaceKnownRepoOption,
  WorkspacePullRequestOption,
} from './types';

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const WorkspaceListSchema = z.array(WorkspaceSchema);
const GitHubRepoOptionSchema = z.object({
  nameWithOwner: z.string().min(1),
  url: z.string().url(),
  isPrivate: z.boolean(),
  updatedAt: z.string(),
});
const GitHubRepoListSchema = z.array(GitHubRepoOptionSchema);
const WorkspaceKnownRepoOptionSchema = z.object({
  id: z.string().min(1),
  nameWithOwner: z.string().min(1),
  url: z.string().url(),
  updatedAt: z.string(),
});
const WorkspaceKnownRepoListSchema = z.array(WorkspaceKnownRepoOptionSchema);
const WorkspaceBranchOptionSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean(),
  updatedAt: z.string(),
});
const WorkspaceBranchListSchema = z.array(WorkspaceBranchOptionSchema);
const WorkspacePullRequestOptionSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  headBranch: z.string().min(1),
  updatedAt: z.string(),
});
const WorkspacePullRequestListSchema = z.array(WorkspacePullRequestOptionSchema);
const WorkspaceIssueOptionSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  updatedAt: z.string(),
});
const WorkspaceIssueListSchema = z.array(WorkspaceIssueOptionSchema);
const WorkspaceCreateFromSourceInputSchema = z.object({
  repoId: z.string().min(1),
  workspaceName: z.string().optional(),
  cloneRootPath: z.string().optional(),
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('default') }),
    z.object({ type: z.literal('pull_request'), value: z.number().int().positive() }),
    z.object({ type: z.literal('branch'), value: z.string().min(1) }),
    z.object({ type: z.literal('issue'), value: z.number().int().positive() }),
  ]),
});

export function createTauriWorkspaceClient(
  invokeFn: InvokeFn = defaultInvoke,
): WorkspaceClient {
  return {
    list: async () => WorkspaceListSchema.parse(await invokeFn('workspace_list')),
    listKnownRepos: async (query?: string): Promise<WorkspaceKnownRepoOption[]> =>
      WorkspaceKnownRepoListSchema.parse(
        await invokeFn('workspace_list_known_repos', {
          query: query?.trim() || null,
        }),
      ),
    listRepoBranches: async (repoId: string, query?: string): Promise<WorkspaceBranchOption[]> =>
      WorkspaceBranchListSchema.parse(
        await invokeFn('workspace_list_repo_branches', {
          repoId,
          query: query?.trim() || null,
        }),
      ),
    listRepoPullRequests: async (
      repoId: string,
      query?: string,
    ): Promise<WorkspacePullRequestOption[]> =>
      WorkspacePullRequestListSchema.parse(
        await invokeFn('workspace_list_repo_pull_requests', {
          repoId,
          query: query?.trim() || null,
        }),
      ),
    listRepoIssues: async (repoId: string, query?: string): Promise<WorkspaceIssueOption[]> =>
      WorkspaceIssueListSchema.parse(
        await invokeFn('workspace_list_repo_issues', {
          repoId,
          query: query?.trim() || null,
        }),
      ),
    listGitHubRepos: async (query?: string): Promise<GitHubRepoOption[]> =>
      GitHubRepoListSchema.parse(
        await invokeFn('workspace_list_github_repos', {
          query: query?.trim() || null,
        }),
      ),
    createLocal: async (input: CreateLocalWorkspaceInput) =>
      WorkspaceSchema.parse(await invokeFn('workspace_create_local', { input })),
    createGitHub: async (input: CreateGitHubWorkspaceInput) =>
      WorkspaceSchema.parse(await invokeFn('workspace_create_github', { input })),
    createNewGitHub: async (input: CreateNewGitHubWorkspaceInput) =>
      WorkspaceSchema.parse(await invokeFn('workspace_create_new_github', { input })),
    createFromSource: async (input: CreateWorkspaceFromSourceInput) =>
      WorkspaceSchema.parse(
        await invokeFn('workspace_create_from_source', {
          input: WorkspaceCreateFromSourceInputSchema.parse(input),
        }),
      ),
    setActive: async (id: string) => {
      await invokeFn('workspace_set_active', { id });
    },
    getActiveId: async () =>
      z.string().nullable().parse(await invokeFn('workspace_get_active_id')),
    archive: async (id: string) => {
      await invokeFn('workspace_archive', { id });
    },
    remove: async (id: string, removeFiles: boolean) => {
      await invokeFn('workspace_delete', { id, removeFiles });
    },
  };
}
