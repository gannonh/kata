import type { GitFileState, GitSnapshot } from '../../types/git'

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
          className="font-body text-sm text-[color:var(--text-secondary)]"
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
      <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
        Changes
      </h2>
      <p className="mt-4 font-body text-sm text-[color:var(--text-primary)]">Branch: {git.branch}</p>
      <p className="font-body text-xs text-[color:var(--text-muted)]">
        ↑{git.ahead} ↓{git.behind}
      </p>

      <div className="mt-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)]/60 p-3">
        <h3 className="font-display text-sm uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
          Staged ({git.staged.length})
        </h3>
        {renderChanges(git.staged)}
      </div>

      <div className="mt-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)]/60 p-3">
        <h3 className="font-display text-sm uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
          Unstaged ({git.unstaged.length})
        </h3>
        {renderChanges(git.unstaged)}
      </div>

      <button
        type="button"
        disabled={git.staged.length === 0}
        className="mt-4 rounded-lg border border-[color:var(--line)] px-3 py-2 font-body text-sm text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Create Commit
      </button>
    </section>
  )
}
