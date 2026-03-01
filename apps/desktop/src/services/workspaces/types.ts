import type { Workspace } from '../../types/workspace';

export interface GitHubRepoOption {
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
  updatedAt: string;
}

export interface WorkspaceKnownRepoOption {
  id: string;
  nameWithOwner: string;
  url: string;
  updatedAt: string;
}

export interface WorkspaceBranchOption {
  name: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface WorkspacePullRequestOption {
  number: number;
  title: string;
  headBranch: string;
  updatedAt: string;
}

export interface WorkspaceIssueOption {
  number: number;
  title: string;
  updatedAt: string;
}

export type WorkspaceCreateFromSource =
  | { type: 'default' }
  | { type: 'pull_request'; value: number }
  | { type: 'branch'; value: string }
  | { type: 'issue'; value: number };

export interface CreateWorkspaceFromSourceInput {
  repoId: string;
  workspaceName?: string;
  cloneRootPath?: string;
  source: WorkspaceCreateFromSource;
}

export interface CreateLocalWorkspaceInput {
  repoPath: string;
  workspaceName: string;
  branchName?: string;
  baseRef?: string;
}

export interface CreateGitHubWorkspaceInput {
  repoUrl: string;
  workspaceName: string;
  cloneRootPath?: string;
  branchName?: string;
  baseRef?: string;
}

export interface CreateNewGitHubWorkspaceInput {
  repositoryName: string;
  workspaceName: string;
  cloneRootPath?: string;
  branchName?: string;
  baseRef?: string;
}

export interface WorkspaceClient {
  list(): Promise<Workspace[]>;
  listGitHubRepos(query?: string): Promise<GitHubRepoOption[]>;
  listKnownRepos(query?: string): Promise<WorkspaceKnownRepoOption[]>;
  listRepoBranches(repoId: string, query?: string): Promise<WorkspaceBranchOption[]>;
  listRepoPullRequests(repoId: string, query?: string): Promise<WorkspacePullRequestOption[]>;
  listRepoIssues(repoId: string, query?: string): Promise<WorkspaceIssueOption[]>;
  createLocal(input: CreateLocalWorkspaceInput): Promise<Workspace>;
  createGitHub(input: CreateGitHubWorkspaceInput): Promise<Workspace>;
  createNewGitHub(input: CreateNewGitHubWorkspaceInput): Promise<Workspace>;
  createFromSource(input: CreateWorkspaceFromSourceInput): Promise<Workspace>;
  setActive(id: string): Promise<void>;
  getActiveId(): Promise<string | null>;
  archive(id: string): Promise<void>;
  remove(id: string, removeFiles: boolean): Promise<void>;
}
