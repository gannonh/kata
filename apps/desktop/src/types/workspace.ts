import { z } from 'zod';

export const WorkspaceStatusSchema = z.enum([
  'ready',
  'creating',
  'error',
  'archived',
]);
export const WorkspaceSourceTypeSchema = z.enum(['local', 'github']);

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: WorkspaceSourceTypeSchema,
  source: z.string().min(1),
  repoRootPath: z.string().min(1),
  worktreePath: z.string().min(1),
  branch: z.string().min(1),
  baseRef: z.string().nullish(),
  status: WorkspaceStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastOpenedAt: z.string().datetime().nullish(),
});

export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;
export type WorkspaceSourceType = z.infer<typeof WorkspaceSourceTypeSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;

export function isGitHubRepoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com';
  } catch {
    return false;
  }
}

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
}

export function deriveWorkspaceBranchName(name: string, suffix: string): string {
  return `workspace/${toSlug(name)}-${suffix}`;
}

export function deriveNameFromIdentifier(value: string): string {
  const segment = value.trim().split('/').filter(Boolean).at(-1)?.replace(/\.git$/i, '').trim() ?? '';
  return segment || 'Workspace';
}
