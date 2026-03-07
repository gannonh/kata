/**
 * RightSidebar - Content router for right sidebar panels
 *
 * Routes to different panel types based on RightSidebarPanel discriminated union.
 * Similar to how MainContentPanel routes between different page types.
 */

import * as React from 'react'
import type { RightSidebarPanel } from '../../../shared/types'
import { SessionMetadataPanel } from '../right-sidebar/SessionMetadataPanel'

export interface RightSidebarProps {
  /** Current panel configuration */
  panel: RightSidebarPanel
  /** Session ID (required for session-specific panels) */
  sessionId?: string
  /** Close button to display in panel header */
  closeButton?: React.ReactNode
}

/**
 * Routes right sidebar content based on panel type
 */
export function RightSidebar({ panel, sessionId, closeButton }: RightSidebarProps) {
  switch (panel.type) {
    case 'sessionMetadata':
      return <SessionMetadataPanel sessionId={sessionId} closeButton={closeButton} />

    case 'files':
      // TODO: Implement SessionFilesPanel
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Files panel - Coming soon</p>
        </div>
      )

    case 'history':
      // TODO: Implement SessionHistoryPanel
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <p className="text-sm">History panel - Coming soon</p>
        </div>
      )

    case 'none':
    default:
      return null
  }
}
