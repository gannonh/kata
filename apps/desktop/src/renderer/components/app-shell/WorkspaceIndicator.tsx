import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  pickWorkspaceAtom,
  switchWorkspaceAtom,
  workingDirectoryAtom,
} from '@/atoms/session'

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

  const workspaceLabel = useMemo(
    () => formatWorkspaceLabel(workingDirectory),
    [workingDirectory],
  )

  const handlePickWorkspace = async (): Promise<void> => {
    const selected = await pickWorkspace()
    if (!selected) {
      return
    }

    await switchWorkspace(selected.path)
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handlePickWorkspace()
      }}
      title={workingDirectory || 'Select working directory'}
      className="max-w-[18rem] truncate rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
    >
      📁 {workspaceLabel}
    </button>
  )
}
