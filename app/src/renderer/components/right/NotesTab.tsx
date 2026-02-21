import { Textarea } from '../ui/textarea'

type NotesTabProps = {
  notes: string
  onNotesChange: (notes: string) => void
}

export function NotesTab({ notes, onNotesChange }: NotesTabProps) {
  return (
    <div className="grid h-full gap-3">
      <label
        htmlFor="project-notes"
        className="text-sm font-medium"
      >
        Project notes
      </label>
      <Textarea
        id="project-notes"
        className="min-h-48 w-full resize-y"
        value={notes}
        placeholder="Capture open questions, risks, and follow-up notes."
        onChange={(event) => {
          onNotesChange(event.currentTarget.value)
        }}
      />
    </div>
  )
}
