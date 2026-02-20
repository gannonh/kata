import type { GitSnapshot } from '../types/git'

export const mockGit: GitSnapshot = {
  branch: 'feat/wave-2A-contracts',
  ahead: 2,
  behind: 0,
  staged: [
    {
      path: 'src/renderer/components/shared/TabBar.tsx',
      state: 'added'
    }
  ],
  unstaged: [
    {
      path: 'src/renderer/mock/project.ts',
      state: 'modified'
    },
    {
      path: 'src/renderer/components/shared/MarkdownRenderer.tsx',
      state: 'added'
    }
  ]
}
