export type GitFileState = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

export type GitFileChange = {
  path: string
  state: GitFileState
}

export type GitSnapshot = {
  branch: string
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
}
