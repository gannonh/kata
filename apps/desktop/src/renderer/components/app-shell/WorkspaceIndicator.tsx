import { useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  pickWorkspaceAtom,
  sessionListErrorAtom,
  switchWorkspaceAtom,
  workingDirectoryAtom,
} from '@/atoms/session'
import { Button } from '@/components/ui/button'

function formatWorkspaceLabel(workspacePath: string): string {
  if (!workspacePath) {
    return 'Select workspace'
  }

  const segments = workspacePath.split('/').filter(Boolean)
  const tail = segments.slice(-2)

  if (tail.length === 0) {
    return workspacePath
  }

  return tail.join(' / ')
}

export function WorkspaceIndicator() {
  const workingDirectory = useAtomValue(workingDirectoryAtom)
  const pickWorkspace = useSetAtom(pickWorkspaceAtom)
  const switchWorkspace = useSetAtom(switchWorkspaceAtom)
  const setSessionError = useSetAtom(sessionListErrorAtom)

  const workspaceLabel = useMemo(
    () => formatWorkspaceLabel(workingDirectory),
    [workingDirectory],
  )

  const handlePickWorkspace = async (): Promise<void> => {
    try {
      const selected = await pickWorkspace()
      if (!selected) {
        return
      }

      await switchWorkspace(selected.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSessionError(`Unable to switch workspace: ${message}`)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void handlePickWorkspace()
      }}
      title={workingDirectory || 'Select working directory'}
      className="max-w-[18rem] justify-start"
    >
      <FolderOpen data-icon="inline-start" />
      <span className="truncate">{workspaceLabel}</span>
    </Button>
  )
}
