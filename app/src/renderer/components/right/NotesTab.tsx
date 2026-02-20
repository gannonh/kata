type NotesTabProps = {
  notes: string
  onNotesChange: (notes: string) => void
}

export function NotesTab({ notes, onNotesChange }: NotesTabProps) {
  return (
    <div className="grid h-full gap-3">
      <label
        htmlFor="project-notes"
        className="font-display text-sm uppercase tracking-[0.16em] text-[color:var(--text-primary)]"
      >
        Project notes
      </label>
      <textarea
        id="project-notes"
        className="min-h-48 w-full resize-y rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)]/40 p-3 font-body text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--line-strong)]"
        value={notes}
        placeholder="Capture open questions, risks, and follow-up notes."
        onChange={(event) => {
          onNotesChange(event.currentTarget.value)
        }}
      />
    </div>
  )
}
