import type { GitFileState, GitSnapshot } from '../../types/git'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type ChangesTabProps = {
  git: GitSnapshot
}

const stateIcon: Record<GitFileState, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?'
}

function renderChanges(items: GitSnapshot['staged']) {
  return (
    <ul className="mt-2 grid gap-1">
      {items.map((item) => (
        <li
          key={`${item.state}:${item.path}`}
          className="text-sm text-muted-foreground"
        >
          {stateIcon[item.state]} {item.path}
        </li>
      ))}
    </ul>
  )
}

export function ChangesTab({ git }: ChangesTabProps) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">
        Changes
      </h2>
      <p className="mt-4 text-sm">Branch: {git.branch}</p>
      <p className="text-xs text-muted-foreground">
        ↑{git.ahead} ↓{git.behind}
      </p>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Staged ({git.staged.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChanges(git.staged)}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Unstaged ({git.unstaged.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChanges(git.unstaged)}
        </CardContent>
      </Card>

      <Button
        type="button"
        variant="outline"
        disabled={git.staged.length === 0}
        className="mt-4"
      >
        Create Commit
      </Button>
    </section>
  )
}
