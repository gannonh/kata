import { useAtomValue, useSetAtom } from 'jotai'
import {
  archivedSessionsForSettingsAtom,
  unarchiveSessionAtom,
} from '@/atoms/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const ARCHIVE_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatArchiveDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return ARCHIVE_DATE_FORMATTER.format(date)
}

export function ArchivedChatsPanel() {
  const archivedSessions = useAtomValue(archivedSessionsForSettingsAtom)
  const unarchiveSession = useSetAtom(unarchiveSessionAtom)

  return (
    <Card className="border border-border bg-card/60 py-0">
      <CardHeader className="flex flex-col gap-2 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm text-foreground">Archived chats</CardTitle>
          <Badge variant="secondary" className="font-normal">
            {archivedSessions.length}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Archived chats are hidden from the sidebar until you unarchive them.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-4 pt-2">
        {archivedSessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No archived chats yet.</p>
        ) : (
          archivedSessions.map((chat) => (
            <div
              key={`${chat.projectDir}::${chat.sessionId}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-3"
            >
              <div className="min-w-0 flex flex-col gap-1">
                <p
                  className="text-xs font-medium text-foreground [overflow-wrap:anywhere]"
                  title={chat.title}
                >
                  {chat.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Archived {formatArchiveDate(chat.archivedAt)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground" title={chat.projectDir}>
                  {chat.projectDir}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  unarchiveSession({
                    sessionId: chat.sessionId,
                    projectDir: chat.projectDir,
                  })
                }}
              >
                Unarchive
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
