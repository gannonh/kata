import { type KeyboardEvent } from 'react'

import { cn } from '../../lib/cn'

type SearchInputProps = {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search',
  ariaLabel,
  className
}: SearchInputProps) {
  const clearValue = (): void => {
    onValueChange('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && value) {
      event.preventDefault()
      clearValue()
    }
  }

  return (
    <div
      role="search"
      className={cn(
        'flex items-center gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)] px-3 py-2',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="font-display text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
      >
        Find
      </span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          onValueChange(event.target.value)
        }}
        className="w-full border-none bg-transparent font-body text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clearValue}
          className="rounded-md px-1.5 py-0.5 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--line)]/40 hover:text-[color:var(--text-primary)]"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
